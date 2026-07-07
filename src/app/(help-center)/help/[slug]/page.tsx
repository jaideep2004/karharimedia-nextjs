import type { Metadata } from 'next';
import HelpArticleClient from '@/components/knowledge-base/HelpArticleClient';
import {
  getPublicKnowledgeBaseArticle,
  getPublicKnowledgeBaseTree,
} from '@/lib/publicKnowledgeBase';

type HelpArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: HelpArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublicKnowledgeBaseArticle(slug);

  if (!article) {
    return {
      title: 'Help Article Not Found | Karhari Media Distribution Help Center',
      robots: { index: false, follow: true },
    };
  }

  const title = article.seo?.title || `${article.title} | Karhari Media Distribution Help Center`;
  const description = article.seo?.description || article.excerpt || 'Karhari Media Distribution help center guide.';

  return {
    title,
    description,
    keywords: article.seo?.keywords,
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
    },
  };
}

export default async function HelpArticlePage({ params }: HelpArticlePageProps) {
  const { slug } = await params;
  const [initialArticle, initialTree] = await Promise.all([
    getPublicKnowledgeBaseArticle(slug),
    getPublicKnowledgeBaseTree(),
  ]);

  return <HelpArticleClient slug={slug} initialArticle={initialArticle} initialTree={initialTree} />;
}
