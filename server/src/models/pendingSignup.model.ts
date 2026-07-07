import mongoose, { Document, Schema } from 'mongoose';

export interface IPendingSignup extends Document {
  email: string;
  phoneNumber: string;
  payload: Record<string, unknown>;
  emailOtpHash: string;
  smsOtpHash: string;
  emailVerified: boolean;
  smsVerified: boolean;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PendingSignupSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phoneNumber: { type: String, required: true, trim: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    emailOtpHash: { type: String, required: true },
    smsOtpHash: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    smsVerified: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export default mongoose.model<IPendingSignup>('PendingSignup', PendingSignupSchema);
