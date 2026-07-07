import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyBackend(`/api/users/${id}/preview-audit`, { method: 'POST' });
}
