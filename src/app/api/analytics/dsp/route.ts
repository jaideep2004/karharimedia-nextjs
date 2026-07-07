import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';

function getClientKey(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function normalizeRange(value: string | null) {
  if (value === '7d') return 7;
  if (value === '90d') return 90;
  return 30;
}

function cutoffDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    await enforceMongoRateLimit(db, {
      key: `GET:/api/analytics/dsp:${user._id || getClientKey(req)}`,
      limit: 120,
      windowMs: 60 * 1000,
    });

    const { searchParams } = new URL(req.url);
    const rangeDays = normalizeRange(searchParams.get('range'));
    const latest = await db.collection('bromaStatisticsReports').findOne(
      { state: 'completed', deletedAt: { $exists: false } },
      { sort: { lastSyncedAt: -1, createdAt: -1 } }
    );

    const normalized = latest?.normalized && typeof latest.normalized === 'object'
      ? latest.normalized as Record<string, any>
      : null;
    const minDate = cutoffDate(rangeDays);
    const daily = Array.isArray(normalized?.daily)
      ? normalized.daily
          .filter((row: any) => String(row?.date || '') >= minDate)
          .map((row: any) => ({ date: String(row.date || ''), value: Number(row.value || 0) }))
      : [];
    const totalStreams = daily.length
      ? daily.reduce((sum: number, row: { value: number }) => sum + row.value, 0)
      : Number(normalized?.totalStreams || 0);

    return NextResponse.json({
      success: true,
      data: {
        hasData: Boolean(normalized),
        source: 'broma',
        rangeDays,
        lastSyncedAt: latest?.lastSyncedAt || latest?.updatedAt || null,
        metrics: {
          totalStreams,
          uniqueListeners: Number(normalized?.uniqueListeners || 0),
          averageDailyStreams: daily.length ? Math.round(totalStreams / daily.length) : Number(normalized?.averageDailyStreams || 0),
          profileViews: Number(normalized?.profileViews || 0),
        },
        daily,
        platforms: Array.isArray(normalized?.platforms) ? normalized.platforms : [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load DSP analytics';
    const status = error instanceof RateLimitError ? error.statusCode : message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const dynamic = 'force-dynamic';
