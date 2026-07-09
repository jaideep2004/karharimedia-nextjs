import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET(_req: Request, { params }: { params: Promise<{ syncId: string }> }) {
  const { syncId } = await params;
  return proxyBackend(`/api/dsp/broma/release-statuses/sync/${encodeURIComponent(syncId)}/progress`);
}
