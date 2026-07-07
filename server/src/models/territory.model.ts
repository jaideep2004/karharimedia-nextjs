import mongoose, { Schema, Document } from 'mongoose';

export interface ITerritory extends Document {
  trackOrReleaseId: mongoose.Types.ObjectId;
  type: 'track' | 'release';
  allowed: string[]; // ISO country codes
  disallowed: string[]; // ISO country codes
}

const TerritorySchema = new Schema<ITerritory>({
  trackOrReleaseId: { type: Schema.Types.ObjectId, required: true, refPath: 'type' },
  type: { type: String, enum: ['track', 'release'], required: true },
  allowed: [{ type: String }],
  disallowed: [{ type: String }],
}, { timestamps: true });

export default mongoose.model<ITerritory>('Territory', TerritorySchema);
