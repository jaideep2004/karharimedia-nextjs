import mongoose, { Document, Schema } from 'mongoose';

export interface IKnowledgeBaseArticleRevision extends Document {
  articleId: mongoose.Types.ObjectId;
  action: 'created' | 'updated' | 'published' | 'archived';
  snapshot: Record<string, unknown>;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const KnowledgeBaseArticleRevisionSchema = new Schema<IKnowledgeBaseArticleRevision>(
  {
    articleId: {
      type: Schema.Types.ObjectId,
      ref: 'KnowledgeBaseArticle',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ['created', 'updated', 'published', 'archived'],
      required: true,
      index: true,
    },
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

KnowledgeBaseArticleRevisionSchema.index({ articleId: 1, createdAt: -1 });

export default mongoose.model<IKnowledgeBaseArticleRevision>(
  'KnowledgeBaseArticleRevision',
  KnowledgeBaseArticleRevisionSchema
);
