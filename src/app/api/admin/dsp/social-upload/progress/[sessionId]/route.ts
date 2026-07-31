import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return proxyBackend(`/api/dsp/social-upload/progress/${sessionId}`);
}
