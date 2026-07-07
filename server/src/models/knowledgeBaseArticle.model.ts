import mongoose, { Document, Schema } from 'mongoose';

export enum KnowledgeBaseArticleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export interface IKnowledgeBaseFaqBlock {
  question: string;
  answer: string;
}

export interface IKnowledgeBaseArticle extends Document {
  categoryId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  excerpt?: string;
  status: KnowledgeBaseArticleStatus;
  content: Record<string, unknown>;
  contentHtml: string;
  contentText: string;
  faqBlocks: IKnowledgeBaseFaqBlock[];
  videoEmbeds: Array<{ url: string; title?: string }>;
  imageRefs: Array<{ url: string; alt?: string }>;
  seo: {
    title?: string;
    description?: string;
    keywords: string[];
  };
  relatedArticleIds: mongoose.Types.ObjectId[];
  publishedAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeBaseArticleSchema = new Schema<IKnowledgeBaseArticle>(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'KnowledgeBaseCategory',
      required: true,
      index: true,
    },
    sectionId: {
      type: Schema.Types.ObjectId,
      ref: 'KnowledgeBaseSection',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
      index: true,
    },
    excerpt: {
      type: String,
      trim: true,
      maxlength: 320,
    },
    status: {
      type: String,
      enum: Object.values(KnowledgeBaseArticleStatus),
      default: KnowledgeBaseArticleStatus.DRAFT,
      index: true,
    },
    content: {
      type: Schema.Types.Mixed,
      default: { type: 'doc', content: [] },
    },
    contentHtml: {
      type: String,
      default: '',
    },
    contentText: {
      type: String,
      default: '',
    },
    faqBlocks: [
      {
        question: { type: String, trim: true, maxlength: 240 },
        answer: { type: String, trim: true, maxlength: 2000 },
      },
    ],
    videoEmbeds: [
      {
        url: { type: String, trim: true, maxlength: 500 },
        title: { type: String, trim: true, maxlength: 180 },
      },
    ],
    imageRefs: [
      {
        url: { type: String, trim: true, maxlength: 500 },
        alt: { type: String, trim: true, maxlength: 180 },
      },
    ],
    seo: {
      title: { type: String, trim: true, maxlength: 180 },
      description: { type: String, trim: true, maxlength: 320 },
      keywords: [{ type: String, trim: true, maxlength: 80 }],
    },
    relatedArticleIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'KnowledgeBaseArticle',
      },
    ],
    publishedAt: {
      type: Date,
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

KnowledgeBaseArticleSchema.index({ title: 'text', excerpt: 'text', contentText: 'text', 'seo.keywords': 'text' });
KnowledgeBaseArticleSchema.index({ status: 1, categoryId: 1, sectionId: 1, publishedAt: -1 });

export default mongoose.model<IKnowledgeBaseArticle>('KnowledgeBaseArticle', KnowledgeBaseArticleSchema);
