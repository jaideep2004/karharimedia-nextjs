import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST(req: Request, { params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  return proxyBackend(`/api/dsp/social-upload/backfill/${releaseId}`, { method: 'POST' });
}
