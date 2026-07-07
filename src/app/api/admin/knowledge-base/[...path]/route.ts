import { proxyBackend } from '@/app/api/_lib/backend';

async function backendPath(params: Promise<{ path: string[] }>, request?: Request) {
  const { path } = await params;
  const suffix = path.map(encodeURIComponent).join('/');
  const search = request ? new URL(request.url).search : '';
  return `/api/admin/knowledge-base/${suffix}${search}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyBackend(await backendPath(params, request));
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.join('/') === 'media') {
    const formData = await request.formData();
    return proxyBackend('/api/admin/knowledge-base/media', {
      method: 'POST',
      body: formData,
    });
  }

  const payload = await request.json().catch(() => ({}));
  return proxyBackend(`/api/admin/knowledge-base/${path.map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const payload = await request.json().catch(() => ({}));
  return proxyBackend(await backendPath(params), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyBackend(await backendPath(params), { method: 'DELETE' });
}
