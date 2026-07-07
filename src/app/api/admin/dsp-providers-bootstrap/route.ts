import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST() {
  return proxyBackend('/api/dsp/providers/bootstrap-phase1', { method: 'POST' });
}
