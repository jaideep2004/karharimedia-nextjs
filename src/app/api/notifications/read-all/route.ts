import { proxyBackend } from '@/app/api/_lib/backend';

export async function PATCH(request: Request) {
  const body = await request.text();
  return proxyBackend('/api/notifications/read-all', {
    method: 'PUT',
    body: body || JSON.stringify({}),
  });
}

export async function PUT(request: Request) {
  const body = await request.text();
  return proxyBackend('/api/notifications/read-all', {
    method: 'PUT',
    body: body || JSON.stringify({}),
  });
}

export const dynamic = 'force-dynamic';
