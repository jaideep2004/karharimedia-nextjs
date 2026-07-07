import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser, type CurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import { listChannelsForAdmin } from '@/lib/services/youtubeChannelService';

function getClientKey(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'   
  );
}

function canManageYoutube(user: CurrentBackendUser) {
  return user.role === 'admin' || (user.role === 'subadmin' && user.permissions?.includes('settings'));
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    if (!canManageYoutube(user)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    await enforceMongoRateLimit(db, {
      key: `GET:/api/admin/youtube/channels:${user._id || getClientKey(req)}`,
      limit: 120,
      windowMs: 60 * 1000,
    });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(10, Number(searchParams.get('limit') || 25)));
    const { channels, total } = await listChannelsForAdmin(db, {
      page,
      limit,
      query: searchParams.get('q') || undefined,
      verificationStatus: searchParams.get('verificationStatus') || undefined,
      cmsStatus: searchParams.get('cmsStatus') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        channels,
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load YouTube channels';
    const status = error instanceof RateLimitError ? error.statusCode : message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const dynamic = 'force-dynamic';
