import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import { getReleaseOwnerQuery, normalizeMusicPublishingTracks } from '@/lib/musicPublishing';
import { listReleasesWithTracks } from '@/lib/repositories/releases';

const MAX_LIMIT = 250;

function getClientKey(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function getUserPublishingTab(value: string | null) {
  return value === 'approved' ? 'approved' : 'pending';
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    await enforceMongoRateLimit(db, {
      key: `GET:/api/music-publishing/tracks:${user._id || getClientKey(req)}`,
      limit: 120,
      windowMs: 60 * 1000,
    });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(MAX_LIMIT, Math.max(10, Number(searchParams.get('limit') || 50)));
    const skip = (page - 1) * limit;
    const tab = getUserPublishingTab(searchParams.get('tab'));
    const query = (searchParams.get('q') || '').trim().toLowerCase();

    const releases = await listReleasesWithTracks(
      db,
      { $and: [getReleaseOwnerQuery(user), { status: 'approved' }] },
      { summary: true }
    );

    const rows = normalizeMusicPublishingTracks(releases)
      .filter((row) =>
        tab === 'approved' ? row.publishingStatus === 'completed' : row.publishingStatus !== 'completed'
      )
      .filter((row) => {
        if (!query) return true;
        return Object.values(row).some((value) =>
          String(value || '').toLowerCase().includes(query)
        );
      });

    return NextResponse.json({
      success: true,
      data: {
        tracks: rows.slice(skip, skip + limit),
        page,
        limit,
        total: rows.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load publishing tracks';
    const status = error instanceof RateLimitError ? error.statusCode : message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const dynamic = 'force-dynamic';
