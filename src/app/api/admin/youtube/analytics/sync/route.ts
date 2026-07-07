import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser, type CurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import { queueYoutubeAnalyticsSync, YoutubeAnalyticsSyncError } from '@/lib/services/youtubeAnalyticsSyncService';

function getClientKey(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function canManageYoutube(user: CurrentBackendUser) {
  return user.role === 'admin' || (user.role === 'subadmin' && user.permissions?.includes('analytics'));
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    if (!canManageYoutube(user)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    await enforceMongoRateLimit(db, {
      key: `POST:/api/admin/youtube/analytics/sync:${user._id || getClientKey(req)}`,
      limit: 30,
      windowMs: 60 * 1000,
    });

    const body = await req.json().catch(() => ({}));
    const job = await queueYoutubeAnalyticsSync(db, user, {
      channelObjectId: body?.channelId,
      scope: body?.scope === 'channel' ? 'channel' : 'all',
      windowDays: body?.windowDays,
    });

    return NextResponse.json({
      success: true,
      data: {
        job: job
          ? {
              id: job._id.toHexString(),
              state: job.state,
              scope: job.scope,
              windowDays: job.windowDays,
              nextAttemptAt: job.nextAttemptAt.toISOString(),
            }
          : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to queue YouTube analytics sync';
    const status =
      error instanceof YoutubeAnalyticsSyncError
        ? error.statusCode
        : error instanceof RateLimitError
          ? error.statusCode
          : message === 'Authentication required'
            ? 401
            : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const dynamic = 'force-dynamic';
