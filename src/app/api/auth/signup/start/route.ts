import { getBackendBaseUrl, proxyBackend } from '@/app/api/_lib/backend';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const backendBase = getBackendBaseUrl();
    const response = await fetch(`${backendBase}/api/auth/signup/start`, {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    return Response.json(payload || { success: false, message: 'Backend request failed' }, {
      status: response.status,
    });
  }

  const body = await request.json();
  return proxyBackend(
    '/api/auth/signup/start',
    { method: 'POST', body: JSON.stringify(body) },
    { requireAuth: false }
  );
}
