import 'server-only';

const YOUTUBE_ANALYTICS_REPORTS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';

export type YoutubeAnalyticsMetric =
  | 'views'
  | 'estimatedMinutesWatched'
  | 'averageViewDuration'
  | 'averageViewPercentage'
  | 'subscribersGained'
  | 'subscribersLost'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'viewerPercentage';

export type YoutubeAnalyticsQuery = {
  accessToken: string;
  channelId: string;
  startDate: string;
  endDate: string;
  metrics: YoutubeAnalyticsMetric[];
  dimensions?: string[];
  filters?: string;
  sort?: string;
  maxResults?: number;
};

export type YoutubeAnalyticsReport = {
  columnHeaders?: Array<{ name?: string; columnType?: string; dataType?: string }>;
  rows?: Array<Array<string | number | null>>;
  error?: { code?: number; message?: string; status?: string };
};

export class YoutubeAnalyticsApiError extends Error {
  statusCode: number;
  providerStatus?: string;

  constructor(message: string, statusCode: number, providerStatus?: string) {
    super(message);
    this.name = 'YoutubeAnalyticsApiError';
    this.statusCode = statusCode;
    this.providerStatus = providerStatus;
  }
}

export async function queryYoutubeAnalyticsReport(query: YoutubeAnalyticsQuery) {
  const url = new URL(YOUTUBE_ANALYTICS_REPORTS_URL);
  url.searchParams.set('ids', `channel==${query.channelId}`);
  url.searchParams.set('startDate', query.startDate);
  url.searchParams.set('endDate', query.endDate);
  url.searchParams.set('metrics', query.metrics.join(','));
  if (query.dimensions?.length) url.searchParams.set('dimensions', query.dimensions.join(','));
  if (query.filters) url.searchParams.set('filters', query.filters);
  if (query.sort) url.searchParams.set('sort', query.sort);
  if (query.maxResults) url.searchParams.set('maxResults', String(query.maxResults));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${query.accessToken}` },
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as YoutubeAnalyticsReport;

  if (!response.ok) {
    throw new YoutubeAnalyticsApiError(
      payload.error?.message || 'YouTube Analytics API request failed',
      response.status,
      payload.error?.status
    );
  }

  return payload;
}

export function mapYoutubeAnalyticsRows(report: YoutubeAnalyticsReport) {
  const headers = (report.columnHeaders || []).map((header) => String(header.name || ''));
  return (report.rows || []).map((row) => {
    const record: Record<string, string | number | null> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? null;
    });
    return record;
  });
}
