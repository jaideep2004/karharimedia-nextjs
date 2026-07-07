import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.toString();
  return proxyBackend(`/api/dsp/deliveries${query ? `?${query}` : ''}`);
}
