import { ObjectId } from 'mongodb';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  ARTIST = 'artist',
  MANAGER = 'manager',
  LABEL = 'label',
  PUBLISHER = 'publisher',
  USER = 'user'
}

export enum UserStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  DELETED = 'deleted'
}

export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected'
}

export interface IUserProfile {
  firstName: string;
  lastName: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  coverImage?: string;
  location?: string;
  website?: string;
  socialLinks?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    youtube?: string;
    spotify?: string;
    appleMusic?: string;
    soundcloud?: string;
    tiktok?: string;
  };
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  language?: string;
  timezone?: string;
}

export interface IUserPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  privacySettings: {
    showEmail: boolean;
    showLocation: boolean;
    showSocialLinks: boolean;
    showOnlineStatus: boolean;
  };
  notificationSettings: {
    newFollower: boolean;
    newComment: boolean;
    newLike: boolean;
    newMessage: boolean;
    royaltyUpdates: boolean;
    systemUpdates: boolean;
  };
}

export interface IUserVerification {
  status: VerificationStatus;
  documentType?: 'passport' | 'id_card' | 'driving_license' | 'other';
  documentFront?: string;
  documentBack?: string;
  selfie?: string;
  rejectionReason?: string;
  verifiedAt?: Date;
  verifiedBy?: ObjectId;
  notes?: string;
}

export interface IUserSubscription {
  planId: ObjectId;
  planName: string;
  startDate: Date;
  endDate: Date;
  status: 'active' | 'expired' | 'cancelled';
  autoRenew: boolean;
  paymentMethod?: string;
  lastPaymentDate?: Date;
  nextBillingDate?: Date;
  cancellationDate?: Date;
  features: string[];
}

export interface IUserStats {
  totalTracks: number;
  totalPlays: number;
  totalFollowers: number;
  totalFollowing: number;
  monthlyListeners: number;
  totalEarnings: number;
  availableBalance: number;
  pendingPayouts: number;
  lastPayoutDate?: Date;
}

export interface IUser extends Document {
  _id: ObjectId;
  email: string;
  emailVerified: boolean;
  password: string;
  role: UserRole;
  status: UserStatus;
  profile: IUserProfile;
  preferences: IUserPreferences;
  verification?: IUserVerification;
  subscription?: IUserSubscription;
  stats: IUserStats;
  lastLogin?: Date;
  lastActive?: Date;
  lastIpAddress?: string;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  loginAttempts: number;
  lockUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
  
  // Methods
  comparePassword: (candidatePassword: string) => Promise<boolean>;
  generateAuthToken: () => string;
  generateResetToken: () => string;
  generateEmailVerificationToken: () => string;
  isAccountLocked: () => boolean;
  isVerified: () => boolean;
  hasRole: (role: UserRole | UserRole[]) => boolean;
}
