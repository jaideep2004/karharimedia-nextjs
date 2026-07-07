import mongoose, { Document, Schema } from 'mongoose';

export type BromaStatisticsReportState =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'deleted';

export interface IBromaStatisticsReport extends Document {
  accountId: string;
  bromaReportId?: string;
  reportKind: 'detail' | 'summary';
  state: BromaStatisticsReportState;
  requestPayload: Record<string, unknown>;
  rawResponse?: unknown;
  normalized?: Record<string, unknown>;
  rowCount: number;
  fileUrl?: string;
  fileName?: string;
  lastError?: string;
  requestedBy?: string;
  requestedAt: Date;
  lastSyncedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BromaStatisticsReportSchema = new Schema<IBromaStatisticsReport>(
  {
    accountId: { type: String, required: true, index: true },
    bromaReportId: { type: String, index: true },
    reportKind: { type: String, enum: ['detail', 'summary'], default: 'summary', index: true },
    state: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed', 'deleted'],
      default: 'queued',
      index: true,
    },
    requestPayload: { type: Schema.Types.Mixed, default: {} },
    rawResponse: { type: Schema.Types.Mixed },
    normalized: { type: Schema.Types.Mixed },
    rowCount: { type: Number, default: 0 },
    fileUrl: { type: String },
    fileName: { type: String },
    lastError: { type: String },
    requestedBy: { type: String },
    requestedAt: { type: Date, default: Date.now },
    lastSyncedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true, collection: 'bromaStatisticsReports' }
);

BromaStatisticsReportSchema.index({ accountId: 1, createdAt: -1 });
BromaStatisticsReportSchema.index({ state: 1, updatedAt: 1 });

export default mongoose.model<IBromaStatisticsReport>('BromaStatisticsReport', BromaStatisticsReportSchema);
