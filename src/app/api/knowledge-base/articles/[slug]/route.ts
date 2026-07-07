import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return proxyBackend(`/api/knowledge-base/articles/${encodeURIComponent(slug)}`, {}, { requireAuth: false });
}
