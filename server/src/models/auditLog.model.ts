import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  user: string; // userId or email
  action: string;
  entity: string; // e.g. 'track', 'artwork', 'delivery'
  entityId?: string;
  details?: any;
  status: 'success' | 'error';
  error?: string;
  timestamp: Date;
}

const AuditLogSchema: Schema = new Schema({
  user: { type: String, required: true },
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: { type: String },
  details: { type: Schema.Types.Mixed },
  status: { type: String, enum: ['success', 'error'], required: true },
  error: { type: String },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
