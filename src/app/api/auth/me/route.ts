import { getRequestAuthToken, proxyBackend } from '@/app/api/_lib/backend';

export async function GET(request: Request) {
  return proxyBackend('/api/auth/me', {}, { authToken: getRequestAuthToken(request) });
}

export async function PUT(request: Request) {
  const payload = await request.json().catch(() => ({}));
  return proxyBackend(
    '/api/auth/me',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    { authToken: getRequestAuthToken(request) }
  );
}
