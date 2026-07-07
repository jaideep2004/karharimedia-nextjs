import { proxyBackend } from '@/app/api/_lib/backend';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await request.json();

  return proxyBackend(`/api/users/${id}/verification`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
