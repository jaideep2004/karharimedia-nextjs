import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/app/api/_lib/backend';

const getSecret = () => process.env.DSP_DELIVERY_CRON_SECRET || process.env.CRON_SECRET;

async function runCleanup(req: NextRequest) {
  const secret = getSecret();
  const provided =
    req.headers.get('x-cron-secret') ||
    req.nextUrl.searchParams.get('secret');

  if (!secret || provided !== secret) {
    return NextResponse.json({ success: false, error: 'Cron access denied' }, { status: 401 });
  }

  const retentionDays = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get('retentionDays') || 15)));
  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
  const result = await fetchBackend(
    '/api/dsp/deliveries/cleanup',
    {
      method: 'POST',
      headers: { 'x-cron-secret': secret },
      body: JSON.stringify({ retentionDays, dryRun }),
    },
    { requireAuth: false }
  );

  return NextResponse.json(result.data, { status: result.status });
}

export async function GET(req: NextRequest) {
  return runCleanup(req);
}

export async function POST(req: NextRequest) {
  return runCleanup(req);
}

export const dynamic = 'force-dynamic';
