import mongoose, { Document, Schema } from 'mongoose';

export interface IBromaOutlet extends Document {
  outletId: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  releaseTypes: string[];
  active: boolean;
  raw: Record<string, unknown>;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BromaOutletSchema = new Schema<IBromaOutlet>(
  {
    outletId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, index: true },
    aliases: { type: [String], default: [], index: true },
    releaseTypes: { type: [String], default: [] },
    active: { type: Boolean, default: true, index: true },
    raw: { type: Schema.Types.Mixed, default: {} },
    syncedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

BromaOutletSchema.index({ normalizedName: 1, active: 1 });
BromaOutletSchema.index({ aliases: 1, active: 1 });

export default mongoose.model<IBromaOutlet>('BromaOutlet', BromaOutletSchema, 'bromaOutlets');
