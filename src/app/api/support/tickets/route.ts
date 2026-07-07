import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET(request: Request) {
  const search = new URL(request.url).search;
  return proxyBackend(`/api/support/tickets${search}`);
}

export async function POST(request: Request) {
  const payload = await request.json();
  return proxyBackend('/api/support/tickets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
