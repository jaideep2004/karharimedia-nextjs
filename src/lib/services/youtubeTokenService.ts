import 'server-only';

import { ObjectId, type Db } from 'mongodb';
import { decryptSecret, encryptSecret } from '@/lib/secretEncryption';
import { updateYoutubeChannelTokens, type YoutubeChannelDocument } from '@/lib/repositories/youtube';
import { parseGrantedScopes } from '@/lib/services/youtubeAuthService';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

type RefreshTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export class YoutubeTokenError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'YoutubeTokenError';
    this.statusCode = statusCode;
  }
}

export async function getFreshYoutubeAccessToken(db: Db, channel: YoutubeChannelDocument) {
  if (!channel._id || !(channel._id instanceof ObjectId)) {
    throw new YoutubeTokenError('Invalid YouTube channel record', 500);
  }

  const currentAccessToken = decryptSecret(channel.accessTokenEncrypted);
  const expiresAt = channel.tokenExpiresAt?.getTime() || 0;
  if (currentAccessToken && expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return { accessToken: currentAccessToken, grantedScopes: channel.grantedScopes || [] };
  }

  const refreshToken = decryptSecret(channel.refreshTokenEncrypted);
  if (!refreshToken) {
    throw new YoutubeTokenError('Missing YouTube refresh token', 401);
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new YoutubeTokenError('Google OAuth credentials are not configured', 500);
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as RefreshTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new YoutubeTokenError(
      payload.error_description || payload.error || 'Failed to refresh YouTube access token',
      response.status || 401
    );
  }

  const tokenExpiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000)
    : undefined;
  const nextRefreshToken = payload.refresh_token || refreshToken;
  await updateYoutubeChannelTokens(db, channel._id, {
    accessTokenEncrypted: encryptSecret(payload.access_token),
    refreshTokenEncrypted: encryptSecret(nextRefreshToken),
    tokenExpiresAt,
  });

  return {
    accessToken: payload.access_token,
    grantedScopes: payload.scope ? parseGrantedScopes(payload.scope) : channel.grantedScopes || [],
  };
}
