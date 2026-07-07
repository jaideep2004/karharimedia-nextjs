import { Db, ObjectId } from 'mongodb';
import {
  getYoutubeWorkflowLabel,
  getYoutubeWorkflowStatus,
  isYoutubeAnalyticsAccessStatus,
  isYoutubeAnalyticsSyncStatus,
  type YoutubeAnalyticsAccessStatus,
  type YoutubeAnalyticsSyncStatus,
  type YoutubeChannelCandidate,
  type YoutubeChannelView,
  type YoutubeCmsStatus,
  type YoutubeVerificationStatus,
} from '@/lib/youtube';
import { toObjectId } from '@/lib/repositories/tracks';

export interface YoutubeChannelDocument extends YoutubeChannelCandidate {
  _id?: ObjectId;
  userId: ObjectId;
  organizationId?: ObjectId;
  googleAccountEmail: string;
  verificationStatus: YoutubeVerificationStatus;
  cmsStatus: YoutubeCmsStatus;
  connectedAt: Date;
  lastSyncedAt: Date;
  lastAnalyticsSyncedAt?: Date;
  nextAnalyticsSyncAt?: Date;
  analyticsAccessStatus?: YoutubeAnalyticsAccessStatus;
  analyticsSyncStatus?: YoutubeAnalyticsSyncStatus;
  analyticsError?: string;
  grantedScopes?: string[];
  createdAt: Date;
  updatedAt: Date;
  tokenExpiresAt?: Date;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  statusHistory?: YoutubeChannelStatusHistory[];
}

export interface YoutubeChannelStatusHistory {
  at: Date;
  adminId: string;
  adminEmail: string;
  action: string;
  from: {
    verificationStatus: YoutubeVerificationStatus;
    cmsStatus: YoutubeCmsStatus;
  };
  to: {
    verificationStatus: YoutubeVerificationStatus;
    cmsStatus: YoutubeCmsStatus;
  };
  note?: string;
}

