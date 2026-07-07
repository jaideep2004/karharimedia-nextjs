import mongoose, { Document, Schema } from 'mongoose';

export interface IKnowledgeBaseCategory extends Document {
  name: string;
  slug: string;
  description?: string;
  iconUrl?: string;
  sortOrder: number;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeBaseCategorySchema = new Schema<IKnowledgeBaseCategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 140,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    iconUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

KnowledgeBaseCategorySchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export default mongoose.model<IKnowledgeBaseCategory>('KnowledgeBaseCategory', KnowledgeBaseCategorySchema);
