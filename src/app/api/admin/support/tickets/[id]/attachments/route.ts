import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await request.formData();
  return proxyBackend(`/api/support/tickets/admin/${id}/attachments`, {
    method: 'POST',
    body: formData,
  });
}
