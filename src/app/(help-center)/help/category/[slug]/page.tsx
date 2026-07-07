import type { Metadata } from 'next';
import HelpCenterClient from '@/components/knowledge-base/HelpCenterClient';
import { getPublicKnowledgeBaseTree } from '@/lib/publicKnowledgeBase';

type HelpCategoryPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: HelpCategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tree = await getPublicKnowledgeBaseTree();
  const category = tree.categories.find((item) => item.slug === slug);

  if (!category) {
    return {
      title: 'Help Category Not Found | Karhari Media Distribution Help Center',
      robots: { index: false, follow: true },
    };
  }

  const title = `${category.name} | Karhari Media Distribution Help Center`;
  const description = category.description || `Karhari Media Distribution help articles for ${category.name}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
  };
}

export default async function HelpCategoryPage({ params }: HelpCategoryPageProps) {
  const { slug } = await params;
  const initialTree = await getPublicKnowledgeBaseTree();

  return <HelpCenterClient mode="category" categorySlug={slug} initialTree={initialTree} />;
}
