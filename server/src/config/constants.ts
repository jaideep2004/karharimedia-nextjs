import path from 'path';
import os from 'os';

// Environment
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

// Server
export const PORT = process.env.PORT || 5000;
export const API_PREFIX = '/api';

// JWT
export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

// Roles
export enum UserRole {
  ARTIST = 'artist',
  LABEL = 'label',
  ADMIN = 'admin',
  SUBADMIN = 'subadmin'
}

export enum AdminPermission {
  USERS = 'users',
  REVIEW = 'review',
  PAYOUTS = 'payouts',
  DSP_DELIVERY = 'dsp_delivery',
  SETTINGS = 'settings',
  ANALYTICS = 'analytics',
  SUPPORT = 'support'
}

export const SUBADMIN_PERMISSION_PRESETS: Record<string, AdminPermission[]> = {
  users: [AdminPermission.USERS],
  review: [AdminPermission.REVIEW],
  payouts: [AdminPermission.PAYOUTS],
  delivery: [AdminPermission.DSP_DELIVERY],
  settings: [AdminPermission.SETTINGS],
  analytics: [AdminPermission.ANALYTICS],
  support: [AdminPermission.SUPPORT],
};

// File Upload
export const IS_SERVERLESS_RUNTIME = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
export const LOCAL_FFMPEG_ENABLED =
  !IS_PRODUCTION &&
  !IS_SERVERLESS_RUNTIME &&
  process.env.ENABLE_LOCAL_FFMPEG !== 'false';
export const UPLOAD_DIR = IS_SERVERLESS_RUNTIME
  ? path.join(os.tmpdir(), 'nextjs-karharimedia', 'uploads')
  : path.join(process.cwd(), 'uploads');
export const TRACKS_DIR = path.join(UPLOAD_DIR, 'tracks');
export const ARTWORK_DIR = path.join(UPLOAD_DIR, 'artwork');
export const REGISTRATION_DIR = path.join(UPLOAD_DIR, 'registration');
export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB ceiling for audio files
export const PROFILE_IMAGE_MAX_FILE_SIZE = 15 * 1024 * 1024;

// Supported file types
export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
  'audio/aac',
  'audio/x-aac',
];
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  REJECTED = 'rejected'
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
  SUPPORT_TICKET_CREATED = 'support_ticket_created',
  SUPPORT_TICKET_UPDATED = 'support_ticket_updated',
  SUPPORT_TICKET_REPLY = 'support_ticket_reply',
  EMAIL = 'email',
  SYSTEM = 'system'
}

export enum SupportTicketStatus {
  OPEN = 'open',
  IN_REVIEW = 'in_review',
  WAITING_FOR_USER = 'waiting_for_user',
  RESOLVED = 'resolved',
  CLOSED = 'closed'
}

export enum SupportTicketCategory {
  KYC_VERIFICATION = 'kyc_verification',
  RELEASE_REJECTION = 'release_rejection',
  COPYRIGHT_ISSUE = 'copyright_issue',
  DSP_DELIVERY = 'dsp_delivery',
  ROYALTIES_PAYMENTS = 'royalties_payments',
  TECHNICAL_ISSUE = 'technical_issue',
  ACCOUNT_SUPPORT = 'account_support',
  OTHER = 'other'
}

export enum SupportTicketPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum SupportMessageVisibility {
  PUBLIC = 'public',
  INTERNAL = 'internal'
}

export enum SupportTicketSource {
  USER = 'user',
  ADMIN = 'admin',
  KNOWLEDGE_BASE = 'knowledge_base',
  ACRCLOUD = 'acrcloud',
  KYC = 'kyc',
  SYSTEM = 'system'
}

export const SUPPORT_ATTACHMENT_DIR = path.join(UPLOAD_DIR, 'support');
export const KNOWLEDGE_BASE_MEDIA_DIR = path.join(UPLOAD_DIR, 'knowledge-base');
export const SUPPORT_ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const KNOWLEDGE_BASE_MEDIA_MAX_FILE_SIZE = 50 * 1024 * 1024;
export const ALLOWED_SUPPORT_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'text/plain',
  'application/zip'
];
export const ALLOWED_KNOWLEDGE_BASE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime'
];

// Payment methods
export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  PAYPAL = 'paypal'
}

export const MINIMUM_PAYOUT_USD = 100;

// Stores
export const STORES = [
  '7digital',
  'ACRCloud',
  'Amazon Music',
  'Anghami',
  'Spotify',
  'Apple Music',
  'Audiomack',
  'AWA',
  'Boomplay',
  'YouTube Music',
  'YouTube',
  'YouTube Content ID',
  'YouTube Music Video',
  'YouTube Art Track',
  'Facebook Audio Library',
  'Facebook',
  'Facebook Rights Manager',
  'Facebook Rights Management',
  'Instagram',
  'WhatsApp',
  'Snapchat',
  'TikTok',
  'Resso',
  'Audible Magic',
  'Jaxsta',
  'Audio Fingerprinting',
  'Deezer',
  'iHeartRadio',
  'iMusica',
  'JioSaavn',
  'KKBox',
  'Mixcloud',
  'NetEase Cloud Music',
  'Tidal',
  'Pandora',
  'Qobuz',
  'SoundCloud',
  'TouchTunes',
  'Trebel',
  'Tuned Global',
  'Hungama Music',
  'Wynk Music',
  'Gaana'
]; 
