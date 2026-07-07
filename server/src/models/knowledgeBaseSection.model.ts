import mongoose, { Document, Schema } from 'mongoose';

export interface IKnowledgeBaseSection extends Document {
  categoryId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeBaseSectionSchema = new Schema<IKnowledgeBaseSection>(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'KnowledgeBaseCategory',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 140,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
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

KnowledgeBaseSectionSchema.index({ categoryId: 1, slug: 1 }, { unique: true });
KnowledgeBaseSectionSchema.index({ categoryId: 1, isActive: 1, sortOrder: 1, name: 1 });

export default mongoose.model<IKnowledgeBaseSection>('KnowledgeBaseSection', KnowledgeBaseSectionSchema);
