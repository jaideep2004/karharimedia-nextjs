import mongoose, { Document, Schema } from 'mongoose';
import {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketSource,
  SupportTicketStatus,
} from '../config/constants';

export interface ISupportTicketStatusHistory {
  status: SupportTicketStatus;
  changedBy?: mongoose.Types.ObjectId;
  reason?: string;
  at: Date;
}

export interface ISupportTicket extends Document {
  ticketNumber: string;
  ownerId: mongoose.Types.ObjectId;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assignedTo?: mongoose.Types.ObjectId;
  escalatedAt?: Date;
  source: SupportTicketSource;
  related?: {
    releaseId?: mongoose.Types.ObjectId;
    trackId?: mongoose.Types.ObjectId;
    knowledgeBaseArticleId?: mongoose.Types.ObjectId;
    kycUserId?: mongoose.Types.ObjectId;
    acrCloudFileId?: string;
  };
  idempotencyKey?: string;
  statusHistory: ISupportTicketStatusHistory[];
  lastMessageAt: Date;
  adminReadAt?: Date;
  userReadAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    category: {
      type: String,
      enum: Object.values(SupportTicketCategory),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(SupportTicketStatus),
      default: SupportTicketStatus.OPEN,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(SupportTicketPriority),
      default: SupportTicketPriority.NORMAL,
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    escalatedAt: Date,
    source: {
      type: String,
      enum: Object.values(SupportTicketSource),
      default: SupportTicketSource.USER,
      index: true,
    },
    related: {
      releaseId: { type: Schema.Types.ObjectId },
      trackId: { type: Schema.Types.ObjectId },
      knowledgeBaseArticleId: { type: Schema.Types.ObjectId, ref: 'KnowledgeBaseArticle' },
      kycUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      acrCloudFileId: { type: String, trim: true },
    },
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
      index: true,
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: Object.values(SupportTicketStatus),
          required: true,
        },
        changedBy: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        reason: {
          type: String,
          trim: true,
          maxlength: 500,
        },
        at: {
          type: Date,
          default: Date.now,
          required: true,
        },
      },
    ],
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    adminReadAt: Date,
    userReadAt: Date,
    closedAt: Date,
  },
  { timestamps: true }
);

SupportTicketSchema.index({ ownerId: 1, updatedAt: -1 });
SupportTicketSchema.index({ status: 1, priority: 1, lastMessageAt: -1 });

export default mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);
