import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST() {
  return proxyBackend('/api/dsp/broma/outlets/sync', { method: 'POST' });
}
