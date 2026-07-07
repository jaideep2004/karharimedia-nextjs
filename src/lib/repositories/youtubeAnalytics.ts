import 'server-only';

import { Db, ObjectId } from 'mongodb';
import type { YoutubeAnalyticsSyncStatus } from '@/lib/youtube';
import type { YoutubeAnalyticsMetric } from '@/lib/adapters/youtubeAnalyticsAdapter';
import { youtubeChannelsCollection, type YoutubeChannelDocument } from '@/lib/repositories/youtube';
import { toObjectId } from '@/lib/repositories/tracks';

export const YOUTUBE_ANALYTICS_METRICS: YoutubeAnalyticsMetric[] = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'averageViewPercentage',
  'subscribersGained',
  'subscribersLost',
  'likes',
  'comments',
  'shares',
];

export type YoutubeAnalyticsMetrics = Record<YoutubeAnalyticsMetric, number>;
export type YoutubeAnalyticsReportType = 'country' | 'deviceType' | 'demographics' | 'trafficSource' | 'realtime';
export type YoutubeAnalyticsJobState = 'queued' | 'running' | 'completed' | 'failed';

export type YoutubeAnalyticsSyncJobDocument = {
  _id: ObjectId;
  channelObjectId?: ObjectId;
  scope: 'channel' | 'all';
  state: YoutubeAnalyticsJobState;
  idempotencyKey: string;
  windowDays: number;
  retryCount: number;
  maxRetries: number;
  nextAttemptAt: Date;
  lockedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdBy: string;
  createdByEmail?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type YoutubeAnalyticsSyncRunDocument = {
  _id?: ObjectId;
  jobId: ObjectId;
  channelObjectId: ObjectId;
  channelId: string;
  state: 'started' | 'completed' | 'failed' | 'skipped';
  message?: string;
  errorCode?: string;
  createdAt: Date;
};

export type YoutubeAnalyticsDailySnapshot = {
  _id?: ObjectId;
  channelObjectId: ObjectId;
  channelId: string;
  date: string;
  metrics: YoutubeAnalyticsMetrics;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type YoutubeAnalyticsBreakdownSnapshot = {
  _id?: ObjectId;
  channelObjectId: ObjectId;
  channelId: string;
  reportType: YoutubeAnalyticsReportType;
  startDate: string;
  endDate: string;
  dimensionKey: string;
  dimensions: Record<string, string>;
  metrics: YoutubeAnalyticsMetrics;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type YoutubeAnalyticsVideoSnapshot = {
  _id?: ObjectId;
  channelObjectId: ObjectId;
  channelId: string;
  videoId: string;
  startDate: string;
  endDate: string;
  title: string;
  thumbnail: string;
  publishedAt?: string;
  metrics: YoutubeAnalyticsMetrics;
  publicStats: {
    views: number;
    likes: number;
    comments: number;
  };
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

let indexesReady: Promise<void> | null = null;

export function youtubeAnalyticsSyncJobsCollection(db: Db) {
  return db.collection<YoutubeAnalyticsSyncJobDocument>('youtubeAnalyticsSyncJobs');
}

export function youtubeAnalyticsSyncRunsCollection(db: Db) {
  return db.collection<YoutubeAnalyticsSyncRunDocument>('youtubeAnalyticsSyncRuns');
}

export function youtubeAnalyticsDailyCollection(db: Db) {
  return db.collection<YoutubeAnalyticsDailySnapshot>('youtubeAnalyticsDailySnapshots');
}

export function youtubeAnalyticsBreakdownsCollection(db: Db) {
  return db.collection<YoutubeAnalyticsBreakdownSnapshot>('youtubeAnalyticsBreakdownSnapshots');
}

export function youtubeAnalyticsVideosCollection(db: Db) {
  return db.collection<YoutubeAnalyticsVideoSnapshot>('youtubeAnalyticsVideoSnapshots');
}

export async function ensureYoutubeAnalyticsIndexes(db: Db) {
  if (!indexesReady) {
    indexesReady = Promise.all([
      youtubeAnalyticsSyncJobsCollection(db).createIndex({ idempotencyKey: 1 }, { unique: true }),
      youtubeAnalyticsSyncJobsCollection(db).createIndex({ state: 1, nextAttemptAt: 1 }),
      youtubeAnalyticsSyncJobsCollection(db).createIndex({ channelObjectId: 1, createdAt: -1 }),
      youtubeAnalyticsSyncRunsCollection(db).createIndex({ jobId: 1, createdAt: -1 }),
      youtubeAnalyticsSyncRunsCollection(db).createIndex({ channelObjectId: 1, createdAt: -1 }),
      youtubeAnalyticsDailyCollection(db).createIndex(
        { channelObjectId: 1, channelId: 1, date: 1 },
        { unique: true }
      ),
      youtubeAnalyticsDailyCollection(db).createIndex({ channelObjectId: 1, date: -1 }),
      youtubeAnalyticsBreakdownsCollection(db).createIndex(
        { channelObjectId: 1, reportType: 1, startDate: 1, endDate: 1, dimensionKey: 1 },
        { unique: true }
      ),
      youtubeAnalyticsBreakdownsCollection(db).createIndex({ channelObjectId: 1, reportType: 1, syncedAt: -1 }),
      youtubeAnalyticsVideosCollection(db).createIndex(
        { channelObjectId: 1, videoId: 1, startDate: 1, endDate: 1 },
        { unique: true }
      ),
      youtubeAnalyticsVideosCollection(db).createIndex({ channelObjectId: 1, endDate: -1, 'metrics.views': -1 }),
    ]).then(() => undefined);
  }

  await indexesReady;
}

export function emptyYoutubeMetrics(): YoutubeAnalyticsMetrics {
  return YOUTUBE_ANALYTICS_METRICS.reduce((acc, metric) => {
    acc[metric] = 0;
    return acc;
  }, {} as YoutubeAnalyticsMetrics);
}

export function normalizeYoutubeMetrics(input: Record<string, unknown>): YoutubeAnalyticsMetrics {
  const metrics = emptyYoutubeMetrics();
  YOUTUBE_ANALYTICS_METRICS.forEach((metric) => {
    const parsed = Number(input[metric] || 0);
    metrics[metric] = Number.isFinite(parsed) ? parsed : 0;
  });
  return metrics;
}

export async function queueYoutubeAnalyticsSyncJob(
  db: Db,
  input: {
    channelObjectId?: ObjectId;
    scope: 'channel' | 'all';
    windowDays: number;
    idempotencyKey: string;
    createdBy: string;
    createdByEmail?: string;
  }
) {
  await ensureYoutubeAnalyticsIndexes(db);
  const now = new Date();
  await youtubeAnalyticsSyncJobsCollection(db).updateOne(
    { idempotencyKey: input.idempotencyKey },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        channelObjectId: input.channelObjectId,
        scope: input.scope,
        state: 'queued',
        idempotencyKey: input.idempotencyKey,
        windowDays: input.windowDays,
        retryCount: 0,
        maxRetries: 3,
        nextAttemptAt: now,
        createdBy: input.createdBy,
        createdByEmail: input.createdByEmail,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  const existing = await youtubeAnalyticsSyncJobsCollection(db).findOne({ idempotencyKey: input.idempotencyKey });
  if (existing?.state === 'failed') {
    await youtubeAnalyticsSyncJobsCollection(db).updateOne(
      { _id: existing._id },
      {
        $set: {
          state: 'queued',
          retryCount: 0,
          nextAttemptAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: { error: '' },
      }
    );
    return youtubeAnalyticsSyncJobsCollection(db).findOne({ _id: existing._id });
  }

  return existing;
}

export async function claimNextYoutubeAnalyticsSyncJob(db: Db) {
  await ensureYoutubeAnalyticsIndexes(db);
  const now = new Date();
  const result = await youtubeAnalyticsSyncJobsCollection(db).findOneAndUpdate(
    {
      state: 'queued',
      nextAttemptAt: { $lte: now },
    },
    {
      $set: {
        state: 'running',
        startedAt: now,
        lockedAt: now,
        updatedAt: now,
      },
    },
    { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: 'after' }
  );
  return result.value;
}

export async function completeYoutubeAnalyticsSyncJob(db: Db, jobId: ObjectId) {
  const now = new Date();
  await youtubeAnalyticsSyncJobsCollection(db).updateOne(
    { _id: jobId },
    { $set: { state: 'completed', completedAt: now, updatedAt: now } }
  );
}

export async function failYoutubeAnalyticsSyncJob(db: Db, job: YoutubeAnalyticsSyncJobDocument, error: string, retryable: boolean) {
  const now = new Date();
  const retryCount = job.retryCount + 1;
  const shouldRetry = retryable && retryCount <= job.maxRetries;
  const set: Record<string, unknown> = {
    state: shouldRetry ? 'queued' : 'failed',
    retryCount,
    error,
    nextAttemptAt: shouldRetry ? new Date(now.getTime() + retryCount * 15 * 60 * 1000) : now,
    updatedAt: now,
  };
  if (!shouldRetry) set.completedAt = now;
  await youtubeAnalyticsSyncJobsCollection(db).updateOne(
    { _id: job._id },
    {
      $set: set,
    }
  );
}

export async function appendYoutubeAnalyticsSyncRun(db: Db, input: Omit<YoutubeAnalyticsSyncRunDocument, '_id' | 'createdAt'>) {
  await youtubeAnalyticsSyncRunsCollection(db).insertOne({
    ...input,
    createdAt: new Date(),
  });
}

export async function findChannelsForAnalyticsSync(db: Db, channelObjectId?: ObjectId) {
  const query: Record<string, unknown> = {
    analyticsAccessStatus: 'active',
    refreshTokenEncrypted: { $ne: null },
    $or: [{ verificationStatus: 'approved' }, { cmsStatus: 'connected' }],
  };
  if (channelObjectId) query._id = channelObjectId;

  return youtubeChannelsCollection(db)
    .find(query)
    .sort({ lastAnalyticsSyncedAt: 1, connectedAt: 1 })
    .limit(channelObjectId ? 1 : 25)
    .toArray();
}

export async function upsertYoutubeDailySnapshots(db: Db, snapshots: YoutubeAnalyticsDailySnapshot[]) {
  if (!snapshots.length) return;
  await ensureYoutubeAnalyticsIndexes(db);
  await youtubeAnalyticsDailyCollection(db).bulkWrite(
    snapshots.map((snapshot) => ({
      updateOne: {
        filter: {
          channelObjectId: snapshot.channelObjectId,
          channelId: snapshot.channelId,
          date: snapshot.date,
        },
        update: {
          $set: {
            metrics: snapshot.metrics,
            syncedAt: snapshot.syncedAt,
            updatedAt: snapshot.updatedAt,
          },
          $setOnInsert: {
            createdAt: snapshot.createdAt,
          },
        },
        upsert: true,
      },
    }))
  );
}

export async function upsertYoutubeBreakdownSnapshots(db: Db, snapshots: YoutubeAnalyticsBreakdownSnapshot[]) {
  if (!snapshots.length) return;
  await ensureYoutubeAnalyticsIndexes(db);
  await youtubeAnalyticsBreakdownsCollection(db).bulkWrite(
    snapshots.map((snapshot) => ({
      updateOne: {
        filter: {
          channelObjectId: snapshot.channelObjectId,
          reportType: snapshot.reportType,
          startDate: snapshot.startDate,
          endDate: snapshot.endDate,
          dimensionKey: snapshot.dimensionKey,
        },
        update: {
          $set: {
            channelId: snapshot.channelId,
            dimensions: snapshot.dimensions,
            metrics: snapshot.metrics,
            syncedAt: snapshot.syncedAt,
            updatedAt: snapshot.updatedAt,
          },
          $setOnInsert: {
            createdAt: snapshot.createdAt,
          },
        },
        upsert: true,
      },
    }))
  );
}

export async function upsertYoutubeVideoSnapshots(db: Db, snapshots: YoutubeAnalyticsVideoSnapshot[]) {
  if (!snapshots.length) return;
  await ensureYoutubeAnalyticsIndexes(db);
  await youtubeAnalyticsVideosCollection(db).bulkWrite(
    snapshots.map((snapshot) => ({
      updateOne: {
        filter: {
          channelObjectId: snapshot.channelObjectId,
          videoId: snapshot.videoId,
          startDate: snapshot.startDate,
          endDate: snapshot.endDate,
        },
        update: {
          $set: {
            channelId: snapshot.channelId,
            title: snapshot.title,
            thumbnail: snapshot.thumbnail,
            publishedAt: snapshot.publishedAt,
            metrics: snapshot.metrics,
            publicStats: snapshot.publicStats,
            syncedAt: snapshot.syncedAt,
            updatedAt: snapshot.updatedAt,
          },
          $setOnInsert: {
            createdAt: snapshot.createdAt,
          },
        },
        upsert: true,
      },
    }))
  );
}

export async function readYoutubeAnalyticsDashboard(
  db: Db,
  input: {
    userId?: string | ObjectId;
    channelObjectId?: string | ObjectId;
    rangeDays: number;
    admin?: boolean;
  }
) {
  await ensureYoutubeAnalyticsIndexes(db);
  const channelFilter: Record<string, unknown> = {};
  if (input.userId) {
    const userId = toObjectId(input.userId);
    if (!userId) return emptyDashboard(input.rangeDays);
    channelFilter.userId = userId;
  }
  if (input.channelObjectId) {
    const channelObjectId = toObjectId(input.channelObjectId);
    if (!channelObjectId) return emptyDashboard(input.rangeDays);
    channelFilter._id = channelObjectId;
  }

  const channels = await youtubeChannelsCollection(db)
    .find(channelFilter, { projection: { accessTokenEncrypted: 0, refreshTokenEncrypted: 0 } })
    .sort({ connectedAt: -1 })
    .limit(input.admin ? 100 : 25)
    .toArray();
  const selected = channels[0];
  if (!selected?._id) return emptyDashboard(input.rangeDays);

  const endDate = dateKey(new Date());
  const startDate = dateKey(addDays(new Date(), -(input.rangeDays - 1)));
  const daily = await youtubeAnalyticsDailyCollection(db)
    .find({ channelObjectId: selected._id, date: { $gte: startDate, $lte: endDate } })
    .sort({ date: 1 })
    .toArray();
  const summary = sumMetrics(daily.map((row) => row.metrics));
  const latestBreakdowns = await readLatestBreakdowns(db, selected._id, input.rangeDays);
  const topVideos = await readLatestVideoSnapshots(db, selected._id, input.rangeDays);

  return {
    rangeDays: input.rangeDays,
    channels: channels.map((channel) => ({
      id: String(channel._id),
      channelId: channel.channelId,
      channelTitle: channel.channelTitle,
      thumbnail: channel.thumbnail || '',
      analyticsAccessStatus: channel.analyticsAccessStatus || 'reauthorization_required',
      analyticsSyncStatus: deriveSyncStatus(channel),
      lastAnalyticsSyncedAt: channel.lastAnalyticsSyncedAt?.toISOString(),
      nextAnalyticsSyncAt: channel.nextAnalyticsSyncAt?.toISOString(),
      analyticsError: channel.analyticsError || undefined,
    })),
    selectedChannelId: String(selected._id),
    summary,
    daily: daily.map((row) => ({ date: row.date, ...row.metrics })),
    breakdowns: latestBreakdowns,
    topVideos: topVideos.map((video) => ({
      videoId: video.videoId,
      title: video.title,
      thumbnail: video.thumbnail,
      publishedAt: video.publishedAt,
      ...video.metrics,
      publicStats: video.publicStats,
    })),
    sync: {
      lastSuccessfulSyncAt: selected.lastAnalyticsSyncedAt?.toISOString(),
      nextSyncEligibleAt: selected.nextAnalyticsSyncAt?.toISOString(),
      syncStatus: deriveSyncStatus(selected),
      missingScope: selected.analyticsAccessStatus === 'reauthorization_required',
      reauthorizationRequired: selected.analyticsAccessStatus === 'reauthorization_required',
      analyticsAccessStatus: selected.analyticsAccessStatus || 'reauthorization_required',
      error: selected.analyticsError || undefined,
    },
  };
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function sumMetrics(rows: YoutubeAnalyticsMetrics[]) {
  return rows.reduce((acc, row) => {
    YOUTUBE_ANALYTICS_METRICS.forEach((metric) => {
      acc[metric] += row[metric] || 0;
    });
    return acc;
  }, emptyYoutubeMetrics());
}

async function readLatestBreakdowns(db: Db, channelObjectId: ObjectId, rangeDays: number) {
  const rowsByType = await Promise.all(
    ['country', 'deviceType', 'trafficSource', 'demographics'].map(async (reportType) => {
      const latest = await youtubeAnalyticsBreakdownsCollection(db)
        .find({ channelObjectId, reportType: reportType as YoutubeAnalyticsReportType })
        .sort({ endDate: -1, syncedAt: -1 })
        .limit(500)
        .toArray();
      const matchingWindow = latest.find((row) => getWindowDays(row.startDate, row.endDate) === rangeDays);
      const selectedWindow = matchingWindow || latest[0];
      if (!selectedWindow) return [];

      return youtubeAnalyticsBreakdownsCollection(db)
        .find({
          channelObjectId,
          reportType: reportType as YoutubeAnalyticsReportType,
          startDate: selectedWindow.startDate,
          endDate: selectedWindow.endDate,
        })
        .sort({ 'metrics.views': -1 })
        .toArray();
    })
  );

  const rows = rowsByType.flat();

  return rows.reduce((acc, row) => {
    const key = row.reportType;
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      dimensionKey: row.dimensionKey,
      dimensions: row.dimensions,
      ...row.metrics,
    });
    return acc;
  }, {} as Record<YoutubeAnalyticsReportType, Array<Record<string, unknown>>>);
}

async function readLatestVideoSnapshots(db: Db, channelObjectId: ObjectId, rangeDays: number) {
  const latest = await youtubeAnalyticsVideosCollection(db)
    .find({ channelObjectId })
    .sort({ endDate: -1, syncedAt: -1 })
    .limit(500)
    .toArray();
  const matchingWindow = latest.find((row) => getWindowDays(row.startDate, row.endDate) === rangeDays);
  const selectedWindow = matchingWindow || latest[0];
  if (!selectedWindow) return [];

  return youtubeAnalyticsVideosCollection(db)
    .find({
      channelObjectId,
      startDate: selectedWindow.startDate,
      endDate: selectedWindow.endDate,
    })
    .sort({ 'metrics.views': -1 })
    .limit(10)
    .toArray();
}

function getWindowDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

function deriveSyncStatus(channel: Partial<YoutubeChannelDocument>): YoutubeAnalyticsSyncStatus {
  if (channel.analyticsSyncStatus === 'queued' || channel.analyticsSyncStatus === 'syncing' || channel.analyticsSyncStatus === 'failed') {
    return channel.analyticsSyncStatus;
  }
  if (!channel.lastAnalyticsSyncedAt) return 'never_synced';
  const ageMs = Date.now() - channel.lastAnalyticsSyncedAt.getTime();
  return ageMs > 36 * 60 * 60 * 1000 ? 'stale' : 'fresh';
}

function emptyDashboard(rangeDays: number) {
  return {
    rangeDays,
    channels: [],
    selectedChannelId: '',
    summary: emptyYoutubeMetrics(),
    daily: [],
    breakdowns: {},
    topVideos: [],
    sync: {
      syncStatus: 'never_synced' as YoutubeAnalyticsSyncStatus,
      missingScope: false,
      reauthorizationRequired: false,
      analyticsAccessStatus: 'reauthorization_required',
    },
  };
}
