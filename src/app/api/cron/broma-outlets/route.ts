import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/app/api/_lib/backend';

const getSecret = () => process.env.DSP_DELIVERY_CRON_SECRET || process.env.CRON_SECRET;

async function runBromaOutletSync(req: NextRequest) {
  const secret = getSecret();
  const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');

  if (!secret || provided !== secret) {
    return NextResponse.json({ success: false, error: 'Cron access denied' }, { status: 401 });
  }

  const result = await fetchBackend(
    '/api/dsp/broma/outlets/sync',
    {
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    },
    { requireAuth: false }
  );

  return NextResponse.json(result.data, { status: result.status });
}

export async function GET(req: NextRequest) {
  return runBromaOutletSync(req);
}

export async function POST(req: NextRequest) {
  return runBromaOutletSync(req);
}

export const dynamic = 'force-dynamic';
