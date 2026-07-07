import mongoose, { Document, Schema } from 'mongoose';

export interface IRoyalty extends Document {
  trackId: mongoose.Types.ObjectId;
  artistId: mongoose.Types.ObjectId;
  store: string;
  amount: number;
  currency: string;
  reportingDate: Date;
  streamCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const RoyaltySchema: Schema = new Schema(
  {
    trackId: {
      type: Schema.Types.ObjectId,
      ref: 'Track',
      required: [true, 'Track ID is required']
    },
    artistId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Artist ID is required']
    },
    store: {
      type: String,
      required: [true, 'Store is required']
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative']
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'INR', 'JPY']
    },
    reportingDate: {
      type: Date,
      required: [true, 'Reporting date is required']
    },
    streamCount: {
      type: Number,
      default: 0,
      min: [0, 'Stream count cannot be negative']
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for faster queries
RoyaltySchema.index({ artistId: 1, reportingDate: -1 });
RoyaltySchema.index({ trackId: 1 });
RoyaltySchema.index({ store: 1 });

export default mongoose.model<IRoyalty>('Royalty', RoyaltySchema); 