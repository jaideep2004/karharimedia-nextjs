import { Db, ObjectId, type CreateIndexesOptions, type IndexSpecification } from 'mongodb';
import { getReleaseOwnerQuery } from '@/lib/musicPublishing';
import { getFileUrl } from '@/lib/assetUrl';
import {
  hydrateReleasesWithCanonicalTracks,
  replaceReleaseCanonicalTracks,
  toObjectId,
  tracksCollection,
  upsertCanonicalTracksFromRelease,
} from '@/lib/repositories/tracks';
import { getDefaultOrganizationIdForUser } from '@/lib/repositories/organizations';
import { getNormalizedReleaseStatus, RELEASE_STATUS_GROUPS, type ReleaseDisplayStatus } from '@/lib/releaseStatus';

export type ReleaseDocument = Record<string, any> & {
  _id?: ObjectId;
  tracks?: Record<string, any>[];
};

export function releasesCollection(db: Db) {
  return db.collection<ReleaseDocument>('releases');
}

let releaseIndexesReady: Promise<void> | null = null;

export async function ensureReleaseIndexes(db: Db) {
  if (!releaseIndexesReady) {
    const collection = releasesCollection(db);
    releaseIndexesReady = (async () => {
      const existingKeys = new Set((await collection.indexes()).map((index) => JSON.stringify(index.key)));
      const desiredIndexes: Array<{ key: IndexSpecification; options: CreateIndexesOptions }> = [
        { key: { createdAt: -1 }, options: { name: 'releases_created_desc' } },
        { key: { updatedAt: -1 }, options: { name: 'releases_updated_desc' } },
        { key: { status: 1, createdAt: -1 }, options: { name: 'releases_status_created' } },
        { key: { status: 1, updatedAt: -1 }, options: { name: 'releases_status_updated' } },
        { key: { ownerUserId: 1, createdAt: -1 }, options: { name: 'releases_owner_created' } },
        { key: { userId: 1, createdAt: -1 }, options: { name: 'releases_user_created' } },
        { key: { organizationId: 1, createdAt: -1 }, options: { name: 'releases_org_created', sparse: true } },
        { key: { ownerId: 1, createdAt: -1 }, options: { name: 'releases_ownerId_created', sparse: true } },
        { key: { releaseType: 1, status: 1 }, options: { name: 'releases_type_status', sparse: true } },
        { key: { upc: 1 }, options: { name: 'releases_upc', sparse: true } },
        { key: { releaseTitle: 1 }, options: { name: 'releases_title', sparse: true } },
        { key: { primaryArtist: 1 }, options: { name: 'releases_artist', sparse: true } },
        { key: { stores: 1 }, options: { name: 'releases_stores', sparse: true } },
        { key: { 'dspDeliveries.providerKey': 1, status: 1 }, options: { name: 'releases_dsp_status', sparse: true } },
      ];

      await Promise.all(
        desiredIndexes
          .filter((index) => !existingKeys.has(JSON.stringify(index.key)))
          .map((index) => collection.createIndex(index.key, index.options))
      );
    })();
  }

  await releaseIndexesReady;
}

export function legacyTrackSnapshotsEnabled() {
  return process.env.FREEZE_LEGACY_RELEASE_TRACKS !== 'true';
}

export function withOptionalLegacyTrackSnapshot(
  update: Record<string, any>,
  tracks: Record<string, any>[]
) {
  return legacyTrackSnapshotsEnabled() ? { ...update, tracks } : update;
}

export async function createRelease(
  db: Db,
  payload: Record<string, any>,
  user: { _id: string; email?: string; name?: string; artistName?: string }
) {
  const now = new Date();
  const ownerUserId = String(user._id);
  const organizationId = payload.organizationId || await getDefaultOrganizationIdForUser(db, user);

  const release = {
    ...payload,
    organizationId,
    ownerUserId,
    userId: ownerUserId,
    artistId: ownerUserId,
    ownerEmail: user.email,
    ownerName: user.name,
    ownerArtistName: user.artistName || user.name,
    createdAt: now,
    updatedAt: now,
    status: 'pending_review',
  };

  const result = await releasesCollection(db).insertOne(release as ReleaseDocument);
  await upsertCanonicalTracksFromRelease(db, { ...release, _id: result.insertedId });

  return result;
}

