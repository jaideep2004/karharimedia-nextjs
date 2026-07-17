import 'server-only';

import * as archiverModule from 'archiver';
import type { Archiver } from 'archiver';
import ExcelJS from 'exceljs';
import fs from 'fs';
import { ObjectId, type Db } from 'mongodb';
import path from 'path';
import { connectToDatabase } from '@/utils/mongodb';
import { asString } from '@/lib/musicPublishing';
import { hydrateReleasesWithCanonicalTracks } from '@/lib/repositories/tracks';
import { releasesCollection } from '@/lib/repositories/releases';

export type CatalogExportState =
  | 'queued'
  | 'running'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed';

export type CatalogExportPart = {
  name: string;
  type: 'metadata' | 'tracks';
  path: string;
  size: number;
  trackCount: number;
  createdAt: Date;
};

type CatalogExportCounts = {
  releases: number;
  tracks: number;
  files: number;
  missing: number;
  parts: number;
};

export type CatalogExportJob = {
  _id: ObjectId;
  scope: CatalogExportScope;
  criteria?: CatalogExportCriteria;
  state: CatalogExportState;
  createdBy: string;
  createdByEmail?: string;
  counts: CatalogExportCounts;
  parts: CatalogExportPart[];
  errors: string[];
  warnings: string[];
  startedAt?: Date;
  completedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ExportUser = {
  _id: string;
  email?: string;
};

export type CatalogExportScope = 'release' | 'user' | 'users' | 'status';
export type CatalogExportStatus = 'approved' | 'pending' | 'rejected';
export type CatalogExportCriteria = {
  releaseIds?: string[];
  userId?: string;
  userIds?: string[];
  statuses?: CatalogExportStatus[];
  zipGrouping?: 'per_release' | 'per_user';
};

type TrackFileResolution =
  | { ok: true; path: string; size: number; extension: string }
  | { ok: false; reason: string; source: string };

const runningJobs = new Set<string>();
const EXPORT_COLLECTION = 'catalogExportJobs';
const DEFAULT_EXPORT_TTL_DAYS = 7;
const DEFAULT_BATCH_SIZE = 100;
const ZipArchive = (archiverModule as unknown as {
  ZipArchive: new (options: Record<string, unknown>) => Archiver;
}).ZipArchive;

const releaseColumns = [
  { header: 'Release ID', key: 'releaseId', width: 28 },
  { header: 'Release Title', key: 'releaseTitle', width: 36 },
  { header: 'Release Type', key: 'releaseType', width: 18 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'UPC', key: 'upc', width: 20 },
  { header: 'Primary Artist', key: 'primaryArtist', width: 28 },
  { header: 'Label', key: 'label', width: 28 },
  { header: 'User Name', key: 'userName', width: 24 },
  { header: 'User Email', key: 'userEmail', width: 30 },
  { header: 'Owner Name', key: 'ownerName', width: 24 },
  { header: 'Owner Email', key: 'ownerEmail', width: 30 },
  { header: 'Release Date', key: 'releaseDate', width: 20 },
  { header: 'Stores', key: 'stores', width: 42 },
  { header: 'Track Count', key: 'trackCount', width: 14 },
  { header: 'Created At', key: 'createdAt', width: 24 },
  { header: 'Updated At', key: 'updatedAt', width: 24 },
];

const trackColumns = [
  { header: 'Release ID', key: 'releaseId', width: 28 },
  { header: 'Release Title', key: 'releaseTitle', width: 36 },
  { header: 'Release UPC', key: 'releaseUpc', width: 20 },
  { header: 'User Name', key: 'userName', width: 24 },
  { header: 'User Email', key: 'userEmail', width: 30 },
  { header: 'Track Number', key: 'trackNumber', width: 14 },
  { header: 'Disc Number', key: 'discNumber', width: 12 },
  { header: 'Track Title', key: 'title', width: 36 },
  { header: 'Version', key: 'version', width: 20 },
  { header: 'Artist', key: 'artist', width: 28 },
  { header: 'Featuring', key: 'featuring', width: 28 },
  { header: 'ISRC', key: 'isrc', width: 20 },
  { header: 'Genre', key: 'genre', width: 20 },
  { header: 'Subgenre', key: 'subgenre', width: 20 },
  { header: 'Duration', key: 'duration', width: 14 },
  { header: 'Explicit', key: 'explicit', width: 12 },
  { header: 'Composers', key: 'composers', width: 34 },
  { header: 'Lyricists', key: 'lyricists', width: 34 },
  { header: 'Publishers', key: 'publishers', width: 34 },
  { header: 'Producers', key: 'producers', width: 34 },
  { header: 'Audio File', key: 'audioFile', width: 46 },
  { header: 'Audio URL', key: 'audioUrl', width: 58 },
  { header: 'Archive Path', key: 'archivePath', width: 72 },
];

const missingColumns = [
  { header: 'Release ID', key: 'releaseId', width: 28 },
  { header: 'Release Title', key: 'releaseTitle', width: 36 },
  { header: 'Track Title', key: 'trackTitle', width: 36 },
  { header: 'ISRC', key: 'isrc', width: 20 },
  { header: 'Source', key: 'source', width: 58 },
  { header: 'Reason', key: 'reason', width: 42 },
];

function getExportCollection(db: Db) {
  return db.collection<CatalogExportJob>(EXPORT_COLLECTION);
}

export async function ensureCatalogExportIndexes(db: Db) {
  const collection = getExportCollection(db);
  await Promise.all([
    collection.createIndex({ createdAt: -1 }),
    collection.createIndex({ state: 1, createdAt: -1 }),
    collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export function getCatalogExportRoot() {
  if (process.env.CATALOG_EXPORT_DIR) {
    return path.resolve(process.env.CATALOG_EXPORT_DIR);
  }

  return path.join(/*turbopackIgnore: true*/ process.cwd(), 'private-exports', 'catalog');
}

function getTrackSearchRoots() {
  return [
    process.env.CATALOG_EXPORT_TRACKS_DIR,
    path.join(/*turbopackIgnore: true*/ process.cwd(), 'uploads', 'tracks'),
    path.join(/*turbopackIgnore: true*/ process.cwd(), 'server', 'uploads', 'tracks'),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => path.resolve(value));
}

function getBatchSize() {
  return Math.max(10, Number(process.env.CATALOG_EXPORT_BATCH_SIZE || DEFAULT_BATCH_SIZE));
}

function getExpiryDate() {
  const days = Math.max(1, Number(process.env.CATALOG_EXPORT_TTL_DAYS || DEFAULT_EXPORT_TTL_DAYS));
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function sanitizeArchiveSegment(value: unknown, fallback: string) {
  const cleaned = String(value || fallback)
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 120);

  return cleaned || fallback;
}

function fileNameFromSource(source: string) {
  const trimmed = source.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    return path.basename(decodeURIComponent(url.pathname));
  } catch {
    return path.basename(trimmed.replace(/\\/g, '/'));
  }
}

function isExternalOnly(source: string) {
  if (!/^https?:\/\//i.test(source)) return false;

  try {
    const url = new URL(source);
    return !url.pathname.includes('/uploads/tracks/');
  } catch {
    return true;
  }
}

function isR2Url(url: string): boolean {
  const r2Domain = process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN || '';
  if (!r2Domain) return false;
  try {
    return new URL(url).hostname === r2Domain;
  } catch {
    return false;
  }
}

export async function resolveTrackFile(track: Record<string, unknown>): Promise<TrackFileResolution> {
  const sources = [asString(track.audioFile), asString(track.audioUrl), asString(track.audio)]
    .map((value) => value.trim())
    .filter(Boolean);

  if (!sources.length) {
    return { ok: false, reason: 'No local audio filename or URL stored', source: '' };
  }

  let lastFailure = { reason: 'Local audio file not found', source: sources[0] };

  for (const source of sources) {
    if (isR2Url(source)) {
      lastFailure = { reason: 'R2-hosted audio file — download separately from bucket', source };
      continue;
    }

    if (isExternalOnly(source)) {
      lastFailure = { reason: 'External audio URL skipped in v1 export', source };
      continue;
    }

    const filename = fileNameFromSource(source);
    if (!filename) {
      lastFailure = { reason: 'Audio filename could not be parsed', source };
      continue;
    }

    for (const root of getTrackSearchRoots()) {
      const candidate = path.resolve(root, filename);
      if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) continue;

      try {
        const stats = await fs.promises.stat(candidate);
        if (stats.isFile()) {
          return {
            ok: true,
            path: candidate,
            size: stats.size,
            extension: path.extname(candidate) || '.bin',
          };
        }
      } catch {
        lastFailure = { reason: 'Local audio file not found', source };
      }
    }
  }

  return { ok: false, ...lastFailure };
}

function createWorkbook(filename: string, worksheetName: string, columns: ExcelJS.Column[]) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename,
    useStyles: false,
    useSharedStrings: false,
  });
  const worksheet = workbook.addWorksheet(worksheetName);
  worksheet.columns = columns;
  return { workbook, worksheet };
}

