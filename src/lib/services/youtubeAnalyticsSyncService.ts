import 'server-only';

import { ObjectId, type Db } from 'mongodb';
import {
  queryYoutubeAnalyticsReport,
  mapYoutubeAnalyticsRows,
  YoutubeAnalyticsApiError,
  type YoutubeAnalyticsMetric,
} from '@/lib/adapters/youtubeAnalyticsAdapter';
import { fetchYoutubeVideosMetadata, YoutubeDataApiError } from '@/lib/adapters/youtubeDataAdapter';
import type { CurrentBackendUser } from '@/lib/currentUser';
import {
  addDays,
  appendYoutubeAnalyticsSyncRun,
  claimNextYoutubeAnalyticsSyncJob,
  completeYoutubeAnalyticsSyncJob,
  dateKey,
  failYoutubeAnalyticsSyncJob,
  findChannelsForAnalyticsSync,
  normalizeYoutubeMetrics,
  queueYoutubeAnalyticsSyncJob,
  upsertYoutubeBreakdownSnapshots,
  upsertYoutubeDailySnapshots,
  upsertYoutubeVideoSnapshots,
  YOUTUBE_ANALYTICS_METRICS,
  type YoutubeAnalyticsReportType,
  type YoutubeAnalyticsSyncJobDocument,
} from '@/lib/repositories/youtubeAnalytics';
import {
  findYoutubeChannelByObjectId,
  updateYoutubeChannelAnalyticsState,
  type YoutubeChannelDocument,
} from '@/lib/repositories/youtube';
import { toObjectId } from '@/lib/repositories/tracks';
import { hasYoutubeAnalyticsScope } from '@/lib/services/youtubeAuthService';
import { getFreshYoutubeAccessToken, YoutubeTokenError } from '@/lib/services/youtubeTokenService';
import { connectToDatabase } from '@/utils/mongodb';

const DEFAULT_WINDOW_DAYS = 90;

export class YoutubeAnalyticsSyncError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'YoutubeAnalyticsSyncError';
    this.statusCode = statusCode;
  }
}

export async function queueYoutubeAnalyticsSync(
  db: Db,
  user: CurrentBackendUser,
  input: { channelObjectId?: unknown; scope?: 'channel' | 'all'; windowDays?: unknown }
) {
  const windowDays = sanitizeWindowDays(input.windowDays);
  const scope = input.channelObjectId ? 'channel' : input.scope || 'all';
  const channelObjectId = input.channelObjectId ? toObjectId(input.channelObjectId) || undefined : undefined;
  if (input.channelObjectId && !channelObjectId) {
    throw new YoutubeAnalyticsSyncError('Invalid YouTube channel id');
  }

  const idDate = dateKey(new Date());
  const idempotencyKey = scope === 'channel'
    ? `youtube-analytics:${channelObjectId}:${windowDays}:${idDate}`
    : `youtube-analytics:all:${windowDays}:${idDate}`;
  const job = await queueYoutubeAnalyticsSyncJob(db, {
    channelObjectId,
    scope,
    windowDays,
    idempotencyKey,
    createdBy: user._id,
    createdByEmail: user.email,
  });

  if (channelObjectId) {
    await updateYoutubeChannelAnalyticsState(db, channelObjectId, {
      analyticsSyncStatus: 'queued',
      nextAnalyticsSyncAt: new Date(),
      analyticsError: null,
    });
  }

  return job;
}

