import mongoose, { Document, Schema } from 'mongoose';

export interface IFingerprintMatch extends Document {
  trackId: mongoose.Types.ObjectId;
  providerKey: string;
  confidence: number;
  matchType: 'audio' | 'video' | 'ugc';
  externalAssetId?: string;
  payload: Record<string, unknown>;
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FingerprintMatchSchema = new Schema<IFingerprintMatch>(
  {
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', required: true, index: true },
    providerKey: { type: String, required: true, lowercase: true, trim: true, index: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    matchType: { type: String, enum: ['audio', 'video', 'ugc'], default: 'audio' },
    externalAssetId: { type: String },
    payload: { type: Schema.Types.Mixed, default: {} },
    detectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IFingerprintMatch>('FingerprintMatch', FingerprintMatchSchema);
