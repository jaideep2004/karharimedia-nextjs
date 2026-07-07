import mongoose, { Schema, Document } from 'mongoose';

export interface IFileMeta extends Document {
  key: string;
  url: string;
  provider: string;
  contentType?: string;
  size?: number;
  uploadedBy?: string;
  createdAt: Date;
}

const FileMetaSchema: Schema = new Schema({
  key: { type: String, required: true },
  url: { type: String, required: true },
  provider: { type: String, required: true },
  contentType: { type: String },
  size: { type: Number },
  uploadedBy: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IFileMeta>('FileMeta', FileMetaSchema);
