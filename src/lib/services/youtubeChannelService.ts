import { Db } from 'mongodb';
import type { CurrentBackendUser } from '@/lib/currentUser';
import { hasYoutubeAnalyticsScope } from '@/lib/services/youtubeAuthService';
import {
  isYoutubeCmsStatus,
  isYoutubeVerificationStatus,
  type YoutubeAdminAction,
  type YoutubeCmsStatus,
  type YoutubeVerificationStatus,
} from '@/lib/youtube';
import {
  deleteYoutubeOAuthSession,
  findYoutubeOAuthSession,
  listAdminYoutubeChannels,
  listUserYoutubeChannels,
  serializeYoutubeChannel,
  updateYoutubeChannelStatus,
  upsertYoutubeChannel,
} from '@/lib/repositories/youtube';
import { toObjectId } from '@/lib/repositories/tracks';

export class YoutubeChannelError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'YoutubeChannelError';
    this.statusCode = statusCode;
  }
}

export async function listChannelsForUser(db: Db, user: CurrentBackendUser) {
  return listUserYoutubeChannels(db, user._id);
}

export async function saveSelectedYoutubeChannel(
  db: Db,
  user: CurrentBackendUser,
  input: { sessionId: unknown; channelId: unknown }
) {
  if (typeof input.sessionId !== 'string' || !input.sessionId.trim()) {
    throw new YoutubeChannelError('Missing channel selection session');
  }
  if (typeof input.channelId !== 'string' || !input.channelId.trim()) {
    throw new YoutubeChannelError('Missing selected YouTube channel');
  }

  const userId = toObjectId(user._id);
  if (!userId) throw new YoutubeChannelError('Invalid authenticated user', 401);

  const session = await findYoutubeOAuthSession(db, input.sessionId);
  if (!session || !session.userId.equals(userId)) {
    throw new YoutubeChannelError('Channel selection session expired', 404);
  }

  const selected = session.channels.find((channel) => channel.channelId === input.channelId);
  if (!selected) {
    throw new YoutubeChannelError('Selected channel is not available in this session', 400);
  }

  const now = new Date();
  const saved = await upsertYoutubeChannel(db, {
    userId,
    googleAccountEmail: session.googleAccountEmail,
    ...selected,
    lastSyncedAt: now,
    accessTokenEncrypted: session.accessTokenEncrypted,
    refreshTokenEncrypted: session.refreshTokenEncrypted,
    tokenExpiresAt: session.tokenExpiresAt,
    grantedScopes: session.grantedScopes || [],
    analyticsAccessStatus: !session.refreshTokenEncrypted
      ? 'missing_refresh_token'
      : hasYoutubeAnalyticsScope(session.grantedScopes)
        ? 'active'
        : 'reauthorization_required',
    analyticsSyncStatus: 'never_synced',
  });

  await deleteYoutubeOAuthSession(db, session._id);

  return serializeYoutubeChannel(saved);
}

export async function listChannelsForAdmin(
  db: Db,
  options: {
    page: number;
    limit: number;
    query?: string;
    verificationStatus?: unknown;
    cmsStatus?: unknown;
  }
) {
  return listAdminYoutubeChannels(db, {
    page: Math.max(1, options.page),
    limit: Math.min(100, Math.max(10, options.limit)),
    query: options.query,
    verificationStatus: isYoutubeVerificationStatus(options.verificationStatus)
      ? options.verificationStatus
      : undefined,
    cmsStatus: isYoutubeCmsStatus(options.cmsStatus) ? options.cmsStatus : undefined,
  });
}

export async function applyYoutubeAdminAction(
  db: Db,
  user: CurrentBackendUser,
  channelId: string,
  action: unknown,
  note?: unknown
) {
  const next = getNextStatuses(action);
  if (!next) throw new YoutubeChannelError('Invalid YouTube channel action', 400);

  const channel = await updateYoutubeChannelStatus(db, channelId, {
    ...next,
    action: String(action),
    adminId: user._id,
    adminEmail: user.email,
    note: typeof note === 'string' ? note.trim() || undefined : undefined,
  });

  if (!channel) throw new YoutubeChannelError('YouTube channel not found', 404);
  return channel;
}

function getNextStatuses(action: unknown): {
  verificationStatus: YoutubeVerificationStatus;
  cmsStatus: YoutubeCmsStatus;
} | null {
  const typed = action as YoutubeAdminAction;
  if (typed === 'approve') {
    return { verificationStatus: 'approved', cmsStatus: 'not_started' };
  }
  if (typed === 'reject') {
    return { verificationStatus: 'rejected', cmsStatus: 'not_started' };
  }
  if (typed === 'mark_processing') {
    return { verificationStatus: 'approved', cmsStatus: 'processing' };
  }
  if (typed === 'mark_connected') {
    return { verificationStatus: 'approved', cmsStatus: 'connected' };
  }
  return null;
}
