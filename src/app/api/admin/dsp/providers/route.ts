import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET() {
  return proxyBackend('/api/dsp/providers');
}

export async function POST(req: Request) {
  const body = await req.json();
  return proxyBackend('/api/dsp/providers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
