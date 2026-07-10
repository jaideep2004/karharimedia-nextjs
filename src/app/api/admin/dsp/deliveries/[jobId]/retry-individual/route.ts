import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return proxyBackend(`/api/dsp/deliveries/${jobId}/retry-individual`, { method: 'POST' });
}
