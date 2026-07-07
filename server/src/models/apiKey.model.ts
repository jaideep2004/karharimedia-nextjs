import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

export interface IApiKey extends Document {
  key: string;
  name: string;
  userId: mongoose.Types.ObjectId;
  scopes: string[];
  lastUsed?: Date;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema: Schema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomBytes(32).toString('hex')
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    scopes: [{
      type: String,
      required: true,
      enum: ['tracks:read', 'tracks:write', 'analytics:read', 'profile:read', 'profile:write']
    }],
    lastUsed: {
      type: Date
    },
    expiresAt: {
      type: Date,
      index: { expires: 0 } // TTL index
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);  

// Indexes
ApiKeySchema.index({ userId: 1 });
ApiKeySchema.index({ key: 1 }, { unique: true });
 
export default mongoose.model<IApiKey>('ApiKey', ApiKeySchema);
