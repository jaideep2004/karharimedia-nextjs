import { proxyBackend } from '@/app/api/_lib/backend';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json();
  return proxyBackend(`/api/support/tickets/admin/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
