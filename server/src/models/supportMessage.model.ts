import mongoose, { Document, Schema } from 'mongoose';
import { SupportMessageVisibility } from '../config/constants';

export interface ISupportAttachment {
  fileName: string;
  key: string;
  url: string;
  provider: string;
  contentType?: string;
  size?: number;
}

export interface ISupportMessage extends Document {
  ticketId: mongoose.Types.ObjectId;
  authorId?: mongoose.Types.ObjectId;
  authorRole: 'user' | 'admin' | 'system';
  body: string;
  visibility: SupportMessageVisibility;
  attachments: ISupportAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

const SupportAttachmentSchema = new Schema<ISupportAttachment>(
  {
    fileName: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    provider: { type: String, required: true, trim: true },
    contentType: { type: String, trim: true },
    size: { type: Number },
  },
  { _id: false }
);

const SupportMessageSchema = new Schema<ISupportMessage>(
  {
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: 'SupportTicket',
      required: true,
      index: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    authorRole: {
      type: String,
      enum: ['user', 'admin', 'system'],
      required: true,
      index: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    visibility: {
      type: String,
      enum: Object.values(SupportMessageVisibility),
      default: SupportMessageVisibility.PUBLIC,
      index: true,
    },
    attachments: {
      type: [SupportAttachmentSchema],
      default: [],
    },
  },
  { timestamps: true }
);

SupportMessageSchema.index({ ticketId: 1, createdAt: 1 });

export default mongoose.model<ISupportMessage>('SupportMessage', SupportMessageSchema);