function releaseRow(release: Record<string, unknown>) {
  const tracks = Array.isArray(release.tracks) ? release.tracks : [];
  const userName = asString(release.ownerName || release.ownerArtistName);
  const userEmail = asString(release.ownerEmail);
  return {
    releaseId: asString(release._id),
    releaseTitle: asString(release.releaseTitle || release.title),
    releaseType: asString(release.releaseType),
    status: asString(release.status),
    upc: asString(release.upc),
    primaryArtist: asString(release.primaryArtist),
    label: asString(release.label),
    userName,
    userEmail,
    ownerName: userName,
    ownerEmail: userEmail,
    releaseDate: asString(release.releaseDate),
    stores: asString(release.stores),
    trackCount: tracks.length,
    createdAt: asString(release.createdAt),
    updatedAt: asString(release.updatedAt),
  };
}

function lyricistsFrom(track: Record<string, unknown>) {
  const contributors = Array.isArray(track.contributors) ? track.contributors : [];
  return contributors
    .filter((item) => typeof item === 'object' && item && (item as Record<string, unknown>).role === 'lyricist')
    .map((item) => asString((item as Record<string, unknown>).name))
    .filter(Boolean)
    .join(', ');
}

function trackRow(
  release: Record<string, unknown>,
  track: Record<string, unknown>,
  index: number,
  archivePath = ''
) {
  const userName = asString(release.ownerName || release.ownerArtistName);
  const userEmail = asString(release.ownerEmail);
  return {
    releaseId: asString(release._id),
    releaseTitle: asString(release.releaseTitle || release.title),
    releaseUpc: asString(release.upc),
    userName,
    userEmail,
    trackNumber: asString(track.trackNumber || index + 1),
    discNumber: asString(track.discNumber || 1),
    title: asString(track.title),
    version: asString(track.version),
    artist: asString(track.artist || release.primaryArtist),
    featuring: asString(track.featuring),
    isrc: asString(track.isrc),
    genre: asString(track.genre),
    subgenre: asString(track.subgenre),
    duration: asString(track.duration),
    explicit: track.explicit ? 'Yes' : 'No',
    composers: asString(track.composers),
    lyricists: lyricistsFrom(track),
    publishers: asString(track.publishers || track.publisher),
    producers: asString(track.producers),
    audioFile: asString(track.audioFile),
    audioUrl: asString(track.audioUrl),
    archivePath,
  };
}

