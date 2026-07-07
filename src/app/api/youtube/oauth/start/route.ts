import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import { createYoutubeOAuthStartUrl, YoutubeAuthError } from '@/lib/services/youtubeAuthService';

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
      key: `GET:/api/youtube/oauth/start:${user._id || getClientKey(req)}`,
      limit: 20,
      windowMs: 60 * 1000,
    });

    const authUrl = await createYoutubeOAuthStartUrl(db, user, req.url);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start YouTube connection';
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
