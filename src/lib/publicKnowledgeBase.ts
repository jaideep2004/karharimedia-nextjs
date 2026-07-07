import { fetchBackend } from '@/app/api/_lib/backend';
import type {
  KnowledgeBaseArticle,
  KnowledgeBaseTree,
} from '@/services/api';

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
};

const emptyTree: KnowledgeBaseTree = {
  categories: [],
  sections: [],
  articles: [],
};

export async function getPublicKnowledgeBaseTree(): Promise<KnowledgeBaseTree> {
  const result = await fetchBackend(
    '/api/knowledge-base/categories',
    { cache: 'no-store' },
    { requireAuth: false }
  );
  const payload = result.data as ApiResponse<KnowledgeBaseTree> | null;

  return payload?.data || emptyTree;
}

export async function getPublicKnowledgeBaseArticle(slug: string): Promise<KnowledgeBaseArticle | null> {
  if (!slug) return null;

  const result = await fetchBackend(
    `/api/knowledge-base/articles/${encodeURIComponent(slug)}`,
    { cache: 'no-store' },
    { requireAuth: false }
  );
  const payload = result.data as ApiResponse<KnowledgeBaseArticle> | null;

  return payload?.data || null;
}