function createArchivePath(
  release: Record<string, unknown>,
  track: Record<string, unknown>,
  index: number,
  extension: string
) {
  const releaseId = asString(release._id);
  const releaseDir = sanitizeArchiveSegment(release.releaseTitle || release.title, releaseId || 'release');
  const trackTitle = sanitizeArchiveSegment(track.title, `track-${index + 1}`);
  const isrc = sanitizeArchiveSegment(track.isrc, '').slice(0, 24);
  const suffix = isrc ? `-${isrc}` : '';
  const fileBase = `${String(index + 1).padStart(2, '0')}-${trackTitle}${suffix}`;
  return path.posix.join('tracks', releaseDir, `${fileBase}${extension}`);
}

function createReleaseZipName(release: Record<string, unknown>, index: number) {
  const releaseId = asString(release._id);
  const title = sanitizeArchiveSegment(release.releaseTitle || release.title, releaseId || `release-${index + 1}`);
  const suffix = releaseId ? `-${releaseId.slice(-6)}` : `-${index + 1}`;
  return `${title}${suffix}.zip`;
}

function getReleaseUserId(release: Record<string, unknown>) {
  return asString(release.ownerUserId || release.userId || release.artistId || release.ownerId || release.createdBy);
}

function getReleaseUserInfo(release: Record<string, unknown>) {
  const id = getReleaseUserId(release);
  const name = asString(release.ownerName || release.ownerArtistName) || id || 'unknown-user';
  const email = asString(release.ownerEmail);
  return { id, name, email };
}

