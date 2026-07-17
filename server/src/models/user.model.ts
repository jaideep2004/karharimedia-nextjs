import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { AdminPermission, SupportTicketCategory, UserRole } from '../config/constants';

export interface IArtistOnboarding {
  region?: 'india' | 'international';
  legalName: string;
  idType: 'pan' | 'aadhaar' | 'national_id';
  idNumber: string;
  legalAddress: string;
  phoneNumber: string;
  location?: Record<string, string>;
  documents?: Record<string, string>;
  payoutMethod?: {
    method: 'bank_transfer' | 'paypal';
    details: Record<string, string>;
    updatedAt?: Date;
  };
  numberOfTracks: number;
  numberOfReleases: number;
  governmentIdFile: string; // stored path / URL
}

export interface ILabelOnboarding {
  region?: 'india' | 'international';
  labelName: string;
  registrationType: 'individual' | 'registered_company';
  // individual
  legalName?: string;
  labelGovIdFile?: string;
  // registered company
  legalEntityName?: string;
  companyType?: 'private' | 'public';
  certificateFile?: string; // incorporation cert or GST cert path
  // shared
  totalArtists: number;
  totalRevenue: number;
  catalogSize: number;
  rightsType: 'exclusive' | 'non_exclusive';
  companyWebsite?: string;
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    youtube?: string;
  };
  location?: Record<string, string>;
  documents?: Record<string, string>;
  payoutMethod?: {
    method: 'bank_transfer' | 'paypal';
    details: Record<string, string>;
    updatedAt?: Date;
  };
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  profilePicture?: string;
  profilePictureFile?: string;
  storageProvider?: 'r2' | 'local' | 'external';
  artistName?: string;
  bio?: string;
  accountType?: 'artist' | 'label';
  adminPreset?: string;
  permissions?: AdminPermission[];
  supportCategories?: SupportTicketCategory[];
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  isActive?: boolean;
  onboarding?: IArtistOnboarding | ILabelOnboarding;
  verification?: {
    status: 'pending' | 'submitted' | 'approved' | 'rejected';
    mobileProvider?: 'surepass' | 'sandbox' | 'manual' | 'amaze';
    kycProvider?: 'surepass' | 'sandbox' | 'manual';
    consent?: boolean;
    phoneNumber?: string;
    submittedAt?: Date;
    reviewedAt?: Date;
    reviewedBy?: mongoose.Types.ObjectId;
    rejectionReason?: string;
    notes?: string;
  };
  payoutMethod?: {
    method: 'bank_transfer' | 'paypal';
    details: Record<string, string>;
    updatedAt?: Date;
  };
  socialLinks?: {
    website?: string;
    instagram?: string;
    twitter?: string;
    facebook?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [50, 'Name cannot be more than 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.ARTIST,
    },
    profilePicture: {
      type: String,
    },
    profilePictureFile: {
      type: String,
    },
    storageProvider: {
      type: String,
      enum: ['r2', 'local', 'external'],
    },
    artistName: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot be more than 500 characters'],
    },
    accountType: {
      type: String,
      enum: ['artist', 'label'],
    },
    adminPreset: {
      type: String,
      trim: true,
    },
    permissions: {
      type: [String],
      enum: Object.values(AdminPermission),
      default: undefined,
    },
    supportCategories: {
      type: [String],
      enum: Object.values(SupportTicketCategory),
      default: undefined,
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
    onboarding: {
      type: Schema.Types.Mixed,
    },
    verification: {
      status: {
        type: String,
        enum: ['pending', 'submitted', 'approved', 'rejected'],
        default: 'pending',
      },
      mobileProvider: {
        type: String,
        enum: ['surepass', 'sandbox', 'manual', 'amaze'],
      },
      kycProvider: {
        type: String,
        enum: ['surepass', 'sandbox', 'manual'],
      },
      consent: {
        type: Boolean,
        default: false,
      },
      phoneNumber: String,
      submittedAt: Date,
      reviewedAt: Date,
      reviewedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      rejectionReason: String,
      notes: String,
    },
    socialLinks: {
      website: String,
      instagram: String,
      twitter: String,
      facebook: String,
    },
    payoutMethod: {
      method: {
        type: String,
        enum: ['bank_transfer', 'paypal'],
      },
      details: Schema.Types.Mixed,
      updatedAt: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

UserSchema.index({ 'verification.phoneNumber': 1 }, { sparse: true });
UserSchema.index({ role: 1, permissions: 1, supportCategories: 1 });

// Compare password method
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
