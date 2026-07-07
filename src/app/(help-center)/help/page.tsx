import HelpCenterClient from '@/components/knowledge-base/HelpCenterClient';
import { getPublicKnowledgeBaseTree } from '@/lib/publicKnowledgeBase';

export default async function HelpCenterPage() {
  const initialTree = await getPublicKnowledgeBaseTree();

  return <HelpCenterClient initialTree={initialTree} />;
}
