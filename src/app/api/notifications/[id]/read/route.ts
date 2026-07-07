import { proxyBackend } from '@/app/api/_lib/backend';

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyBackend(`/api/notifications/${id}/read`, { method: 'PUT' });
}

export async function PUT(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyBackend(`/api/notifications/${id}/read`, { method: 'PUT' });
}

export const dynamic = 'force-dynamic';
