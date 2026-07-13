import mongoose, { Document, Schema } from 'mongoose';
import { DspDeliveryOperation, DspDeliveryState } from '../types/dsp';

interface IDeliveryAttempt {
  attemptNo: number;
  status: 'success' | 'failed';
  requestHash?: string;
  responseCode?: string;
  responseBody?: unknown;
  errorMessage?: string;
  retryable: boolean;
  createdAt: Date;
}

interface IDeliveryEvent {
  state: DspDeliveryState;
  message: string;
  source: 'system' | 'connector' | 'webhook' | 'user';
  createdAt: Date;
}

export interface IDeliveryJob extends Document {
  targetType: 'track' | 'release';
  trackId?: mongoose.Types.ObjectId;
  releaseId?: mongoose.Types.ObjectId;
  snapshotId?: mongoose.Types.ObjectId;
  providerKey: string;
  operation: DspDeliveryOperation;
  state: DspDeliveryState;
  priority: number;
  externalId?: string;
  idempotencyKey: string;
  nextRetryAt?: Date;
  lockedAt?: Date;
  lockedBy?: string;
  lockExpiresAt?: Date;
  lastAttemptAt?: Date;
  maxRetries: number;
  retryCount: number;
  deadLettered: boolean;
  hiddenFromOps: boolean;
  expiresAt?: Date;
  metadata: Record<string, unknown>;
  errorMessage?: string;
  attempts: IDeliveryAttempt[];
  events: IDeliveryEvent[];
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryAttemptSchema = new Schema<IDeliveryAttempt>(
  {
    attemptNo: { type: Number, required: true },
    status: { type: String, enum: ['success', 'failed'], required: true },
    requestHash: { type: String },
    responseCode: { type: String },
    responseBody: { type: Schema.Types.Mixed },
    errorMessage: { type: String },
    retryable: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DeliveryEventSchema = new Schema<IDeliveryEvent>(
  {
    state: { type: String, required: true },
    message: { type: String, required: true },
    source: { type: String, enum: ['system', 'connector', 'webhook', 'user'], required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DeliveryJobSchema = new Schema<IDeliveryJob>(
  {
    targetType: { type: String, enum: ['track', 'release'], default: 'track', index: true },
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', index: true },
    releaseId: { type: Schema.Types.ObjectId, ref: 'Release', index: true },
    snapshotId: { type: Schema.Types.ObjectId, ref: 'ReleaseDeliverySnapshot', index: true },
    providerKey: { type: String, required: true, index: true, lowercase: true, trim: true },
    operation: { type: String, enum: ['deliver', 'update', 'takedown'], default: 'deliver' },
    state: { type: String, default: 'queued', index: true },
    priority: { type: Number, default: 5, index: true },
    externalId: { type: String },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    nextRetryAt: { type: Date },
    lockedAt: { type: Date },
    lockedBy: { type: String },
    lockExpiresAt: { type: Date, index: true },
    lastAttemptAt: { type: Date },
    maxRetries: { type: Number, default: 5 },
    retryCount: { type: Number, default: 0 },
    deadLettered: { type: Boolean, default: false, index: true },
    hiddenFromOps: { type: Boolean, default: false, index: true },
    expiresAt: { type: Date, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    errorMessage: { type: String },
    attempts: { type: [DeliveryAttemptSchema], default: [] },
    events: { type: [DeliveryEventSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

DeliveryJobSchema.index({ state: 1, providerKey: 1, createdAt: -1 });
DeliveryJobSchema.index({ providerKey: 1, createdAt: -1 });
DeliveryJobSchema.index({ providerKey: 1, state: 1, createdAt: -1 });
DeliveryJobSchema.index({ providerKey: 1, hiddenFromOps: 1, createdAt: -1 });
DeliveryJobSchema.index({ state: 1, nextRetryAt: 1, priority: 1, createdAt: 1 });
DeliveryJobSchema.index({ lockExpiresAt: 1, state: 1 });
DeliveryJobSchema.index({ providerKey: 1, targetType: 1 });
DeliveryJobSchema.index({ providerKey: 1, trackId: 1, operation: 1 });
DeliveryJobSchema.index({ providerKey: 1, releaseId: 1, operation: 1 });
DeliveryJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IDeliveryJob>('DeliveryJob', DeliveryJobSchema);
