import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import {
  listChannelsForUser,
  saveSelectedYoutubeChannel,
  YoutubeChannelError,
} from '@/lib/services/youtubeChannelService';

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
      key: `GET:/api/youtube/channels:${user._id || getClientKey(req)}`,
      limit: 120,
      windowMs: 60 * 1000,
    });

    const channels = await listChannelsForUser(db, user);
    return NextResponse.json({ success: true, data: { channels } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load YouTube channels';
    const status = error instanceof RateLimitError ? error.statusCode : message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    await enforceMongoRateLimit(db, {
      key: `POST:/api/youtube/channels:${user._id || getClientKey(req)}`,
      limit: 30,
      windowMs: 60 * 1000,
    });

    const body = await req.json().catch(() => ({}));
    const channel = await saveSelectedYoutubeChannel(db, user, {
      sessionId: body?.sessionId,
      channelId: body?.channelId,
    });

    return NextResponse.json({ success: true, data: { channel } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save YouTube channel';
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
