import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import { readYoutubeAnalyticsDashboard } from '@/lib/repositories/youtubeAnalytics';

function getClientKey(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    await enforceMongoRateLimit(db, {
      key: `GET:/api/youtube/analytics:${user._id || getClientKey(req)}`,
      limit: 120,
      windowMs: 60 * 1000,
    });

    const { searchParams } = new URL(req.url);
    const rangeDays = normalizeRange(searchParams.get('range'));
    const dashboard = await readYoutubeAnalyticsDashboard(db, {
      userId: user._id,
      channelObjectId: searchParams.get('channelId') || undefined,
      rangeDays,
    });

    return NextResponse.json({ success: true, data: dashboard });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load YouTube analytics';
    const status = error instanceof RateLimitError ? error.statusCode : message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

function normalizeRange(value: string | null) {
  if (value === '7d') return 7;
  if (value === '90d') return 90;
  return 28;
}

export const dynamic = 'force-dynamic';
