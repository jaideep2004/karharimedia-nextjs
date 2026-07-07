import { proxyBackend } from '@/app/api/_lib/backend';

export async function GET() {
  return proxyBackend('/api/settings');
} 
