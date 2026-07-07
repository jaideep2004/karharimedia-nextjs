import BromaStatisticsReport from '../../models/bromaStatisticsReport.model';
import { BromaClient } from './connectors/bromaClient';

const firstString = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const responseData = (response: any) => response?.data ?? response ?? {};

const getReportId = (response: any) => {
  const data = responseData(response);
  return firstString(data.id, data.report_id, data.reportId, response?.id, response?.report_id, response?.reportId);
};

const getReportState = (response: any) => {
  const data = responseData(response);
  const raw = firstString(data.status, data.state, data.report_status, data.reportStatus, response?.status, response?.state)
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');

  if (!raw) return 'processing';
  if (['completed', 'complete', 'done', 'success', 'ready', 'finished'].includes(raw)) return 'completed';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(raw)) return 'failed';
  return 'processing';
};

const collectRows = (response: any): Record<string, any>[] => {
  const data = responseData(response);
  const candidates = [
    data.rows,
    data.items,
    data.report,
    data.statistics,
    data.data,
    response?.rows,
    response?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((row): row is Record<string, any> => row && typeof row === 'object' && !Array.isArray(row));
    }
  }

  return [];
};

const normalizeBromaStatistics = (response: any) => {
  const rows = collectRows(response);
  const data = responseData(response);
  const byPlatform = new Map<string, number>();
  const byDate = new Map<string, number>();
  let totalStreams = firstNumber(data.total_streams, data.totalStreams, data.streams, data.total);
  let totalListeners = firstNumber(data.unique_listeners, data.uniqueListeners, data.listeners);

  for (const row of rows) {
    const streams = firstNumber(row.streams, row.stream_count, row.streamCount, row.quantity, row.count, row.total);
    const listeners = firstNumber(row.unique_listeners, row.uniqueListeners, row.listeners);
    const platform = firstString(row.outlet, row.platform, row.store, row.service, row.dsp, row.outlet_name, row.outletName);
    const date = firstString(row.date, row.report_date, row.reportDate, row.day);

    totalStreams += streams;
    totalListeners += listeners;
    if (platform) byPlatform.set(platform, (byPlatform.get(platform) || 0) + streams);
    if (date) byDate.set(date.slice(0, 10), (byDate.get(date.slice(0, 10)) || 0) + streams);
  }

  const platforms = Array.from(byPlatform.entries())
    .map(([name, value]) => ({
      name,
      value,
      pct: totalStreams > 0 ? Math.round((value / totalStreams) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const daily = Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalStreams,
    uniqueListeners: totalListeners,
    averageDailyStreams: daily.length ? Math.round(totalStreams / daily.length) : 0,
    profileViews: firstNumber(data.profile_views, data.profileViews),
    platforms,
    daily,
    rowCount: rows.length,
  };
};

const reportFile = (response: any) => {
  const data = responseData(response);
  const url = firstString(data.file_url, data.fileUrl, data.url, data.download_url, data.downloadUrl, response?.file_url, response?.url);
  const name = firstString(data.file_name, data.fileName, data.filename, response?.file_name, response?.filename);
  return { url, name };
};

export async function createBromaStatisticsReport(input: {
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
  payload: Record<string, unknown>;
  reportKind?: 'detail' | 'summary';
  requestedBy?: string;
}) {
  const accountId = firstString(input.config.accountId, input.config.account_id);
  if (!accountId) throw new Error('Broma accountId is required for statistics sync');

  const client = new BromaClient({ credentials: input.credentials, config: input.config });
  const reportKind = input.reportKind || 'summary';
  const response = reportKind === 'detail'
    ? await client.createStatisticsReport(accountId, input.payload)
    : await client.createStatisticsSummaryReport(accountId, input.payload);
  const bromaReportId = getReportId(response);
  const state = getReportState(response);
  const normalized = normalizeBromaStatistics(response);
  const file = reportFile(response);

  return BromaStatisticsReport.create({
    accountId,
    bromaReportId,
    reportKind,
    state,
    requestPayload: input.payload,
    rawResponse: response,
    normalized,
    rowCount: normalized.rowCount,
    fileUrl: file.url,
    fileName: file.name,
    requestedBy: input.requestedBy,
    requestedAt: new Date(),
    lastSyncedAt: new Date(),
    lastError: state === 'failed' ? 'Broma statistics report failed' : undefined,
  });
}

export async function refreshBromaStatisticsReport(input: {
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
  reportId: string;
}) {
  const accountId = firstString(input.config.accountId, input.config.account_id);
  if (!accountId) throw new Error('Broma accountId is required for statistics refresh');

  const existing = await BromaStatisticsReport.findById(input.reportId);
  if (!existing) throw new Error('Broma statistics report not found');
  if (!existing.bromaReportId) return existing;

  const client = new BromaClient({ credentials: input.credentials, config: input.config });
  const response = await client.getStatisticsReport(accountId, existing.bromaReportId);
  const state = getReportState(response);
  const normalized = normalizeBromaStatistics(response);
  const file = reportFile(response);

  existing.state = state;
  existing.rawResponse = response;
  existing.normalized = normalized;
  existing.rowCount = normalized.rowCount;
  existing.fileUrl = file.url || existing.fileUrl;
  existing.fileName = file.name || existing.fileName;
  existing.lastSyncedAt = new Date();
  existing.lastError = state === 'failed' ? 'Broma statistics report failed' : undefined;
  await existing.save();
  return existing;
}

export async function deleteBromaStatisticsReport(input: {
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
  reportId: string;
}) {
  const accountId = firstString(input.config.accountId, input.config.account_id);
  if (!accountId) throw new Error('Broma accountId is required for statistics delete');

  const existing = await BromaStatisticsReport.findById(input.reportId);
  if (!existing) throw new Error('Broma statistics report not found');

  if (existing.bromaReportId) {
    const client = new BromaClient({ credentials: input.credentials, config: input.config });
    await client.deleteStatisticsReport(accountId, existing.bromaReportId);
  }

  existing.state = 'deleted';
  existing.deletedAt = new Date();
  await existing.save();
  return existing;
}

export async function listBromaStatisticsReports(limit = 20) {
  return BromaStatisticsReport.find({ state: { $ne: 'deleted' } })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();
}
