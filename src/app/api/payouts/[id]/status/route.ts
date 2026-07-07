import { proxyBackend } from '@/app/api/_lib/backend';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  return proxyBackend(`/api/payouts/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
