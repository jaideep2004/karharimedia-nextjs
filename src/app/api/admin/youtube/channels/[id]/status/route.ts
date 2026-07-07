import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser, type CurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import {
  applyYoutubeAdminAction,
  YoutubeChannelError,
} from '@/lib/services/youtubeChannelService';

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentBackendUser();
    if (!canManageYoutube(user)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    await enforceMongoRateLimit(db, {
      key: `PATCH:/api/admin/youtube/channels/status:${user._id || getClientKey(req)}`,
      limit: 60,
      windowMs: 60 * 1000,
    });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const channel = await applyYoutubeAdminAction(db, user, id, body?.action, body?.note);

    return NextResponse.json({ success: true, data: { channel } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update YouTube channel';
    const status =
      error instanceof YoutubeChannelError
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
