import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import {
  getYoutubeDashboardRedirect,
  handleYoutubeOAuthCallback,
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
  const { searchParams } = new URL(req.url);
  const providerError = searchParams.get('error');
  if (providerError) {
    return NextResponse.redirect(
      getYoutubeDashboardRedirect(req.url, { youtubeError: providerError })
    );
  }

  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    await enforceMongoRateLimit(db, {
      key: `GET:/api/youtube/oauth/callback:${user._id || getClientKey(req)}`,
      limit: 30,
      windowMs: 60 * 1000,
    });

    const result = await handleYoutubeOAuthCallback(
      db,
      user,
      req.url,
      searchParams.get('code'),
      searchParams.get('state')
    );

    return NextResponse.redirect(
      getYoutubeDashboardRedirect(req.url, { connectSession: result.sessionId })
    );
  } catch (error) {
    const message =
      error instanceof YoutubeAuthError || error instanceof RateLimitError || error instanceof Error
        ? error.message
        : 'Failed to connect YouTube channel';

    return NextResponse.redirect(
      getYoutubeDashboardRedirect(req.url, { youtubeError: message })
    );
  }
}

export const dynamic = 'force-dynamic';
