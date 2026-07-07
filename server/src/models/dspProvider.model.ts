import mongoose, { Document, Schema } from 'mongoose';
import { DspCapability, DspIntegrationMode, DspReadinessState } from '../types/dsp';

export interface IDspProvider extends Document {
  key: string;
  displayName: string;
  enabled: boolean;
  capabilities: DspCapability[];
  region?: string;
  rateLimitPerMinute?: number;
  maintenanceMode: boolean;
  integrationMode: DspIntegrationMode;
  readiness: DspReadinessState;
  credentials: Record<string, unknown>;
  credentialEnvelopeVersion?: string;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const DspProviderSchema = new Schema<IDspProvider>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    capabilities: {
      type: [String],
      default: ['audio_delivery'],
    },
    region: {
      type: String,
      trim: true,
    },
    rateLimitPerMinute: {
      type: Number,
      default: 60,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
      index: true,
    },
    integrationMode: {
      type: String,
      enum: ['shell', 'sandbox', 'live'],
      default: 'shell',
      index: true,
    },
    readiness: {
      type: String,
      enum: ['shell_ready', 'missing_contract', 'missing_credentials', 'sandbox_ready', 'live_ready', 'paused'],
      default: 'shell_ready',
      index: true,
    },
    credentials: {
      type: Schema.Types.Mixed,
      default: {},
      select: false,
    },
    credentialEnvelopeVersion: {
      type: String,
      select: false,
    },
    config: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

DspProviderSchema.index({ key: 1, enabled: 1 });

export default mongoose.model<IDspProvider>('DspProvider', DspProviderSchema);
