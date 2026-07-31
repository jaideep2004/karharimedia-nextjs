import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET(req: Request, { params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  return proxyBackend(`/api/dsp/social-upload/status/${releaseId}`);
}
