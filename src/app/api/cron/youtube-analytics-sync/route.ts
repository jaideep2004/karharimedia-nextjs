import { NextRequest, NextResponse } from 'next/server';
import { processDueYoutubeAnalyticsSyncJobs } from '@/lib/services/youtubeAnalyticsSyncService';

export async function GET(req: NextRequest) {
  const secret = process.env.YOUTUBE_ANALYTICS_CRON_SECRET || process.env.CRON_SECRET;
  const provided =
    req.headers.get('x-cron-secret') ||
    req.nextUrl.searchParams.get('secret');

  if (!secret || provided !== secret) {
    return NextResponse.json({ success: false, error: 'Cron access denied' }, { status: 401 });
  }

  const maxJobs = Math.min(10, Math.max(1, Number(req.nextUrl.searchParams.get('maxJobs') || 3)));
  const result = await processDueYoutubeAnalyticsSyncJobs(maxJobs);
  return NextResponse.json({ success: true, data: result });
}

export const dynamic = 'force-dynamic';
