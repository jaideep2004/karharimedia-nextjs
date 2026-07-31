import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST(req: Request) {
  const body = await req.json();
  return proxyBackend('/api/dsp/facebook/fetch-pages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
