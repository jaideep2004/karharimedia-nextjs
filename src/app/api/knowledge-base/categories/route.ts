import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET() {
  return proxyBackend('/api/knowledge-base/categories', {}, { requireAuth: false });
}
