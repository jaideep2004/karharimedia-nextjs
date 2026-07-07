import { Db, ObjectId, type AnyBulkWriteOperation } from 'mongodb';
import { asString, getMusicPublishingTrackKey } from '@/lib/musicPublishing';
import { getNormalizedReleaseStatus, RELEASE_STATUS_GROUPS, type ReleaseDisplayStatus } from '@/lib/releaseStatus';
import {
  listTrackAssetsForTrackIds,
  upsertTrackAssetsFromTracks,
  type TrackAssetDocument,
} from '@/lib/repositories/assets';
import {
  listTrackFingerprintsForTrackIds,
  upsertTrackFingerprintsFromTracks,
  type TrackFingerprintDocument,
} from '@/lib/repositories/fingerprints';

export type CanonicalTrackSource = 'release_embed' | 'standalone_upload';

export type CanonicalTrackDocument = {
  _id?: ObjectId;
  releaseId: ObjectId;
  ownerUserId?: string | ObjectId;
  organizationId?: ObjectId;
  title?: string;
  isrc?: string;
  genre?: string;
  audioFile?: string;
  artwork?: string;
  status?: string;
  publishingStatus?: 'pending' | 'approved' | 'completed';
  releaseTrackIndex: number;
  legacyTrackKey: string;
  source: CanonicalTrackSource;
  legacyMetadata: Record<string, unknown>;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ReleaseLike = Record<string, any> & {
  _id: ObjectId | string;
  tracks?: Record<string, unknown>[];
};

let indexesReady: Promise<void> | null = null;

export function tracksCollection(db: Db) {
  return db.collection<CanonicalTrackDocument>('tracks');
}

export type TrackListOptions = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
};

export type TrackListPage = {
  tracks: Record<string, any>[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  counts: Record<'all' | 'pending' | 'in_process' | 'approved' | 'rejected' | 'other', number>;
};

export async function ensureCanonicalTrackIndexes(db: Db) {
  if (!indexesReady) {
    const collection = tracksCollection(db);
    indexesReady = Promise.all([
      collection.createIndex({ releaseId: 1, releaseTrackIndex: 1 }),
      collection.createIndex(
        { releaseId: 1, legacyTrackKey: 1, source: 1 },
        { sparse: true, name: 'tracks_release_legacy_source_lookup' }
      ),
      collection.createIndex({ isrc: 1 }, { sparse: true }),
      collection.createIndex({ ownerUserId: 1 }),
      collection.createIndex({ organizationId: 1 }),
      collection.createIndex({ publishingStatus: 1 }),
      collection.createIndex({ deletedAt: 1 }, { sparse: true }),
    ]).then(() => undefined);
  }

  await indexesReady;
}

export function toObjectId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) return value;
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value);
  return null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizedStatusQuery(status: string) {
  const normalized = getNormalizedReleaseStatus(status);
  if (normalized === 'pending') {
    return {
      $or: [
        { status: { $in: RELEASE_STATUS_GROUPS.pending } },
        { status: { $exists: false } },
        { status: null },
      ],
    };
  }
  if (normalized === 'in_process' || normalized === 'approved' || normalized === 'rejected') {
    return { status: { $in: RELEASE_STATUS_GROUPS[normalized] } };
  }
  return {};
}

