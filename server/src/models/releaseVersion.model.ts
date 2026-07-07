import mongoose, { Document, Schema } from 'mongoose';

export interface IReleaseVersion extends Document {
  trackId: mongoose.Types.ObjectId;
  providerKey: string;
  versionNumber: number;
  versionLabel: string;
  ddexProfile: 'ERN-3' | 'ERN-4';
  metadataHash: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReleaseVersionSchema = new Schema<IReleaseVersion>(
  {
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', required: true, index: true },
    providerKey: { type: String, required: true, lowercase: true, trim: true, index: true },
    versionNumber: { type: Number, required: true },
    versionLabel: { type: String, required: true, trim: true },
    ddexProfile: { type: String, enum: ['ERN-3', 'ERN-4'], default: 'ERN-4' },
    metadataHash: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ReleaseVersionSchema.index({ trackId: 1, providerKey: 1, versionNumber: -1 }, { unique: true });

export default mongoose.model<IReleaseVersion>('ReleaseVersion', ReleaseVersionSchema);
