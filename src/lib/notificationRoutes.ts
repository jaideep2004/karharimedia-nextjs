type NotificationRouteInput = {
  type?: string;
  message?: string;
  relatedId?: unknown;
  refModel?: string;
};

type NotificationAudience = 'admin' | 'user';

const getStatusFromNotification = ({ type, message = '' }: NotificationRouteInput) => {
  if (type === 'release_approved' || /\bapproved\b/i.test(message)) return 'approved';
  if (type === 'release_rejected' || /\brejected\b/i.test(message)) return 'rejected';
  if (/\bpending\b|\breview\b/i.test(message)) return 'pending';
  return '';
};

const getRelatedId = (notification: NotificationRouteInput) => {
  const value = notification.relatedId;
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const nested = record._id || record.id || record.value;
    if (typeof nested === 'string') return nested;
    if (nested && typeof nested === 'object' && typeof (nested as any).toString === 'function') {
      const serialized = (nested as any).toString();
      return serialized === '[object Object]' ? '' : serialized;
    }
  }
  const serialized = String(value);
  return serialized === '[object Object]' ? '' : serialized;
};

export const getNotificationRoute = (
  notification: NotificationRouteInput,
  audience: NotificationAudience
) => {
  const type = notification.type || '';
  const relatedId = getRelatedId(notification);
  const refModel = notification.refModel || '';
  const isAdmin = audience === 'admin';

  if (refModel === 'SupportTicket' || type.startsWith('support_ticket')) {
    const base = isAdmin ? '/admin/support' : '/dashboard/support';
    return relatedId ? `${base}?ticket=${relatedId}` : base;
  }

  if (refModel === 'Payout' || type.startsWith('payout_')) {
    return isAdmin ? '/admin/payouts' : '/dashboard/royalties?tab=payouts';
  }

  if (type.startsWith('release_') || refModel === 'Track' || refModel === 'Release') {
    if (refModel === 'Release' && relatedId) {
      return isAdmin ? `/admin/releases/${relatedId}` : `/dashboard/releases/${relatedId}`;
    }

    const status = getStatusFromNotification(notification);
    const base = isAdmin ? '/admin/releases' : '/dashboard/releases';
    return status ? `${base}?status=${status}` : base;
  }

  return isAdmin ? '/admin/dashboard' : '/dashboard';
};