export async function processDueYoutubeAnalyticsSyncJobs(maxJobs = 3) {
  const { db } = await connectToDatabase();
  const processed: Array<{ jobId: string; state: string; error?: string }> = [];
  await queueYoutubeAnalyticsSyncJob(db, {
    scope: 'all',
    windowDays: 35,
    idempotencyKey: `youtube-analytics:cron:35:${dateKey(new Date())}`,
    createdBy: 'system',
    createdByEmail: 'cron',
  });

  for (let index = 0; index < maxJobs; index += 1) {
    const job = await claimNextYoutubeAnalyticsSyncJob(db);
    if (!job) break;
    try {
      await processYoutubeAnalyticsSyncJob(db, job);
      await completeYoutubeAnalyticsSyncJob(db, job._id);
      processed.push({ jobId: job._id.toHexString(), state: 'completed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'YouTube analytics sync failed';
      const retryable = isRetryableSyncError(error);
      await failYoutubeAnalyticsSyncJob(db, job, message, retryable);
      processed.push({ jobId: job._id.toHexString(), state: retryable ? 'queued' : 'failed', error: message });
    }
  }

  return { processed };
}

async function processYoutubeAnalyticsSyncJob(db: Db, job: YoutubeAnalyticsSyncJobDocument) {
  const channels = await findChannelsForAnalyticsSync(db, job.scope === 'channel' ? job.channelObjectId : undefined);
  if (channels.length === 0) return;

  for (const channel of channels) {
    if (!channel._id) continue;
    try {
      await syncYoutubeChannelAnalytics(db, job, channel);
    } catch (error) {
      if (job.scope === 'channel') throw error;
    }
  }
}

async function syncYoutubeChannelAnalytics(db: Db, job: YoutubeAnalyticsSyncJobDocument, channel: YoutubeChannelDocument) {
  if (!channel._id || !(channel._id instanceof ObjectId)) return;
  await appendYoutubeAnalyticsSyncRun(db, {
    jobId: job._id,
    channelObjectId: channel._id,
    channelId: channel.channelId,
    state: 'started',
    message: `Started ${job.windowDays} day analytics sync`,
  });
  await updateYoutubeChannelAnalyticsState(db, channel._id, {
    analyticsSyncStatus: 'syncing',
    analyticsError: null,
  });

  try {
    if (!hasYoutubeAnalyticsScope(channel.grantedScopes)) {
      await updateYoutubeChannelAnalyticsState(db, channel._id, {
        analyticsAccessStatus: 'reauthorization_required',
        analyticsSyncStatus: 'failed',
        analyticsError: 'YouTube Analytics scope missing. Reconnect channel.',
      });
      await appendYoutubeAnalyticsSyncRun(db, {
        jobId: job._id,
        channelObjectId: channel._id,
        channelId: channel.channelId,
        state: 'skipped',
        message: 'Missing YouTube Analytics scope',
      });
      return;
    }

    const { accessToken } = await getFreshYoutubeAccessToken(db, channel);
    const endDate = dateKey(new Date());
    const rangeWindows = [...new Set([job.windowDays, 90, 28, 7, 2].filter((days) => days <= Math.max(90, job.windowDays)))];
    await syncDailyReport(db, channel, accessToken, job.windowDays, endDate);

    for (const days of rangeWindows) {
      await syncBreakdownsForWindow(db, channel, accessToken, days, endDate);
      await syncTopVideosForWindow(db, channel, accessToken, days, endDate);
    }

    const nextSync = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await updateYoutubeChannelAnalyticsState(db, channel._id, {
      analyticsAccessStatus: 'active',
      analyticsSyncStatus: 'fresh',
      lastAnalyticsSyncedAt: new Date(),
      nextAnalyticsSyncAt: nextSync,
      analyticsError: null,
    });
    await appendYoutubeAnalyticsSyncRun(db, {
      jobId: job._id,
      channelObjectId: channel._id,
      channelId: channel.channelId,
      state: 'completed',
      message: 'Analytics snapshots stored',
    });
  } catch (error) {
    await handleChannelSyncError(db, job, channel, error);
    throw error;
  }
}

async function syncDailyReport(db: Db, channel: YoutubeChannelDocument, accessToken: string, windowDays: number, endDate: string) {
  if (!channel._id) return;
  const startDate = dateKey(addDays(new Date(endDate), -(windowDays - 1)));
  const report = await queryYoutubeAnalyticsReport({
    accessToken,
    channelId: channel.channelId,
    startDate,
    endDate,
    dimensions: ['day'],
    metrics: YOUTUBE_ANALYTICS_METRICS,
    sort: 'day',
  });
  const now = new Date();
  const rows = mapYoutubeAnalyticsRows(report);
  await upsertYoutubeDailySnapshots(
    db,
    rows.map((row) => ({
      channelObjectId: channel._id!,
      channelId: channel.channelId,
      date: String(row.day || ''),
      metrics: normalizeYoutubeMetrics(row),
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
    })).filter((row) => row.date)
  );
}

async function syncBreakdownsForWindow(db: Db, channel: YoutubeChannelDocument, accessToken: string, windowDays: number, endDate: string) {
  const startDate = dateKey(addDays(new Date(endDate), -(windowDays - 1)));
  const definitions: Array<{ reportType: YoutubeAnalyticsReportType; dimensions: string[]; sort?: string; maxResults?: number }> = [
    { reportType: 'country', dimensions: ['country'], sort: '-views', maxResults: 25 },
    { reportType: 'deviceType', dimensions: ['deviceType'], sort: '-views', maxResults: 20 },
    { reportType: 'trafficSource', dimensions: ['insightTrafficSourceType'], sort: '-views', maxResults: 25 },
    { reportType: 'demographics', dimensions: ['ageGroup', 'gender'], sort: '-viewerPercentage', maxResults: 50 },
  ];

  for (const definition of definitions) {
    const metrics: YoutubeAnalyticsMetric[] = getBreakdownMetrics(definition.reportType);
    const report = await queryYoutubeAnalyticsReport({
      accessToken,
      channelId: channel.channelId,
      startDate,
      endDate,
      dimensions: definition.dimensions,
      metrics,
      sort: definition.sort,
      maxResults: definition.maxResults,
    });
    const now = new Date();
    const rows = mapYoutubeAnalyticsRows(report);
    await upsertYoutubeBreakdownSnapshots(
      db,
      rows.map((row) => {
        const dimensions = Object.fromEntries(definition.dimensions.map((dimension) => [dimension, String(row[dimension] || '')]));
        const dimensionKey = definition.dimensions.map((dimension) => dimensions[dimension]).join(':');
        const normalized = normalizeYoutubeMetrics(row);
        if (definition.reportType === 'demographics') {
          normalized.views = Number(row.viewerPercentage || 0);
        }
        return {
          channelObjectId: channel._id!,
          channelId: channel.channelId,
          reportType: definition.reportType,
          startDate,
          endDate,
          dimensionKey,
          dimensions,
          metrics: normalized,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        };
      }).filter((row) => row.dimensionKey)
    );
  }
}

function getBreakdownMetrics(reportType: YoutubeAnalyticsReportType): YoutubeAnalyticsMetric[] {
  if (reportType === 'demographics') return ['viewerPercentage'];
  if (reportType === 'deviceType' || reportType === 'trafficSource') {
    return ['views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage'];
  }
  return YOUTUBE_ANALYTICS_METRICS;
}

async function syncTopVideosForWindow(db: Db, channel: YoutubeChannelDocument, accessToken: string, windowDays: number, endDate: string) {
  if (!channel._id) return;
  const startDate = dateKey(addDays(new Date(endDate), -(windowDays - 1)));
  const report = await queryYoutubeAnalyticsReport({
    accessToken,
    channelId: channel.channelId,
    startDate,
    endDate,
    dimensions: ['video'],
    metrics: YOUTUBE_ANALYTICS_METRICS,
    sort: '-views',
    maxResults: 25,
  });
  const rows = mapYoutubeAnalyticsRows(report);
  const videoIds = rows.map((row) => String(row.video || '')).filter(Boolean);
  const metadata = await fetchYoutubeVideosMetadata(accessToken, videoIds);
  const now = new Date();
  await upsertYoutubeVideoSnapshots(
    db,
    rows.map((row) => {
      const videoId = String(row.video || '');
      const meta = metadata.get(videoId);
      return {
        channelObjectId: channel._id!,
        channelId: channel.channelId,
        videoId,
        startDate,
        endDate,
        title: meta?.title || videoId,
        thumbnail: meta?.thumbnail || '',
        publishedAt: meta?.publishedAt,
        metrics: normalizeYoutubeMetrics(row),
        publicStats: {
          views: meta?.publicViews || 0,
          likes: meta?.publicLikes || 0,
          comments: meta?.publicComments || 0,
        },
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      };
    }).filter((row) => row.videoId)
  );
}

async function handleChannelSyncError(
  db: Db,
  job: YoutubeAnalyticsSyncJobDocument,
  channel: YoutubeChannelDocument,
  error: unknown
) {
  if (!channel._id) return;
  const message = error instanceof Error ? error.message : 'YouTube analytics sync failed';
  let analyticsAccessStatus = channel.analyticsAccessStatus || 'active';
  if (error instanceof YoutubeTokenError) analyticsAccessStatus = 'reauthorization_required';
  if (error instanceof YoutubeAnalyticsApiError && error.statusCode === 403) analyticsAccessStatus = 'analytics_denied';
  if (error instanceof YoutubeAnalyticsApiError && error.statusCode === 401) analyticsAccessStatus = 'reauthorization_required';

  await updateYoutubeChannelAnalyticsState(db, channel._id, {
    analyticsAccessStatus,
    analyticsSyncStatus: 'failed',
    analyticsError: message,
    nextAnalyticsSyncAt: isRetryableSyncError(error)
      ? new Date(Date.now() + 30 * 60 * 1000)
      : undefined,
  });
  await appendYoutubeAnalyticsSyncRun(db, {
    jobId: job._id,
    channelObjectId: channel._id,
    channelId: channel.channelId,
    state: 'failed',
    message,
    errorCode: error instanceof Error ? error.name : undefined,
  });
}

export async function getYoutubeAnalyticsChannelForAdmin(db: Db, channelObjectId: string) {
  const channel = await findYoutubeChannelByObjectId(db, channelObjectId);
  if (!channel) throw new YoutubeAnalyticsSyncError('YouTube channel not found', 404);
  return channel;
}

function sanitizeWindowDays(value: unknown) {
  const parsed = Number(value || DEFAULT_WINDOW_DAYS);
  if (![2, 7, 28, 35, 90].includes(parsed)) return DEFAULT_WINDOW_DAYS;
  return parsed;
}

function isRetryableSyncError(error: unknown) {
  if (error instanceof YoutubeAnalyticsApiError || error instanceof YoutubeDataApiError || error instanceof YoutubeTokenError) {
    return error.statusCode === 429 || error.statusCode >= 500;
  }
  return true;
}
