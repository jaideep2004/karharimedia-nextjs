import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST(request: Request) {
  const body = await request.json();
  return proxyBackend(
    '/api/auth/signup/verify',
    { method: 'POST', body: JSON.stringify(body) },
    { requireAuth: false }
  );
}
