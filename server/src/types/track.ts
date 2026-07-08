import { ObjectId } from 'mongodb';

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
}

export enum TrackVersionType {
  ORIGINAL = 'original',
  REMIX = 'remix',
  INSTRUMENTAL = 'instrumental',
  LIVE = 'live',
  ACOUSTIC = 'acoustic',
  RADIO_EDIT = 'radio_edit',
  EXPLICIT = 'explicit',
  CLEAN = 'clean'
}

export interface ITrackMetadata {
  title: string;
  version?: string;
  versionType?: TrackVersionType;
  primaryArtist: string | ObjectId;
  featuringArtists?: Array<string | ObjectId>;
  composers?: Array<{
    name: string;
    ipi?: string;
    share?: number;
  }>;
  isrc?: string;
  iswc?: string;
  upc?: string;
  grid?: string;
  language?: string;
  explicit?: boolean;
  lyrics?: string;
  copyrightText?: string;
  copyrightYear?: number;
  publisher?: string;
  recordLabel?: string;
}

export interface IAudioFile {
  url: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  format: string;
  checksum: string;
}

export interface IArtwork {
  url: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  format: string;
  checksum: string;
}

export interface ITrackVersion {
  versionType: TrackVersionType;
  audioFile: IAudioFile;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITrack extends Document {
  metadata: ITrackMetadata;
  status: ReleaseStatus;
  genres: string[];
  subGenres?: string[];
  mood?: string[];
  bpm?: number;
  key?: string;
  originalReleaseDate: Date;
  releaseDate: Date;
  stores: string[]; // Store IDs where the track is distributed
  versions: ITrackVersion[];
  primaryVersion: ITrackVersion;
  artwork: IArtwork;
  isExclusive: boolean;
  territories: string[]; // ISO country codes
  rightsHolders: Array<{
    name: string;
    email: string;
    share: number;
    role: 'artist' | 'producer' | 'writer' | 'performer' | 'label' | 'publisher';
    ipi?: string;
    isni?: string;
  }>;
  collaborators: Array<{
    userId: ObjectId;
    role: string;
    canEdit: boolean;
    canPublish: boolean;
    canDelete: boolean;
    addedAt: Date;
    addedBy: ObjectId;
  }>;
  rejectionReason?: string;
  scheduledRelease?: Date;
  isPreSaveEnabled: boolean;
  preSaveStartDate?: Date;
  isContentIdEnabled: boolean;
  contentIdServices: string[];
  youtubeContentId?: {
    assetId: string;
    status: 'pending' | 'active' | 'inactive' | 'error';
    lastUpdated: Date;
    error?: string;
  };
  isrcGenerated: boolean;
  upcGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  isDeleted: boolean;
}
