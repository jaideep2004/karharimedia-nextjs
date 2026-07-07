import { NextRequest } from 'next/server';
import { proxyBackend } from '@/app/api/_lib/backend';

export function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name') ?? '';
  const query = new URLSearchParams({ name });

  return proxyBackend(`/api/auth/check-artist-name?${query.toString()}`, {}, { requireAuth: false });
}
