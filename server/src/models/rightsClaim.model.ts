import mongoose, { Document, Schema } from 'mongoose';

export interface IRightsClaim extends Document {
  trackId: mongoose.Types.ObjectId;
  providerKey: string;
  policyAction: 'monitor' | 'claim' | 'block' | 'monetize';
  status: 'pending' | 'active' | 'rejected' | 'disputed' | 'closed';
  externalReference?: string;
  evidence: Record<string, unknown>;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RightsClaimSchema = new Schema<IRightsClaim>(
  {
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', required: true, index: true },
    providerKey: { type: String, required: true, lowercase: true, trim: true, index: true },
    policyAction: {
      type: String,
      enum: ['monitor', 'claim', 'block', 'monetize'],
      default: 'monitor',
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'rejected', 'disputed', 'closed'],
      default: 'pending',
      index: true,
    },
    externalReference: { type: String },
    evidence: { type: Schema.Types.Mixed, default: {} },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IRightsClaim>('RightsClaim', RightsClaimSchema);
