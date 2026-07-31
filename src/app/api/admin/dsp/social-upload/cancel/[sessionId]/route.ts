import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return proxyBackend(`/api/dsp/social-upload/cancel/${sessionId}`, { method: 'POST' });
}