function createUserZipName(user: { id: string; name: string; email: string }, index: number) {
  const base = sanitizeArchiveSegment(
    [user.name, user.email].filter(Boolean).join(' - '),
    user.id || `user-${index + 1}`
  );
  const suffix = user.id ? `-${user.id.slice(-6)}` : `-${index + 1}`;
  return `${base}${suffix}.zip`;
}

function buildReleaseQuery(job: CatalogExportJob) {
  const criteria = job.criteria || {};
  const query: Record<string, unknown> = {};
  const releaseIds = (criteria.releaseIds || [])
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  if (job.scope === 'release') {
    query._id = { $in: releaseIds.length ? releaseIds : [new ObjectId()] };
    return query;
  }

  if (releaseIds.length) {
    query._id = { $in: releaseIds };
  }

  if ((job.scope === 'user' && criteria.userId) || (job.scope === 'users' && criteria.userIds?.length)) {
    const userIds = job.scope === 'users'
      ? (criteria.userIds || []).filter(Boolean)
      : [criteria.userId as string];
    query.$or = [
      { ownerUserId: { $in: userIds } },
      { userId: { $in: userIds } },
      { artistId: { $in: userIds } },
      { ownerId: { $in: userIds } },
      { createdBy: { $in: userIds } },
    ];
  }

  const statuses = criteria.statuses?.length ? criteria.statuses : ['approved'];
  if (statuses.length < 3) {
    query.status = { $in: statuses };
  }

  return query;
}

function writeJsonFile(filename: string, value: unknown) {
  return fs.promises.writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function zipFiles(
  zipPath: string,
  files: Array<{ sourcePath: string; archivePath: string }>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 6 }, forceZip64: true });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', reject);
    archive.pipe(output);

    files.forEach((file) => archive.file(file.sourcePath, { name: file.archivePath }));
    archive.finalize().catch(reject);
  });
}

async function createMetadataZip(params: {
  jobDir: string;
  releasesPath: string;
  tracksPath: string;
  missingPath: string;
  manifestPath: string;
}) {
  const zipPath = path.join(params.jobDir, 'catalog-metadata.zip');
  await zipFiles(zipPath, [
    { sourcePath: params.releasesPath, archivePath: 'metadata/releases.xlsx' },
    { sourcePath: params.tracksPath, archivePath: 'metadata/tracks.xlsx' },
    { sourcePath: params.missingPath, archivePath: 'metadata/missing-files.xlsx' },
    { sourcePath: params.manifestPath, archivePath: 'manifest.json' },
  ]);

  const stats = await fs.promises.stat(zipPath);
  return {
    name: 'catalog-metadata.zip',
    type: 'metadata' as const,
    path: zipPath,
    size: stats.size,
    trackCount: 0,
    createdAt: new Date(),
  };
}

