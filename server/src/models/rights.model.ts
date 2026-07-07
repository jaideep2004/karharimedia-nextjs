import mongoose, { Schema, Document } from 'mongoose';

export interface IRights extends Document {
  trackOrReleaseId: mongoose.Types.ObjectId;
  type: 'track' | 'release';
  rightsType: 'exclusive' | 'non-exclusive' | 'other';
  description?: string;
}

const RightsSchema = new Schema<IRights>({
  trackOrReleaseId: { type: Schema.Types.ObjectId, required: true, refPath: 'type' },
  type: { type: String, enum: ['track', 'release'], required: true },
  rightsType: { type: String, enum: ['exclusive', 'non-exclusive', 'other'], required: true },
  description: { type: String },
}, { timestamps: true });

export default mongoose.model<IRights>('Rights', RightsSchema);
