import { proxyBackend } from '@/app/api/_lib/backend';

export async function DELETE(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return proxyBackend(`/api/dsp/deliveries/${jobId}`, { method: 'DELETE' });
}
