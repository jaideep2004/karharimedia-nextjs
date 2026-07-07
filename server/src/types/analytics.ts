import { ObjectId } from 'mongodb';

export enum AnalyticsEventType {
  TRACK_PLAY = 'track_play',
  TRACK_DOWNLOAD = 'track_download',
  TRACK_LIKE = 'track_like',
  TRACK_SHARE = 'track_share',
  TRACK_ADD_TO_PLAYLIST = 'track_add_to_playlist',
  USER_SIGNUP = 'user_signup',
  USER_LOGIN = 'user_login',
  USER_UPGRADE = 'user_upgrade',
  PAYOUT_REQUEST = 'payout_request',
  PAYOUT_PROCESSED = 'payout_processed',
  CONTENT_UPLOAD = 'content_upload',
  CONTENT_APPROVAL = 'content_approval',
  CONTENT_REJECTION = 'content_rejection',
  STORE_SYNC = 'store_sync',
  ROYALTY_CALCULATION = 'royalty_calculation',
  ERROR = 'error',
  OTHER = 'other'
}

export interface IAnalyticsEvent {
  _id: ObjectId;
  eventType: AnalyticsEventType;
  userId?: ObjectId;
  userRole?: string;
  trackId?: ObjectId;
  storeId?: ObjectId;
  payoutId?: ObjectId;
  royaltyId?: ObjectId;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
  country?: string;
  region?: string;
  city?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'other';
  os?: string;
  browser?: string;
  duration?: number;
  value?: number;
  currency?: string;
  metadata?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  createdAt: Date;
}

export interface IAnalyticsSummary {
  date: Date;
  totalEvents: number;
  uniqueUsers: number;
  totalPlays: number;
  totalDownloads: number;
  totalLikes: number;
  totalShares: number;
  totalSignups: number;
  totalLogins: number;
  totalUploads: number;
  totalRevenue: number;
  totalPayouts: number;
  byCountry: Record<string, {
    plays: number;
    downloads: number;
    revenue: number;
    users: number;
  }>;
  byDevice: Record<string, number>;
  byOs: Record<string, number>;
  byBrowser: Record<string, number>;
  byHour: Record<number, number>;
  updatedAt: Date;
}

export interface IUserAnalytics {
  userId: ObjectId;
  period: 'day' | 'week' | 'month' | 'year' | 'all';
  startDate: Date;
  endDate: Date;
  totalPlays: number;
  totalDownloads: number;
  totalLikes: number;
  totalShares: number;
  totalFollowers: number;
  totalFollowing: number;
  totalPlaylists: number;
  totalTracks: number;
  totalAlbums: number;
  totalRevenue: number;
  totalPayouts: number;
  topTracks: Array<{
    trackId: ObjectId;
    title: string;
    plays: number;
    downloads: number;
    likes: number;
    shares: number;
    revenue: number;
  }>;
  topCountries: Array<{
    country: string;
    plays: number;
    downloads: number;
    revenue: number;
  }>;
  trafficSources: Array<{
    source: string;
    count: number;
    percentage: number;
  }>;
  dailyStats: Array<{
    date: Date;
    plays: number;
    downloads: number;
    revenue: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
