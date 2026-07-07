import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser, type CurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import { readYoutubeAnalyticsDashboard } from '@/lib/repositories/youtubeAnalytics';

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentBackendUser();
    if (!canManageYoutube(user)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    await enforceMongoRateLimit(db, {
      key: `GET:/api/admin/youtube/channels/analytics:${user._id || getClientKey(req)}`,
      limit: 120,
      windowMs: 60 * 1000,
    });

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const dashboard = await readYoutubeAnalyticsDashboard(db, {
      channelObjectId: id,
      rangeDays: normalizeRange(searchParams.get('range')),
      admin: true,
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
