import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/app/api/_lib/backend';

const getSecret = () => process.env.DSP_DELIVERY_CRON_SECRET || process.env.CRON_SECRET;

async function runDspDeliveryWorker(req: NextRequest) {
  const secret = getSecret();
  const provided =
    req.headers.get('x-cron-secret') ||
    req.nextUrl.searchParams.get('secret');

  if (!secret || provided !== secret) {
    return NextResponse.json({ success: false, error: 'Cron access denied' }, { status: 401 });
  }

  const maxJobs = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('maxJobs') || 5)));
  const result = await fetchBackend(
    '/api/dsp/deliveries/process-due',
    {
      method: 'POST',
      headers: { 'x-cron-secret': secret },
      body: JSON.stringify({
        maxJobs,
        workerId: `next-cron:dsp-deliveries:${Date.now()}`,
      }),
    },
    { requireAuth: false }
  );

  return NextResponse.json(result.data, { status: result.status });
}

export async function GET(req: NextRequest) {
  return runDspDeliveryWorker(req);
}

export async function POST(req: NextRequest) {
  return runDspDeliveryWorker(req);
}

export const dynamic = 'force-dynamic';
