import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit') || '10';
  const page = searchParams.get('page') || '1';
  const sort = searchParams.get('sort') || '-createdAt';
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status');

  const queryParams = new URLSearchParams();
  if (limit) queryParams.append('limit', limit);
  if (page) queryParams.append('page', page);
  if (sort) queryParams.append('sort', sort);
  if (search) queryParams.append('search', search);
  if (status) queryParams.append('status', status);

  return proxyBackend(`/api/users?${queryParams.toString()}`);
}

export async function POST(request: Request) {
  const userData = await request.json();

  return proxyBackend('/api/users', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
}
