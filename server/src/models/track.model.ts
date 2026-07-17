import mongoose, { Document, Schema } from 'mongoose';
import { ReleaseStatus, STORES } from '../config/constants';
import { AcrCloudAiDetection, AcrCloudFingerprintMatch, AcrCloudScanState } from '../types/acrCloud';

export type StorageProvider = 'r2' | 'local' | 'external';

export interface ITrack extends Document {
  title: string;
  artistId: mongoose.Types.ObjectId;
  artistName: string;
  genre: string;
  releaseDate: Date;
  isrc?: string;
  upc?: string;
  pline?: string;
  cline?: string;
  label?: string; 
  publisher?: string;
  composers?: Array<{
    name: string;
    role?: string;
    share: number;
    ipi?: string;
    ipn?: string;
    isni?: string;
  }>;
  lyricists?: Array<{
    name: string;
    role?: string;
    share: number;
    ipi?: string;
    ipn?: string;
    isni?: string;
  }>;
  publishers?: Array<{
    name: string;
    role?: string;
    share: number;
    ipi?: string;
    ipn?: string;
    isni?: string;
  }>;
  contributors?: Array<{
    name: string;
    role: string;
    share: number;
    ipi?: string;
    ipn?: string;
    isni?: string;
  }>;
  explicit?: boolean;
  iswc?: string;
  isni?: string;
  language?: string;
  audioFile: string;
  artwork: string;
  storageProvider?: StorageProvider;
  duration?: number;
  format?: string;
  bitrate?: number;
  loudness?: number | null;
  acrCloud?: {
    fileId?: string;
    scanState: AcrCloudScanState;
    aiDetection: AcrCloudAiDetection[];
    fingerprintMatches: AcrCloudFingerprintMatch[];
    rawResult?: unknown;
    lastError?: string;
    checkedAt?: Date;
  };
  stores: string[];
  status: ReleaseStatus;
  source?: 'release_embed' | 'standalone_upload';
  releaseId?: mongoose.Types.ObjectId;
  ownerUserId?: mongoose.Types.ObjectId | string;
  organizationId?: mongoose.Types.ObjectId;
  releaseTrackIndex?: number;
  legacyTrackKey?: string;
  legacyMetadata?: Record<string, unknown>;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TrackSchema: Schema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Track title is required'],
      trim: true,
      maxlength: [100, 'Title cannot be more than 100 characters']
    },
    artistId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Artist ID is required']
    },
    artistName: {
      type: String,
      required: [true, 'Artist name is required'],
      trim: true
    },
    genre: {
      type: String,
      required: [true, 'Genre is required'],
      trim: true
    },
    releaseDate: {
      type: Date,
      required: [true, 'Release date is required']
    },
    isrc: {
      type: String,
      trim: true,
      maxlength: [15, 'ISRC cannot be more than 15 characters']
    },
    upc: {
      type: String,
      trim: true,
      maxlength: [15, 'UPC cannot be more than 15 characters']
    },
    pline: {
      type: String,
      trim: true,
      maxlength: [255, 'PLine cannot be more than 255 characters']
    },
    cline: {
      type: String,
      trim: true,
      maxlength: [255, 'CLine cannot be more than 255 characters']
    },
    label: {
      type: String,
      trim: true,
      maxlength: [100, 'Label cannot be more than 100 characters']
    },
    publisher: {
      type: String,
      trim: true,
      maxlength: [100, 'Publisher cannot be more than 100 characters']
    },
    composers: {
      type: [Schema.Types.Mixed],
      default: []
    },
    lyricists: {
      type: [Schema.Types.Mixed],
      default: []
    },
    publishers: {
      type: [Schema.Types.Mixed],
      default: []
    },
    contributors: {
      type: [Schema.Types.Mixed],
      default: []
    },
    explicit: {
      type: Boolean,
      default: false
    },
    iswc: {
      type: String,
      trim: true,
      maxlength: [15, 'ISWC cannot be more than 15 characters']
    },
    isni: {
      type: String,
      trim: true,
      maxlength: [16, 'ISNI cannot be more than 16 characters']
    },
    language: {
      type: String,
      trim: true,
      maxlength: [10, 'Language code cannot be more than 10 characters']
    },
    audioFile: {
      type: String,
      required: [true, 'Audio file is required']
    },
    artwork: {
      type: String,
      required: [true, 'Artwork is required']
    },
    storageProvider: {
      type: String,
      enum: ['r2', 'local', 'external'],
    },
    duration: {
      type: Number
    },
    format: {
      type: String
    },
    bitrate: {
      type: Number
    },
    loudness: {
      type: Number
    },
    acrCloud: {
      fileId: {
        type: String,
        index: true
      },
      scanState: {
        type: String,
        enum: ['not_configured', 'pending', 'ready', 'no_results', 'error'],
        default: 'pending'
      },
      aiDetection: {
        type: [Schema.Types.Mixed],
        default: []
      },
      fingerprintMatches: {
        type: [Schema.Types.Mixed],
        default: []
      },
      rawResult: {
        type: Schema.Types.Mixed
      },
      lastError: {
        type: String
      },
      checkedAt: {
        type: Date
      }
    },
    stores: {
      type: [String],
      enum: STORES,
      validate: {
        validator: function(stores: string[]) {
          return stores && stores.length > 0;
        },
        message: 'At least one store must be selected'
      }
    },
    status: {
      type: String,
      enum: Object.values(ReleaseStatus),
      default: ReleaseStatus.PENDING
    },
    source: {
      type: String,
      enum: ['release_embed', 'standalone_upload'],
      default: 'standalone_upload',
      index: true
    },
    releaseId: {
      type: Schema.Types.ObjectId,
      index: true
    },
    ownerUserId: {
      type: Schema.Types.Mixed,
      index: true
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      index: true
    },
    releaseTrackIndex: {
      type: Number
    },
    legacyTrackKey: {
      type: String
    },
    legacyMetadata: {
      type: Schema.Types.Mixed
    },
    rejectionReason: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for faster queries
TrackSchema.index({ artistId: 1 });
TrackSchema.index({ status: 1 });
TrackSchema.index({ releaseDate: -1 });

export default mongoose.model<ITrack>('Track', TrackSchema); 
