import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyBackend(`/api/users/${id}`);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userData = await request.json();

  return proxyBackend(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(userData)
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyBackend(`/api/users/${id}`, { method: 'DELETE' });
}
