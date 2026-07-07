import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import {
  getYoutubeOAuthSessionForUser,
  YoutubeAuthError,
} from '@/lib/services/youtubeAuthService';

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
      key: `GET:/api/youtube/oauth/session:${user._id || getClientKey(req)}`,
      limit: 60,
      windowMs: 60 * 1000,
    });

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'Missing sessionId' }, { status: 400 });
    }

    const session = await getYoutubeOAuthSessionForUser(db, sessionId, user._id);
    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load YouTube session';
    const status =
      error instanceof YoutubeAuthError
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
