import { proxyBackend } from '@/app/api/_lib/backend';

export async function POST() {
  return proxyBackend('/api/dsp/broma/drafts/force-process', { method: 'POST' });
}
