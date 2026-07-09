export type ReleaseDisplayStatus = 'pending' | 'in_process' | 'approved' | 'rejected' | 'other';

const IN_PROCESS_RELEASE_STATUSES = new Set([
  'in_process',
  'in process',
  'in-process',
  'processing',
  'uploading_to_broma',
  'broma_moderation',
  'broma moderation',
  'under_moderation',
  'under moderation',
  'on_moderation',
  'on moderation',
  'pending_moderation',
  'pending moderation',
  'moderation',
  'dsp_processing',
  'dsp processing',
  'accepted',
  'distributed',
  'in_distribution',
  'in distribution',
  'in_progress',
  'in progress',
  'inprogress',
]);

export const RELEASE_STATUS_GROUPS: Record<ReleaseDisplayStatus, string[]> = {
  pending: ['pending', 'pending_review', 'pending review', 'submitted', 'under_review', 'under review', 'review', ''],
  in_process: Array.from(IN_PROCESS_RELEASE_STATUSES),
  approved: ['approved', 'live', 'published', 'delivered', 'processed', 'done', 'active', 'success', 'shipped', 'completed'],
  rejected: ['rejected', 'declined', 'failed', 'error', 'cancelled', 'not_ready', 'not ready'],
  other: [],
};

function rawReleaseStatus(status: unknown) {
  return String(status ?? '').trim().toLowerCase();
}

export function getNormalizedReleaseStatus(status: unknown): ReleaseDisplayStatus {
  const value = rawReleaseStatus(status);

  if (RELEASE_STATUS_GROUPS.pending.includes(value)) return 'pending';
  if (IN_PROCESS_RELEASE_STATUSES.has(value)) return 'in_process';
  if (RELEASE_STATUS_GROUPS.approved.includes(value)) return 'approved';
  if (RELEASE_STATUS_GROUPS.rejected.includes(value)) return 'rejected';

  return 'other';
}

export function getReleaseStatusLabel(status: unknown) {
  const value = rawReleaseStatus(status);
  if (value === 'failed') return 'Failed';
  if (value === 'rejected') return 'Rejected';

  const normalized = getNormalizedReleaseStatus(status);

  if (normalized === 'pending') return 'Pending';
  if (normalized === 'in_process') return 'In Process';
  if (normalized === 'approved') return 'Approved';

  return value
    ? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Unknown';
}

export function getReleaseRejectionReason(reason: unknown) {
  const value = String(reason ?? '').trim();
  if (!value) return '';

  const cleaned = value
    .replace(/^broma\s*status\s*:\s*/i, '')
    .replace(/^broma\s+/i, '')
    .trim();

  if (!cleaned || cleaned.toLowerCase() === 'rejected') {
    return 'Rejected during moderation';
  }

  return cleaned;
}