export interface YoutubeOAuthStateDocument {
  _id: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

export interface YoutubeOAuthSessionDocument {
  _id: string;
  userId: ObjectId;
  googleAccountEmail: string;
  channels: YoutubeChannelCandidate[];
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt?: Date;
  grantedScopes?: string[];
  createdAt: Date;
  expiresAt: Date;
}

type AdminListOptions = {
  page: number;
  limit: number;
  query?: string;
  verificationStatus?: YoutubeVerificationStatus;
  cmsStatus?: YoutubeCmsStatus;
};

let channelIndexesReady: Promise<void> | null = null;
let stateIndexesReady: Promise<void> | null = null;
let sessionIndexesReady: Promise<void> | null = null;

export function youtubeChannelsCollection(db: Db) {
  return db.collection<YoutubeChannelDocument>('youtubeChannels');
}

export function youtubeOAuthStatesCollection(db: Db) {
  return db.collection<YoutubeOAuthStateDocument>('youtubeOAuthStates');
}

export function youtubeOAuthSessionsCollection(db: Db) {
  return db.collection<YoutubeOAuthSessionDocument>('youtubeOAuthSessions');
}

export async function ensureYoutubeChannelIndexes(db: Db) {
  if (!channelIndexesReady) {
    const collection = youtubeChannelsCollection(db);
    channelIndexesReady = Promise.all([
      collection.createIndex({ userId: 1, channelId: 1 }, { unique: true }),
      collection.createIndex({ verificationStatus: 1, cmsStatus: 1, connectedAt: -1 }),
      collection.createIndex({ connectedAt: -1 }),
      collection.createIndex({ channelId: 1 }),
      collection.createIndex({ googleAccountEmail: 1 }),
      collection.createIndex({ analyticsSyncStatus: 1, nextAnalyticsSyncAt: 1 }),
      collection.createIndex({ analyticsAccessStatus: 1, verificationStatus: 1, cmsStatus: 1 }),
    ]).then(() => undefined);
  }

  await channelIndexesReady;
}

export async function ensureYoutubeOAuthStateIndexes(db: Db) {
  if (!stateIndexesReady) {
    stateIndexesReady = youtubeOAuthStatesCollection(db)
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      .then(() => undefined);
  }

  await stateIndexesReady;
}

export async function ensureYoutubeOAuthSessionIndexes(db: Db) {
  if (!sessionIndexesReady) {
    const collection = youtubeOAuthSessionsCollection(db);
    sessionIndexesReady = Promise.all([
      collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      collection.createIndex({ userId: 1, createdAt: -1 }),
    ]).then(() => undefined);
  }

  await sessionIndexesReady;
}

export async function createYoutubeOAuthState(db: Db, input: YoutubeOAuthStateDocument) {
  await ensureYoutubeOAuthStateIndexes(db);
  await youtubeOAuthStatesCollection(db).insertOne(input);
}

export async function consumeYoutubeOAuthState(db: Db, stateHash: string) {
  await ensureYoutubeOAuthStateIndexes(db);
  const result = await youtubeOAuthStatesCollection(db).findOneAndDelete({
    _id: stateHash,
    expiresAt: { $gt: new Date() },
  });
  return result.value;
}

export async function createYoutubeOAuthSession(db: Db, input: YoutubeOAuthSessionDocument) {
  await ensureYoutubeOAuthSessionIndexes(db);
  await youtubeOAuthSessionsCollection(db).insertOne(input);
}

export async function findYoutubeOAuthSession(db: Db, sessionId: string) {
  await ensureYoutubeOAuthSessionIndexes(db);
  return youtubeOAuthSessionsCollection(db).findOne({
    _id: sessionId,
    expiresAt: { $gt: new Date() },
  });
}

export async function deleteYoutubeOAuthSession(db: Db, sessionId: string) {
  await youtubeOAuthSessionsCollection(db).deleteOne({ _id: sessionId });
}

export async function upsertYoutubeChannel(
  db: Db,
  input: Omit<YoutubeChannelDocument, '_id' | 'createdAt' | 'updatedAt' | 'connectedAt' | 'verificationStatus' | 'cmsStatus'>
) {
  await ensureYoutubeChannelIndexes(db);

  const now = new Date();
  const result = await youtubeChannelsCollection(db).findOneAndUpdate(
    {
      userId: input.userId,
      channelId: input.channelId,
    },
    {
      $set: {
        organizationId: input.organizationId,
        googleAccountEmail: input.googleAccountEmail,
        channelTitle: input.channelTitle,
        thumbnail: input.thumbnail,
        subscribers: input.subscribers,
        views: input.views,
        videos: input.videos,
        lastSyncedAt: input.lastSyncedAt,
        tokenExpiresAt: input.tokenExpiresAt,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        grantedScopes: input.grantedScopes || [],
        analyticsAccessStatus: input.analyticsAccessStatus,
        analyticsSyncStatus: input.analyticsSyncStatus || 'never_synced',
        updatedAt: now,
      },
      $setOnInsert: {
        userId: input.userId,
        channelId: input.channelId,
        verificationStatus: 'pending',
        cmsStatus: 'not_started',
        nextAnalyticsSyncAt: now,
        connectedAt: now,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  return ((result as { value?: YoutubeChannelDocument | null }).value ?? result) as YoutubeChannelDocument | null;
}

export async function findYoutubeChannelByObjectId(db: Db, channelObjectId: string | ObjectId) {
  await ensureYoutubeChannelIndexes(db);
  const _id = toObjectId(channelObjectId);
  if (!_id) return null;
  return youtubeChannelsCollection(db).findOne({ _id });
}

export async function updateYoutubeChannelTokens(
  db: Db,
  channelObjectId: ObjectId,
  input: {
    accessTokenEncrypted?: string | null;
    refreshTokenEncrypted?: string | null;
    tokenExpiresAt?: Date;
  }
) {
  await ensureYoutubeChannelIndexes(db);
  const set: Partial<YoutubeChannelDocument> = { updatedAt: new Date() };
  if (input.accessTokenEncrypted !== undefined) set.accessTokenEncrypted = input.accessTokenEncrypted;
  if (input.refreshTokenEncrypted !== undefined) set.refreshTokenEncrypted = input.refreshTokenEncrypted;
  if (input.tokenExpiresAt !== undefined) set.tokenExpiresAt = input.tokenExpiresAt;
  await youtubeChannelsCollection(db).updateOne({ _id: channelObjectId }, { $set: set });
}

export async function updateYoutubeChannelAnalyticsState(
  db: Db,
  channelObjectId: ObjectId,
  input: {
    analyticsAccessStatus?: YoutubeAnalyticsAccessStatus;
    analyticsSyncStatus?: YoutubeAnalyticsSyncStatus;
    lastAnalyticsSyncedAt?: Date;
    nextAnalyticsSyncAt?: Date;
    analyticsError?: string | null;
  }
) {
  await ensureYoutubeChannelIndexes(db);
  const set: Partial<YoutubeChannelDocument> = { updatedAt: new Date() };
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) {
      (set as Record<string, unknown>)[key] = value;
    }
  });
  await youtubeChannelsCollection(db).updateOne({ _id: channelObjectId }, { $set: set });
}

export async function listUserYoutubeChannels(db: Db, userId: string | ObjectId) {
  await ensureYoutubeChannelIndexes(db);
  const _id = toObjectId(userId);
  if (!_id) return [];

  const channels = await youtubeChannelsCollection(db)
    .find({ userId: _id }, { projection: { accessTokenEncrypted: 0, refreshTokenEncrypted: 0 } })
    .sort({ connectedAt: -1 })
    .toArray();

  return channels.map(serializeYoutubeChannel);
}

export async function listAdminYoutubeChannels(db: Db, options: AdminListOptions) {
  await ensureYoutubeChannelIndexes(db);

  const match: Record<string, unknown> = {};
  if (options.verificationStatus) match.verificationStatus = options.verificationStatus;
  if (options.cmsStatus) match.cmsStatus = options.cmsStatus;

  const query = (options.query || '').trim();
  const skip = (options.page - 1) * options.limit;
  const pipeline: Record<string, unknown>[] = [
    { $match: match },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
  ];

  if (query) {
    const pattern = escapeRegex(query);
    pipeline.push({
      $match: {
        $or: [
          { channelTitle: { $regex: pattern, $options: 'i' } },
          { channelId: { $regex: pattern, $options: 'i' } },
          { googleAccountEmail: { $regex: pattern, $options: 'i' } },
          { 'user.name': { $regex: pattern, $options: 'i' } },
          { 'user.email': { $regex: pattern, $options: 'i' } },
          { 'user.artistName': { $regex: pattern, $options: 'i' } },
        ],
      },
    });
  }

  pipeline.push({
    $facet: {
      rows: [
        { $sort: { connectedAt: -1 } },
        { $skip: skip },
        { $limit: options.limit },
        {
          $project: {
            accessTokenEncrypted: 0,
            refreshTokenEncrypted: 0,
            'user.password': 0,
          },
        },
      ],
      total: [{ $count: 'count' }],
    },
  });

  const [result] = await youtubeChannelsCollection(db).aggregate<{
    rows: Array<YoutubeChannelDocument & { user?: Record<string, unknown> }>;
    total: Array<{ count: number }>;
  }>(pipeline).toArray();

  return {
    channels: (result?.rows || []).map(serializeYoutubeChannel),
    total: result?.total?.[0]?.count || 0,
  };
}

export async function updateYoutubeChannelStatus(
  db: Db,
  channelId: string,
  next: {
    verificationStatus: YoutubeVerificationStatus;
    cmsStatus: YoutubeCmsStatus;
    action: string;
    adminId: string;
    adminEmail: string;
    note?: string;
  }
) {
  await ensureYoutubeChannelIndexes(db);
  const _id = toObjectId(channelId);
  if (!_id) return null;

  const existing = await youtubeChannelsCollection(db).findOne({ _id });
  if (!existing) return null;

  const now = new Date();
  const history: YoutubeChannelStatusHistory = {
    at: now,
    adminId: next.adminId,
    adminEmail: next.adminEmail,
    action: next.action,
    from: {
      verificationStatus: existing.verificationStatus,
      cmsStatus: existing.cmsStatus,
    },
    to: {
      verificationStatus: next.verificationStatus,
      cmsStatus: next.cmsStatus,
    },
    ...(next.note ? { note: next.note } : {}),
  };

  const result = await youtubeChannelsCollection(db).findOneAndUpdate(
    { _id },
    {
      $set: {
        verificationStatus: next.verificationStatus,
        cmsStatus: next.cmsStatus,
        updatedAt: now,
      },
      $push: { statusHistory: history },
    },
    {
      returnDocument: 'after',
      projection: { accessTokenEncrypted: 0, refreshTokenEncrypted: 0 },
    }
  );

  return result.value ? serializeYoutubeChannel(result.value) : null;
}

export function serializeYoutubeChannel(
  channel: (Partial<YoutubeChannelDocument> & { user?: Record<string, unknown> }) | null
): YoutubeChannelView | null {
  if (!channel?._id || !channel.channelId || !channel.channelTitle) return null;

  const verificationStatus = channel.verificationStatus || 'pending';
  const cmsStatus = channel.cmsStatus || 'not_started';
  const analyticsAccessStatus = isYoutubeAnalyticsAccessStatus(channel.analyticsAccessStatus)
    ? channel.analyticsAccessStatus
    : 'reauthorization_required';
  const analyticsSyncStatus = isYoutubeAnalyticsSyncStatus(channel.analyticsSyncStatus)
    ? channel.analyticsSyncStatus
    : 'never_synced';
  const user = channel.user;

  return {
    id: String(channel._id),
    googleAccountEmail: String(channel.googleAccountEmail || ''),
    channelId: channel.channelId,
    channelTitle: channel.channelTitle,
    thumbnail: channel.thumbnail || '',
    subscribers: Number(channel.subscribers || 0),
    views: Number(channel.views || 0),
    videos: Number(channel.videos || 0),
    verificationStatus,
    cmsStatus,
    analyticsAccessStatus,
    analyticsSyncStatus,
    workflowStatus: getYoutubeWorkflowStatus(verificationStatus, cmsStatus),
    workflowLabel: getYoutubeWorkflowLabel(verificationStatus, cmsStatus),
    connectedAt: toIso(channel.connectedAt),
    lastSyncedAt: toIso(channel.lastSyncedAt),
    lastAnalyticsSyncedAt: channel.lastAnalyticsSyncedAt ? toIso(channel.lastAnalyticsSyncedAt) : undefined,
    nextAnalyticsSyncAt: channel.nextAnalyticsSyncAt ? toIso(channel.nextAnalyticsSyncAt) : undefined,
    analyticsError: typeof channel.analyticsError === 'string' ? channel.analyticsError : undefined,
    ...(user
      ? {
          user: {
            id: String(user._id || ''),
            name: String(user.name || ''),
            email: String(user.email || ''),
            role: typeof user.role === 'string' ? user.role : undefined,
            artistName: typeof user.artistName === 'string' ? user.artistName : undefined,
          },
        }
      : {}),
  };
}

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return new Date(value).toISOString();
  return new Date().toISOString();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
