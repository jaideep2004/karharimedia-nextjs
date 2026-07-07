import mongoose, { Document, Schema } from 'mongoose';

export interface IDspWebhookEvent extends Document {
  providerKey: string;
  eventType?: string;
  signatureValid: boolean;
  payload: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  processed: boolean;
  processingError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DspWebhookEventSchema = new Schema<IDspWebhookEvent>(
  {
    providerKey: { type: String, required: true, lowercase: true, trim: true, index: true },
    eventType: { type: String },
    signatureValid: { type: Boolean, default: false, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    headers: { type: Schema.Types.Mixed, default: {} },
    processed: { type: Boolean, default: false, index: true },
    processingError: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IDspWebhookEvent>('DspWebhookEvent', DspWebhookEventSchema);
