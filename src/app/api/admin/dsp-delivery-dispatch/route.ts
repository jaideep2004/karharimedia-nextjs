import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST(req: Request) {
  const body = await req.json();
  return proxyBackend('/api/dsp/deliveries/dispatch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
