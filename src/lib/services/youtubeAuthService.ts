import crypto from 'crypto';
import { Db, ObjectId } from 'mongodb';
import { encryptSecret } from '@/lib/secretEncryption';
import type { CurrentBackendUser } from '@/lib/currentUser';
import type { YoutubeChannelCandidate } from '@/lib/youtube';
import {
  consumeYoutubeOAuthState,
  createYoutubeOAuthSession,
  createYoutubeOAuthState,
  findYoutubeOAuthSession,
} from '@/lib/repositories/youtube';
import { toObjectId } from '@/lib/repositories/tracks';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const YOUTUBE_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';
export const YOUTUBE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/youtube.readonly',
  YOUTUBE_ANALYTICS_SCOPE,
];
const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfoResponse = {
  email?: string;
  error?: string;
  error_description?: string;
};

type YoutubeChannelsResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    statistics?: {
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class YoutubeAuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'YoutubeAuthError';
    this.statusCode = statusCode;
  }
}

export async function createYoutubeOAuthStartUrl(
  db: Db,
  user: CurrentBackendUser,
  requestUrl: string
) {
  const config = getGoogleOAuthConfig(requestUrl);
  const userId = toObjectId(user._id);
  if (!userId) {
    throw new YoutubeAuthError('Invalid authenticated user', 401);
  }

  const state = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  await createYoutubeOAuthState(db, {
    _id: hashState(state),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
  });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function handleYoutubeOAuthCallback(
  db: Db,
  user: CurrentBackendUser,
  requestUrl: string,
  code: string | null,
  state: string | null
) {
  if (!code) throw new YoutubeAuthError('Missing Google authorization code');
  if (!state) throw new YoutubeAuthError('Missing OAuth state');

  const userId = toObjectId(user._id);
  if (!userId) throw new YoutubeAuthError('Invalid authenticated user', 401);

  const stateRecord = await consumeYoutubeOAuthState(db, hashState(state));
  if (!stateRecord || !stateRecord.userId.equals(userId)) {
    throw new YoutubeAuthError('Invalid or expired OAuth state', 401);
  }

  const config = getGoogleOAuthConfig(requestUrl);
  const tokens = await exchangeCodeForTokens(config, code);
  if (!tokens.access_token) {
    throw new YoutubeAuthError('Google did not return an access token', 502);
  }

  const [googleAccountEmail, channels] = await Promise.all([
    fetchGoogleAccountEmail(tokens.access_token),
    fetchYoutubeChannels(tokens.access_token),
  ]);

  const now = new Date();
  const sessionId = crypto.randomBytes(24).toString('base64url');
  await createYoutubeOAuthSession(db, {
    _id: sessionId,
    userId,
    googleAccountEmail,
    channels,
    accessTokenEncrypted: encryptSecret(tokens.access_token),
    refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
    grantedScopes: parseGrantedScopes(tokens.scope),
    tokenExpiresAt: tokens.expires_in
      ? new Date(now.getTime() + tokens.expires_in * 1000)
      : undefined,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });

  return { sessionId, channels };
}

export async function getYoutubeOAuthSessionForUser(db: Db, sessionId: string, userId: string) {
  const userObjectId = toObjectId(userId);
  if (!userObjectId) throw new YoutubeAuthError('Invalid authenticated user', 401);

  const session = await findYoutubeOAuthSession(db, sessionId);
  if (!session || !session.userId.equals(userObjectId)) {
    throw new YoutubeAuthError('Channel selection session expired', 404);
  }

  return {
    sessionId: session._id,
    googleAccountEmail: session.googleAccountEmail,
    channels: session.channels,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export function getYoutubeDashboardRedirect(requestUrl: string, params: Record<string, string>) {
  const url = new URL('/dashboard/youtube-network', requestUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

function getGoogleOAuthConfig(requestUrl: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    new URL('/api/youtube/oauth/callback', requestUrl).toString();

  if (!clientId) throw new YoutubeAuthError('GOOGLE_OAUTH_CLIENT_ID is not configured', 500);
  if (!clientSecret) throw new YoutubeAuthError('GOOGLE_OAUTH_CLIENT_SECRET is not configured', 500);

  return { clientId, clientSecret, redirectUri };
}

async function exchangeCodeForTokens(
  config: { clientId: string; clientSecret: string; redirectUri: string },
  code: string
) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok) {
    throw new YoutubeAuthError(payload.error_description || payload.error || 'Google OAuth token exchange failed', 502);
  }

  return payload;
}

async function fetchGoogleAccountEmail(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as GoogleUserInfoResponse;

  if (!response.ok || !payload.email) {
    throw new YoutubeAuthError(payload.error_description || payload.error || 'Failed to read Google account email', 502);
  }

  return payload.email;
}

async function fetchYoutubeChannels(accessToken: string): Promise<YoutubeChannelCandidate[]> {
  const url = new URL(YOUTUBE_CHANNELS_URL);
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('mine', 'true');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as YoutubeChannelsResponse;

  if (!response.ok) {
    throw new YoutubeAuthError(payload.error?.message || 'Failed to fetch YouTube channels', 502);
  }

  return (payload.items || [])
    .filter((item) => item.id && item.snippet?.title)
    .map((item) => ({
      channelId: item.id!,
      channelTitle: item.snippet!.title!,
      thumbnail:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        '',
      subscribers: toNumber(item.statistics?.subscriberCount),
      views: toNumber(item.statistics?.viewCount),
      videos: toNumber(item.statistics?.videoCount),
    }));
}

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseGrantedScopes(value: unknown) {
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}

export function hasYoutubeAnalyticsScope(scopes: readonly string[] | undefined) {
  return Boolean(scopes?.includes(YOUTUBE_ANALYTICS_SCOPE));
}

function hashState(state: string) {
  return crypto.createHash('sha256').update(state).digest('hex');
}