async function createReleasePartZip(params: {
  jobDir: string;
  release: Record<string, unknown>;
  releaseIndex: number;
  rows: Array<Record<string, unknown>>;
  files: Array<{ sourcePath: string; archivePath: string }>;
}) {
  const safeBase = createReleaseZipName(params.release, params.releaseIndex).replace(/\.zip$/i, '');
  const tracksPath = path.join(params.jobDir, `${safeBase}-tracks.xlsx.tmp`);
  const releaseJsonPath = path.join(params.jobDir, `${safeBase}-release.json.tmp`);
  const zipPath = path.join(params.jobDir, `${safeBase}.zip`);

  const trackBook = createWorkbook(tracksPath, 'Tracks', trackColumns as ExcelJS.Column[]);
  params.rows.forEach((row) => trackBook.worksheet.addRow(row).commit());
  await trackBook.workbook.commit();

  await writeJsonFile(releaseJsonPath, {
    release: releaseRow(params.release),
    tracks: params.rows,
  });

  await zipFiles(zipPath, [
    { sourcePath: releaseJsonPath, archivePath: 'metadata/release.json' },
    { sourcePath: tracksPath, archivePath: 'metadata/tracks.xlsx' },
    ...params.files,
  ]);

  await Promise.all([
    fs.promises.unlink(tracksPath).catch(() => undefined),
    fs.promises.unlink(releaseJsonPath).catch(() => undefined),
  ]);

  const stats = await fs.promises.stat(zipPath);
  return {
    name: path.basename(zipPath),
    type: 'tracks' as const,
    path: zipPath,
    size: stats.size,
    trackCount: params.rows.length,
    createdAt: new Date(),
  };
}

type UserExportGroup = {
  user: { id: string; name: string; email: string };
  releaseRows: Array<Record<string, unknown>>;
  trackRows: Array<Record<string, unknown>>;
  missingRows: Array<Record<string, unknown>>;
  files: Array<{ sourcePath: string; archivePath: string }>;
};

async function createUserZip(params: {
  jobDir: string;
  group: UserExportGroup;
  userIndex: number;
}) {
  const safeBase = createUserZipName(params.group.user, params.userIndex).replace(/\.zip$/i, '');
  const releasesPath = path.join(params.jobDir, `${safeBase}-releases.xlsx.tmp`);
  const tracksPath = path.join(params.jobDir, `${safeBase}-tracks.xlsx.tmp`);
  const missingPath = path.join(params.jobDir, `${safeBase}-missing.xlsx.tmp`);
  const userJsonPath = path.join(params.jobDir, `${safeBase}-user.json.tmp`);
  const zipPath = path.join(params.jobDir, `${safeBase}.zip`);

  const releaseBook = createWorkbook(releasesPath, 'Releases', releaseColumns as ExcelJS.Column[]);
  params.group.releaseRows.forEach((row) => releaseBook.worksheet.addRow(row).commit());
  await releaseBook.workbook.commit();

  const trackBook = createWorkbook(tracksPath, 'Tracks', trackColumns as ExcelJS.Column[]);
  params.group.trackRows.forEach((row) => trackBook.worksheet.addRow(row).commit());
  await trackBook.workbook.commit();

  const missingBook = createWorkbook(missingPath, 'Missing Files', missingColumns as ExcelJS.Column[]);
  params.group.missingRows.forEach((row) => missingBook.worksheet.addRow(row).commit());
  await missingBook.workbook.commit();

  await writeJsonFile(userJsonPath, {
    user: params.group.user,
    counts: {
      releases: params.group.releaseRows.length,
      tracks: params.group.trackRows.length,
      files: params.group.files.length,
      missing: params.group.missingRows.length,
    },
  });

  await zipFiles(zipPath, [
    { sourcePath: userJsonPath, archivePath: 'metadata/user.json' },
    { sourcePath: releasesPath, archivePath: 'metadata/releases.xlsx' },
    { sourcePath: tracksPath, archivePath: 'metadata/tracks.xlsx' },
    { sourcePath: missingPath, archivePath: 'metadata/missing-files.xlsx' },
    ...params.group.files,
  ]);

  await Promise.all([
    fs.promises.unlink(releasesPath).catch(() => undefined),
    fs.promises.unlink(tracksPath).catch(() => undefined),
    fs.promises.unlink(missingPath).catch(() => undefined),
    fs.promises.unlink(userJsonPath).catch(() => undefined),
  ]);

  const stats = await fs.promises.stat(zipPath);
  return {
    name: path.basename(zipPath),
    type: 'tracks' as const,
    path: zipPath,
    size: stats.size,
    trackCount: params.group.trackRows.length,
    createdAt: new Date(),
  };
}

