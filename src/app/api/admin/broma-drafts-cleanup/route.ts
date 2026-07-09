import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return proxyBackend('/api/dsp/broma/drafts/cleanup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
