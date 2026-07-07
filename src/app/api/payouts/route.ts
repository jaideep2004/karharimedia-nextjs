import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyBackend(`/api/payouts${search}`);
}