function buildReleaseTrackQuery(
  baseQuery: Record<string, any>,
  options: Pick<TrackListOptions, 'status' | 'search'>,
  includeStatus = true
) {
  const clauses: Record<string, any>[] = [baseQuery, { tracks: { $type: 'array', $ne: [] } }];
  const search = String(options.search || '').trim();

  if (includeStatus && options.status && options.status !== 'all') {
    const statusClause = normalizedStatusQuery(options.status);
    if (Object.keys(statusClause).length) clauses.push(statusClause);
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    clauses.push({
      $or: [
        { releaseTitle: regex },
        { title: regex },
        { primaryArtist: regex },
        { artist: regex },
        { label: regex },
        { upc: regex },
        { 'tracks.title': regex },
        { 'tracks.name': regex },
        { 'tracks.artist': regex },
        { 'tracks.isrc': regex },
        { 'tracks.ISRC': regex },
      ],
    });
  }

  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function projectTrackRowStage() {
  return {
    $project: {
      _id: {
        $concat: [
          { $toString: '$_id' },
          ':',
          { $toString: '$trackIndex' },
        ],
      },
      releaseId: { $toString: '$_id' },
      releaseObjectId: '$_id',
      trackIndex: 1,
      title: { $ifNull: ['$track.title', { $ifNull: ['$track.name', 'Untitled Track'] }] },
      artist: { $ifNull: ['$track.artist', { $ifNull: ['$primaryArtist', { $ifNull: ['$artist', 'Unknown artist'] }] }] },
      releaseTitle: { $ifNull: ['$releaseTitle', { $ifNull: ['$title', 'Untitled Release'] }] },
      releaseType: { $ifNull: ['$releaseType', '$type'] },
      ownerUserId: { $ifNull: ['$ownerUserId', { $ifNull: ['$userId', { $ifNull: ['$artistId', { $ifNull: ['$ownerId', '$createdBy'] }] }] }] },
      ownerName: 1,
      ownerEmail: 1,
      artworkUrl: { $ifNull: ['$track.artworkUrl', { $ifNull: ['$track.artwork', '$artworkUrl'] }] },
      audioUrl: { $ifNull: ['$track.audioUrl', { $ifNull: ['$track.audioFile', '$track.audio'] }] },
      isrc: { $ifNull: ['$track.isrc', '$track.ISRC'] },
      genre: { $ifNull: ['$track.genre', '$genre'] },
      status: { $ifNull: ['$track.status', '$status'] },
      releaseStatus: '$status',
      releaseDate: { $ifNull: ['$track.releaseDate', '$releaseDate'] },
      createdAt: { $ifNull: ['$track.createdAt', '$createdAt'] },
      updatedAt: { $ifNull: ['$track.updatedAt', '$updatedAt'] },
    },
  };
}

export async function listTracksPage(
  db: Db,
  baseReleaseQuery: Record<string, any>,
  options: TrackListOptions = {}
): Promise<TrackListPage> {
  const page = Math.max(1, Number(options.page || 1));
  const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
  const skip = (page - 1) * limit;
  const query = buildReleaseTrackQuery(baseReleaseQuery, options, true);
  const countQuery = buildReleaseTrackQuery(baseReleaseQuery, options, false);
  const releases = db.collection('releases');

  const basePipeline = [
    { $match: query },
    { $unwind: { path: '$tracks', includeArrayIndex: 'trackIndex' } },
    { $set: { track: '$tracks' } },
    projectTrackRowStage(),
  ];

  const [facetResult, groupedCounts] = await Promise.all([
    releases
      .aggregate<{ data: Record<string, any>[]; total: Array<{ count: number }> }>([
        ...basePipeline,
        { $sort: { updatedAt: -1, createdAt: -1, trackIndex: 1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            total: [{ $count: 'count' }],
          },
        },
      ])
      .toArray(),
    releases
      .aggregate<{ _id: string | null; count: number }>([
        { $match: countQuery },
        { $unwind: '$tracks' },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const first = facetResult[0];
  const total = Number(first?.total?.[0]?.count || 0);
  const counts = {
    all: 0,
    pending: 0,
    in_process: 0,
    approved: 0,
    rejected: 0,
    other: 0,
  };

  groupedCounts.forEach((row) => {
    const normalized = getNormalizedReleaseStatus(row._id) as ReleaseDisplayStatus;
    counts[normalized] += row.count;
    counts.all += row.count;
  });

  return {
    tracks: first?.data || [],
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    counts,
  };
}

export function getReleaseIdString(release: ReleaseLike) {
  return asString(release._id);
}

export function getReleaseOwnerId(release: ReleaseLike) {
  return (
    release.ownerUserId ||
    release.userId ||
    release.artistId ||
    release.ownerId ||
    release.createdBy
  );
}

export function buildCanonicalTrackFromReleaseTrack(
  release: ReleaseLike,
  track: Record<string, any>,
  index: number,
  now = new Date()
): CanonicalTrackDocument | null {
  const releaseId = toObjectId(release._id);
  if (!releaseId) return null;

  const releaseIdString = releaseId.toHexString();
  const legacyTrackKey = getMusicPublishingTrackKey(releaseIdString, track, index);
  const ownerUserId = getReleaseOwnerId(release);

  return {
    releaseId,
    ownerUserId,
    organizationId: toObjectId(release.organizationId) || undefined,
    title: asString(track.title || track.name) || undefined,
    isrc: asString(track.isrc || track.ISRC) || undefined,
    genre: asString(track.genre) || undefined,
    audioFile: asString(track.audioFile || track.audioUrl) || undefined,
    artwork: asString(track.artwork || release.artworkUrl) || undefined,
    status: asString(track.status || release.status) || undefined,
    publishingStatus: normalizePublishingStatus(track.publishingStatus || track.musicPublishingStatus),
    releaseTrackIndex: index,
    legacyTrackKey,
    source: 'release_embed',
    legacyMetadata: { ...track },
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizePublishingStatus(value: unknown) {
  if (value === 'approved' || value === 'completed') return value;
  return 'pending';
}

function serializeAssetRef(asset: TrackAssetDocument) {
  return {
    id: asString(asset._id),
    type: asset.type,
    storageProvider: asset.storageProvider,
    path: asset.path,
    url: asset.url,
    checksum: asset.checksum,
    size: asset.size,
  };
}

function serializeFingerprintRef(fingerprint: TrackFingerprintDocument) {
  return {
    id: asString(fingerprint._id),
    provider: fingerprint.provider,
    fileId: fingerprint.fileId,
    scanState: fingerprint.scanState,
    checkedAt: fingerprint.checkedAt,
  };
}

export function canonicalTrackToReleaseTrack(
  track: CanonicalTrackDocument,
  refs: {
    assets?: TrackAssetDocument[];
    fingerprints?: TrackFingerprintDocument[];
  } = {}
) {
  const legacy = { ...(track.legacyMetadata || {}) } as Record<string, any>;
  const primaryFingerprint = refs.fingerprints?.find((fingerprint) => fingerprint.provider === 'acrcloud');
  return {
    ...legacy,
    canonicalTrackId: asString(track._id),
    id: legacy.id || track.legacyTrackKey,
    releaseId: track.releaseId.toHexString(),
    title: track.title ?? legacy.title,
    isrc: track.isrc ?? legacy.isrc,
    genre: track.genre ?? legacy.genre,
    audioFile: track.audioFile ?? legacy.audioFile,
    artwork: track.artwork ?? legacy.artwork,
    status: track.status ?? legacy.status,
    publishingStatus: track.publishingStatus ?? normalizePublishingStatus(legacy.publishingStatus),
    releaseTrackIndex: track.releaseTrackIndex,
    legacyTrackKey: track.legacyTrackKey,
    assetRefs: refs.assets?.map(serializeAssetRef) || legacy.assetRefs,
    fingerprintRefs: refs.fingerprints?.map(serializeFingerprintRef) || legacy.fingerprintRefs,
    acrCloud: primaryFingerprint
      ? {
          ...(legacy.acrCloud || {}),
          fileId: primaryFingerprint.fileId,
          scanState: primaryFingerprint.scanState,
          state: primaryFingerprint.scanState,
          checkedAt: primaryFingerprint.checkedAt,
        }
      : legacy.acrCloud,
  };
}

export async function getCanonicalTracksForRelease(db: Db, releaseId: ObjectId | string) {
  const _id = toObjectId(releaseId);
  if (!_id) return [];

  return tracksCollection(db)
    .find({ releaseId: _id, deletedAt: { $exists: false }, source: 'release_embed' })
    .sort({ releaseTrackIndex: 1, createdAt: 1 })
    .toArray();
}

export async function hydrateReleasesWithCanonicalTracks<T extends ReleaseLike>(
  db: Db,
  releases: T[]
): Promise<T[]> {
  const releaseIds = releases
    .map((release) => toObjectId(release._id))
    .filter((value): value is ObjectId => Boolean(value));

  if (!releaseIds.length) return releases;

  const canonicalTracks = await tracksCollection(db)
    .find({
      releaseId: { $in: releaseIds },
      deletedAt: { $exists: false },
      source: 'release_embed',
    })
    .sort({ releaseTrackIndex: 1, createdAt: 1 })
    .toArray();

  const trackIds = canonicalTracks
    .map((track) => track._id)
    .filter((value): value is ObjectId => Boolean(value));
  const [assetsByTrack, fingerprintsByTrack] = await Promise.all([
    listTrackAssetsForTrackIds(db, trackIds),
    listTrackFingerprintsForTrackIds(db, trackIds),
  ]);

  const byReleaseId = new Map<string, CanonicalTrackDocument[]>();
  canonicalTracks.forEach((track) => {
    const key = track.releaseId.toHexString();
    const list = byReleaseId.get(key) || [];
    list.push(track);
    byReleaseId.set(key, list);
  });

  return releases.map((release) => {
    const releaseId = asString(release._id);
    const canonical = byReleaseId.get(releaseId) || [];
    const tracks = canonical.length
      ? canonical.map((track) => {
          const trackId = asString(track._id);
          return canonicalTrackToReleaseTrack(track, {
            assets: assetsByTrack.get(trackId),
            fingerprints: fingerprintsByTrack.get(trackId),
          });
        })
      : Array.isArray(release.tracks)
        ? release.tracks
        : [];

    return {
      ...release,
      ownerUserId: release.ownerUserId || getReleaseOwnerId(release),
      tracks,
      trackCount: tracks.length,
    };
  });
}

export async function upsertCanonicalTracksFromRelease(
  db: Db,
  release: ReleaseLike,
  options: { dryRun?: boolean } = {}
) {
  await ensureCanonicalTrackIndexes(db);

  const tracks = Array.isArray(release.tracks) ? release.tracks : [];
  const now = new Date();
  const operations: AnyBulkWriteOperation<CanonicalTrackDocument>[] = [];
  const skipped: string[] = [];

  tracks.forEach((track, index) => {
    const canonical = buildCanonicalTrackFromReleaseTrack(release, track, index, now);
    if (!canonical) {
      skipped.push(`track:${index}:invalid_release_id`);
      return;
    }

    const { createdAt, ...setFields } = canonical;
    operations.push({
      updateOne: {
        filter: {
          releaseId: canonical.releaseId,
          legacyTrackKey: canonical.legacyTrackKey,
          source: 'release_embed',
        },
        update: {
          $set: setFields,
          $setOnInsert: { createdAt },
          $unset: { deletedAt: '' },
        },
        upsert: true,
      },
    });
  });

  if (!operations.length || options.dryRun) {
    return {
      matched: 0,
      modified: 0,
      upserted: 0,
      planned: operations.length,
      skipped,
    };
  }

  const result = await tracksCollection(db).bulkWrite(operations, { ordered: false });
  const releaseId = toObjectId(release._id);
  const canonicalTracks = releaseId ? await getCanonicalTracksForRelease(db, releaseId) : [];
  await Promise.all([
    upsertTrackAssetsFromTracks(db, canonicalTracks as Array<Record<string, any>>),
    upsertTrackFingerprintsFromTracks(db, canonicalTracks as Array<Record<string, any>>),
  ]);

  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: result.upsertedCount,
    planned: operations.length,
    skipped,
  };
}

export async function replaceReleaseCanonicalTracks(
  db: Db,
  release: ReleaseLike,
  tracks: Record<string, any>[]
) {
  const nextRelease = { ...release, tracks };
  await upsertCanonicalTracksFromRelease(db, nextRelease);

  const releaseId = toObjectId(release._id);
  if (!releaseId) return;

  const activeKeys = tracks.map((track, index) =>
    getMusicPublishingTrackKey(releaseId.toHexString(), track, index)
  );

  await tracksCollection(db).updateMany(
    {
      releaseId,
      source: 'release_embed',
      legacyTrackKey: { $nin: activeKeys },
      deletedAt: { $exists: false },
    },
    { $set: { deletedAt: new Date(), updatedAt: new Date() } }
  );
}