export async function findReleaseByIdRaw(db: Db, id: string | ObjectId) {
  const _id = toObjectId(id);
  if (!_id) return null;
  return releasesCollection(db).findOne({ _id });
}

export async function findReleaseByIdWithTracks(db: Db, id: string | ObjectId) {
  const release = await findReleaseByIdRaw(db, id);
  if (!release) return null;
  const [hydrated] = await hydrateReleasesWithCanonicalTracks(db, [release]);
  return hydrated;
}

export async function listReleasesWithTracks(
  db: Db,
  query: Record<string, any>,
  options: { summary?: boolean } = {}
) {
  await ensureReleaseIndexes(db);

  if (options.summary) {
    return listReleaseSummaries(db, query);
  }

  const releases = await releasesCollection(db)
    .find(query)
    .sort({ createdAt: -1 })
    .allowDiskUse(true)
    .toArray();

  return hydrateReleasesWithCanonicalTracks(db, releases);
}

type ReleaseListOptions = {
  summary?: boolean;
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  search?: string;
};

export type ReleaseListPage = {
  releases: Record<string, any>[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  counts: Record<'all' | 'pending' | 'in_process' | 'approved' | 'rejected' | 'other', number>;
};

const RELEASE_SEARCH_FIELDS = [
  'releaseTitle',
  'title',
  'primaryArtist',
  'artist',
  'label',
  'upc',
  'ownerName',
  'ownerArtistName',
  'ownerEmail',
];

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

function buildReleaseListQuery(
  baseQuery: Record<string, any>,
  options: Pick<ReleaseListOptions, 'status' | 'type' | 'search'>,
  includeStatus = true
) {
  const clauses: Record<string, any>[] = [baseQuery];
  const type = String(options.type || '').trim().toLowerCase();
  const search = String(options.search || '').trim();

  if (includeStatus && options.status && options.status !== 'all') {
    const statusClause = normalizedStatusQuery(options.status);
    if (Object.keys(statusClause).length) clauses.push(statusClause);
  }

  if (type && type !== 'all') {
    clauses.push({
      $or: [
        { releaseType: { $regex: `^${escapeRegex(type)}$`, $options: 'i' } },
        { type: { $regex: `^${escapeRegex(type)}$`, $options: 'i' } },
      ],
    });
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    clauses.push({ $or: RELEASE_SEARCH_FIELDS.map((field) => ({ [field]: regex })) });
  }

  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

async function attachSummaryTrackCounts(db: Db, releases: Record<string, any>[]) {
  const releaseIds = releases
    .map((release) => toObjectId(release._id))
    .filter((value): value is ObjectId => Boolean(value));

  const canonicalCounts = releaseIds.length
    ? await tracksCollection(db)
        .aggregate<{ _id: ObjectId; count: number }>([
          {
            $match: {
              releaseId: { $in: releaseIds },
              deletedAt: { $exists: false },
              source: 'release_embed',
            },
          },
          { $group: { _id: '$releaseId', count: { $sum: 1 } } },
        ])
        .toArray()
    : [];

  const countsByReleaseId = new Map(
    canonicalCounts.map((row) => [row._id.toHexString(), row.count])
  );

  return releases.map((release) => {
    const releaseId = String(release._id);
    const { legacyTrackCount, ...summary } = release;
    return {
      ...summary,
      artworkUrl: release.artworkUrl || getFileUrl(release.artwork || release.artworkFile, 'image') || '',
      ownerUserId: release.ownerUserId || release.userId || release.artistId || release.ownerId || release.createdBy,
      trackCount: countsByReleaseId.get(releaseId) ?? Number(legacyTrackCount || 0),
    };
  });
}

async function listReleaseSummaries(db: Db, query: Record<string, any>) {
  const releases = await releasesCollection(db)
    .aggregate<Record<string, any>>([
      { $match: query },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          releaseTitle: 1,
          title: 1,
          releaseType: 1,
          status: 1,
          releaseDate: 1,
          originalReleaseDate: 1,
          label: 1,
          upc: 1,
          ownerUserId: 1,
          organizationId: 1,
          userId: 1,
          artistId: 1,
          ownerId: 1,
          createdBy: 1,
          ownerName: 1,
          ownerArtistName: 1,
          ownerEmail: 1,
          primaryArtist: 1,
          artist: 1,
          territories: 1,
          artwork: 1,
          artworkFile: 1,
          artworkUrl: 1,
          stores: 1,
          updatedAt: 1,
          createdAt: 1,
          legacyTrackCount: {
            $cond: [{ $isArray: '$tracks' }, { $size: '$tracks' }, 0],
          },
        },
      },
    ])
    .toArray();

  return attachSummaryTrackCounts(db, releases);
}

