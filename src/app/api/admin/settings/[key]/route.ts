import { proxyBackend } from '@/app/api/_lib/backend';

// GET handler for fetching a specific setting by key
export async function GET(
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  return proxyBackend(`/api/settings/${key}`);
}

// PUT handler for updating a specific setting by key
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const body = await request.json();

  return proxyBackend(`/api/settings/${key}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
} 