async function createUsersParentZip(params: {
  jobDir: string;
  userZips: Array<{ name: string; path: string; trackCount: number }>;
  metadataPart: CatalogExportPart;
  manifestPath: string;
}) {
  const zipPath = path.join(params.jobDir, 'selected-users-catalog.zip');
  const files = [
    { sourcePath: params.manifestPath, archivePath: 'manifest.json' },
    { sourcePath: params.metadataPart.path, archivePath: 'metadata/catalog-metadata.zip' },
    ...params.userZips.map((zip) => ({
      sourcePath: zip.path,
      archivePath: path.posix.join('users', zip.name),
    })),
  ];

  await zipFiles(zipPath, files);
  const stats = await fs.promises.stat(zipPath);
  return {
    name: 'selected-users-catalog.zip',
    type: 'tracks' as const,
    path: zipPath,
    size: stats.size,
    trackCount: params.userZips.reduce((sum, zip) => sum + zip.trackCount, 0),
    createdAt: new Date(),
  };
}

async function updateJobProgress(
  db: Db,
  jobId: ObjectId,
  counts: CatalogExportCounts,
  force: boolean
) {
  if (!force && counts.tracks % 100 !== 0 && counts.releases % 25 !== 0) return;

  await getExportCollection(db).updateOne(
    { _id: jobId },
    {
      $set: {
        counts,
        updatedAt: new Date(),
      },
    }
  );
}

export async function createCatalogExportJob(
  db: Db,
  user: ExportUser,
  options: { scope?: CatalogExportScope; criteria?: CatalogExportCriteria } = {}
) {
  await ensureCatalogExportIndexes(db);
  const now = new Date();
  const scope = options.scope || 'status';
  const criteria: CatalogExportCriteria = {
    zipGrouping: 'per_release',
    ...(options.criteria || {}),
    statuses: options.criteria?.statuses?.length ? options.criteria.statuses : ['approved'],
  };
  const result = await getExportCollection(db).insertOne({
    _id: new ObjectId(),
    scope,
    criteria,
    state: 'queued',
    createdBy: String(user._id),
    createdByEmail: user.email,
    counts: { releases: 0, tracks: 0, files: 0, missing: 0, parts: 0 },
    parts: [],
    errors: [],
    warnings: [],
    expiresAt: getExpiryDate(),
    createdAt: now,
    updatedAt: now,
  });

  const jobId = result.insertedId.toHexString();
  void processCatalogExportJob(jobId).catch(() => undefined);
  return getExportCollection(db).findOne({ _id: result.insertedId });
}

export async function listCatalogExportJobs(db: Db, limit = 10) {
  await ensureCatalogExportIndexes(db);
  return getExportCollection(db)
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(50, Math.max(1, limit)))
    .toArray();
}

export async function getCatalogExportJob(db: Db, jobId: string) {
  if (!ObjectId.isValid(jobId)) return null;
  await ensureCatalogExportIndexes(db);
  return getExportCollection(db).findOne({ _id: new ObjectId(jobId) });
}

