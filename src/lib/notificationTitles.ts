type NotificationTitleInput = {
  type?: string;
  message?: string;
};

const cleanTitle = (value: string) =>
  value
    .replace(/^user profile updated$/i, 'Profile Updated')
    .replace(/^account profile updated$/i, 'Profile Updated')
    .trim();

const titleFromMessage = (message?: string) => {
  const trimmed = message?.trim();
  if (!trimmed) return '';

  const [prefix] = trimmed.split(':');
  const candidate = cleanTitle(prefix || '');
  if (candidate && candidate.length <= 64 && candidate.length < trimmed.length) return candidate;

  const normalized = trimmed.toLowerCase();
  if (normalized.includes('profile') && normalized.includes('updated')) return 'Profile Updated';
  if (normalized.includes('kyc') && normalized.includes('approved')) return 'KYC Approved';
  if (normalized.includes('kyc') && normalized.includes('rejected')) return 'KYC Rejected';
  if (normalized.includes('support') && normalized.includes('replied')) return 'Support Reply';
  if (normalized.includes('support') && normalized.includes('assigned')) return 'Support Assigned';
  if (normalized.includes('support') && normalized.includes('status changed')) return 'Support Status Updated';
  if (normalized.includes('release') && normalized.includes('approved')) return 'Release Approved';
  if (normalized.includes('release') && normalized.includes('rejected')) return 'Release Rejected';
  if (normalized.includes('payout') && normalized.includes('approved')) return 'Payout Approved';
  if (normalized.includes('payout') && normalized.includes('rejected')) return 'Payout Rejected';

  return '';
};

export const getNotificationTitle = ({ type, message }: NotificationTitleInput) => {
  const messageTitle = titleFromMessage(message);
  if (messageTitle) return messageTitle;

  const normalized = (type || 'system').replace(/_/g, ' ').toLowerCase();
  if (normalized.includes('release approved')) return 'Release Approved';
  if (normalized.includes('release rejected')) return 'Release Rejected';
  if (normalized.includes('payout approved')) return 'Payout Approved';
  if (normalized.includes('payout rejected')) return 'Payout Rejected';
  if (normalized.includes('support ticket reply')) return 'Support Reply';
  if (normalized.includes('support ticket')) return 'Support Update';
  if (normalized.includes('email')) return 'Account Update';
  if (normalized.includes('system')) return 'System Update';

  return 'Notification';
};
