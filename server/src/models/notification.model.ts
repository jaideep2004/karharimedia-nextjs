import mongoose, { Document, Schema } from 'mongoose';
import { NotificationType } from '../config/constants';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  message: string;
  type: NotificationType;
  isRead: boolean;
  relatedId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required']
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      default: NotificationType.SYSTEM
    },
    isRead: {
      type: Boolean,
      default: false
    },
    relatedId: {
      type: Schema.Types.ObjectId,
      refPath: 'refModel'
    },
    refModel: {
      type: String,
      enum: ['Track', 'Payout', 'SupportTicket'],
      default: 'Track'
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for faster queries
NotificationSchema.index({ userId: 1 });
NotificationSchema.index({ isRead: 1 });
NotificationSchema.index({ createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
