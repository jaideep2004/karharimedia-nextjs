// List of music distribution stores
export const STORES = [
  'Spotify',
  'Apple Music',
  'Amazon Music',
  'YouTube Music',
  'Deezer',
  'Tidal',
  'Pandora',
  'SoundCloud',
  'TikTok',
  'Facebook',
  'Facebook Rights Management',
  'Instagram',
  'WhatsApp',
  'ACRCloud',
  'YouTube Content ID',
  'Triller',
  'Boomplay',
  'Joox',
  'Anghami',
  'NetEase Cloud Music',
  'QQ Music',
];

// Release statuses
export enum ReleaseStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  PENDING = 'pending',
  APPROVED = 'approved',
  UPLOADING_TO_BROMA = 'uploading_to_broma',
  BROMA_MODERATION = 'broma_moderation',
  DSP_PROCESSING = 'dsp_processing',
  LIVE = 'live',
  TAKEDOWN_REQUESTED = 'takedown_requested',
  REMOVED = 'removed',
  REJECTED = 'rejected',
  FAILED = 'failed'
}

// Payout statuses
export enum PayoutStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

// Notification types
export enum NotificationType {
  RELEASE_APPROVED = 'release_approved',
  RELEASE_REJECTED = 'release_rejected',
  PAYOUT_APPROVED = 'payout_approved',
  PAYOUT_REJECTED = 'payout_rejected',
  EMAIL = 'email',
  SYSTEM = 'system'
} 
