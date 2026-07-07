import mongoose, { Document, Schema } from 'mongoose';
import { PayoutStatus, PaymentMethod } from '../config/constants';

export interface IPayout extends Document {
  artistId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  status: PayoutStatus;
  paymentMethod: PaymentMethod;
  paymentDetails: {
    country?: string;
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    branchName?: string;
    paypalEmail?: string;
  };
  requestDate: Date;
  processedDate?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayoutSchema: Schema = new Schema(
  {
    artistId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Artist ID is required']
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [100, 'Minimum payout amount is 100 USD']
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'INR', 'JPY']
    },
    status: {
      type: String,
      enum: Object.values(PayoutStatus),
      default: PayoutStatus.PENDING
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      required: [true, 'Payment method is required']
    },
    paymentDetails: {
      country: String,
      accountHolderName: {
        type: String,
        validate: {
          validator: function(this: any, value: string) {
            return this.paymentMethod !== PaymentMethod.BANK_TRANSFER || (value && value.length > 0);
          },
          message: 'Account holder name is required for bank transfer'
        }
      },
      bankName: String,
      accountNumber: String,
      ifscCode: String,
      branchName: String,
      paypalEmail: {
        type: String,
        validate: {
          validator: function(this: any, paypalEmail: string) {
            return this.paymentMethod !== PaymentMethod.PAYPAL || (paypalEmail && paypalEmail.length > 0);
          },
          message: 'PayPal email is required when payment method is PayPal'
        }
      }
    },
    requestDate: {
      type: Date,
      default: Date.now
    },
    processedDate: {
      type: Date
    },
    rejectionReason: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for faster queries
PayoutSchema.index({ artistId: 1 });
PayoutSchema.index({ status: 1 });
PayoutSchema.index({ requestDate: -1 });

export default mongoose.model<IPayout>('Payout', PayoutSchema); 