export async function getCatalogExportPart(db: Db, jobId: string, partName: string) {
  const job = await getCatalogExportJob(db, jobId);
  if (!job) return null;

  const root = getCatalogExportRoot();
  const part = job.parts.find((item) => item.name === partName);
  if (!part) return null;

  const resolved = path.resolve(part.path);
  if (!resolved.startsWith(`${root}${path.sep}`)) return null;

  return { job, part: { ...part, path: resolved } };
}

export async function processCatalogExportJob(jobId: string) {
  if (runningJobs.has(jobId) || !ObjectId.isValid(jobId)) return;
  runningJobs.add(jobId);

  const { db } = await connectToDatabase();
  const objectId = new ObjectId(jobId);
  const collection = getExportCollection(db);
  const now = new Date();
  const counts: CatalogExportCounts = { releases: 0, tracks: 0, files: 0, missing: 0, parts: 0 };
  const warnings: string[] = [];
  const parts: CatalogExportPart[] = [];
  const userGroups = new Map<string, UserExportGroup>();

  try {
    const lock = await collection.findOneAndUpdate(
      { _id: objectId, state: 'queued' },
      {
        $set: {
          state: 'running',
          startedAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!lock.value) return;

    const exportRoot = getCatalogExportRoot();
    const jobDir = path.join(exportRoot, jobId);
    await fs.promises.mkdir(jobDir, { recursive: true });

    const releasesPath = path.join(jobDir, 'releases.xlsx');
    const tracksPath = path.join(jobDir, 'tracks.xlsx');
    const missingPath = path.join(jobDir, 'missing-files.xlsx');
    const manifestPath = path.join(jobDir, 'manifest.json');

    const releaseBook = createWorkbook(releasesPath, 'Releases', releaseColumns as ExcelJS.Column[]);
    const trackBook = createWorkbook(tracksPath, 'Tracks', trackColumns as ExcelJS.Column[]);
    const missingBook = createWorkbook(missingPath, 'Missing Files', missingColumns as ExcelJS.Column[]);

    const job = lock.value as CatalogExportJob;
    const releases = releasesCollection(db)
      .find(
        buildReleaseQuery(job),
        {
          projection: {
            releaseTitle: 1,
            title: 1,
            releaseType: 1,
            status: 1,
            releaseDate: 1,
            originalReleaseDate: 1,
            label: 1,
            upc: 1,
            ownerName: 1,
            ownerArtistName: 1,
            ownerEmail: 1,
            ownerUserId: 1,
            userId: 1,
            artistId: 1,
            ownerId: 1,
            createdBy: 1,
            primaryArtist: 1,
            territories: 1,
            stores: 1,
            tracks: 1,
            updatedAt: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ _id: 1 })
      .batchSize(getBatchSize());

    for await (const rawRelease of releases) {
      const [release] = await hydrateReleasesWithCanonicalTracks(db, [rawRelease as Record<string, any> & { _id: ObjectId }]);
      const groupByUser =
        (job.scope === 'user' || job.scope === 'users') &&
        job.criteria?.zipGrouping === 'per_user';
      let userGroup: UserExportGroup | undefined;
      if (groupByUser) {
        const userInfo = getReleaseUserInfo(release);
        const userKey = userInfo.id || `unknown:${userInfo.email || userInfo.name}`;
        userGroup = userGroups.get(userKey);
        if (!userGroup) {
          userGroup = {
            user: userInfo,
            releaseRows: [],
            trackRows: [],
            missingRows: [],
            files: [],
          };
          userGroups.set(userKey, userGroup);
        }
      }
      const releaseIndex = counts.releases;
      counts.releases += 1;
      const currentReleaseRow = releaseRow(release);
      releaseBook.worksheet.addRow(currentReleaseRow).commit();
      userGroup?.releaseRows.push(currentReleaseRow);

      const tracks = Array.isArray(release.tracks) ? release.tracks : [];
      const releaseRows: Array<Record<string, unknown>> = [];
      const releaseFiles: Array<{ sourcePath: string; archivePath: string }> = [];
      for (const rawTrack of tracks) {
        const track = typeof rawTrack === 'object' && rawTrack ? rawTrack as Record<string, unknown> : {};
        const trackIndex = counts.tracks;
        counts.tracks += 1;
        const resolved = await resolveTrackFile(track);

        if (!resolved.ok) {
          counts.missing += 1;
          const missingRow = {
            releaseId: asString(release._id),
            releaseTitle: asString(release.releaseTitle || release.title),
            trackTitle: asString(track.title),
            isrc: asString(track.isrc),
            source: resolved.source,
            reason: resolved.reason,
          };
          missingBook.worksheet.addRow(missingRow).commit();
          userGroup?.missingRows.push(missingRow);
          const row = trackRow(release, track, trackIndex);
          trackBook.worksheet.addRow(row).commit();
          releaseRows.push(row);
          userGroup?.trackRows.push(row);
          await updateJobProgress(db, objectId, counts, false);
          continue;
        }

        const archivePath = createArchivePath(release, track, trackIndex, resolved.extension);
        const row = trackRow(release, track, trackIndex, archivePath);
        trackBook.worksheet.addRow(row).commit();
        releaseRows.push(row);
        userGroup?.trackRows.push(row);
        releaseFiles.push({ sourcePath: resolved.path, archivePath });
        userGroup?.files.push({ sourcePath: resolved.path, archivePath });
        counts.files += 1;
        await updateJobProgress(db, objectId, counts, false);
      }

      if (!groupByUser) {
        const releasePart = await createReleasePartZip({
          jobDir,
          release,
          releaseIndex,
          rows: releaseRows,
          files: releaseFiles,
        });
        parts.push(releasePart);
        counts.parts = parts.length;
        await collection.updateOne(
          { _id: objectId },
          { $set: { counts, parts, updatedAt: new Date() } }
        );
      } else {
        await updateJobProgress(db, objectId, counts, true);
      }
    }

    await Promise.all([
      releaseBook.workbook.commit(),
      trackBook.workbook.commit(),
      missingBook.workbook.commit(),
    ]);

    const manifest = {
      jobId,
      scope: job.scope,
      criteria: job.criteria,
      generatedAt: new Date().toISOString(),
      counts,
      parts: parts.map((part) => ({
        name: part.name,
        type: part.type,
        size: part.size,
        trackCount: part.trackCount,
      })),
      warnings,
    };
    await writeJsonFile(manifestPath, manifest);

    const metadataPart = await createMetadataZip({
      jobDir,
      releasesPath,
      tracksPath,
      missingPath,
      manifestPath,
    });
    parts.unshift(metadataPart);
    counts.parts = parts.length;

    if ((job.scope === 'user' || job.scope === 'users') && job.criteria?.zipGrouping === 'per_user') {
      const userZips: CatalogExportPart[] = [];
      let userIndex = 0;
      for (const group of userGroups.values()) {
        userZips.push(await createUserZip({ jobDir, group, userIndex }));
        userIndex += 1;
      }
      if (job.scope === 'user') {
        parts.push(...userZips);
      } else {
        const parentPart = await createUsersParentZip({
          jobDir,
          userZips,
          metadataPart,
          manifestPath,
        });
        parts.push(parentPart);
      }
      counts.parts = parts.length;
    }

    const state: CatalogExportState = counts.missing > 0 || warnings.length > 0
      ? 'completed_with_warnings'
      : 'completed';

    await collection.updateOne(
      { _id: objectId },
      {
        $set: {
          state,
          counts,
          parts,
          warnings,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Catalog export failed';
    await collection.updateOne(
      { _id: objectId },
      {
        $set: {
          state: 'failed',
          errors: [message],
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  } finally {
    runningJobs.delete(jobId);
  }
}