export async function listReleasesPage(
  db: Db,
  baseQuery: Record<string, any>,
  options: ReleaseListOptions = {}
): Promise<ReleaseListPage> {
  await ensureReleaseIndexes(db);

  const page = Math.max(1, Number(options.page || 1));
  const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
  const skip = (page - 1) * limit;
  const query = buildReleaseListQuery(baseQuery, options, true);
  const countQuery = buildReleaseListQuery(baseQuery, options, false);
  const collection = releasesCollection(db);

  const summaryProjection = {
    releaseTitle: 1,
    title: 1,
    releaseType: 1,
    type: 1,
    status: 1,
    releaseDate: 1,
    originalReleaseDate: 1,
    label: 1,
    upc: 1,
    ownerUserId: 1,
    organizationId: 1,
    userId: 1,
    artistId: 1,
    ownerId: 1,
    createdBy: 1,
    ownerName: 1,
    ownerArtistName: 1,
    ownerEmail: 1,
    primaryArtist: 1,
    artist: 1,
    territories: 1,
    artwork: 1,
    artworkFile: 1,
    artworkUrl: 1,
    stores: 1,
    updatedAt: 1,
    createdAt: 1,
    legacyTrackCount: {
      $cond: [{ $isArray: '$tracks' }, { $size: '$tracks' }, 0],
    },
  };

  const [rows, total, groupedCounts] = await Promise.all([
    options.summary
      ? collection
          .aggregate<Record<string, any>>(
            [
              { $match: query },
              { $sort: { createdAt: -1 } },
              { $skip: skip },
              { $limit: limit },
              { $project: summaryProjection },
            ],
            { allowDiskUse: true }
          )
          .toArray()
      : collection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .allowDiskUse(true)
          .toArray(),
    collection.countDocuments(query),
    collection
      .aggregate<{ _id: string | null; count: number }>([
        { $match: countQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const releases = options.summary
    ? await attachSummaryTrackCounts(db, rows)
    : await hydrateReleasesWithCanonicalTracks(db, rows as Array<ReleaseDocument & { _id: ObjectId }>);
  const counts = {
    all: 0,
    pending: 0,
    in_process: 0,
    approved: 0,
    rejected: 0,
    other: 0,
  };
  groupedCounts.forEach((row) => {
    const normalized = getNormalizedReleaseStatus(row._id) as Exclude<ReleaseDisplayStatus, never>;
    counts[normalized] += row.count;
    counts.all += row.count;
  });

  return {
    releases,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    counts,
  };
}

export async function listApprovedReleasesForPublishing(db: Db) {
  const releases = await releasesCollection(db)
    .find(
      { status: 'approved' },
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
          ownerUserId: 1,
          organizationId: 1,
          userId: 1,
          artistId: 1,
          ownerName: 1,
          ownerArtistName: 1,
          ownerEmail: 1,
          primaryArtist: 1,
          territories: 1,
          stores: 1,
          tracks: 1,
          updatedAt: 1,
          createdAt: 1,
        },
      }
    )
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();

  return hydrateReleasesWithCanonicalTracks(db, releases);
}

export async function updateReleaseTracksSnapshot(
  db: Db,
  release: ReleaseDocument & { _id: ObjectId },
  tracks: Record<string, any>[],
  update: Record<string, any> = {}
) {
  await replaceReleaseCanonicalTracks(db, release, tracks);
  return releasesCollection(db).findOneAndUpdate(
    { _id: release._id },
    {
      $set: {
        ...update,
        ...(legacyTrackSnapshotsEnabled() ? { tracks } : {}),
        updatedAt: update.updatedAt || new Date(),
      },
    },
    { returnDocument: 'after' }
  );
}

export { getReleaseOwnerQuery };
