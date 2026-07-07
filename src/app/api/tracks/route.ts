import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { getReleaseOwnerQuery } from '@/lib/repositories/releases';
import { listTracksPage } from '@/lib/repositories/tracks';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const isAdminLike = user.role === 'admin' || user.role === 'subadmin';
    const requestedUserId = searchParams.get('userId');
    const baseQuery = isAdminLike
      ? requestedUserId
        ? getReleaseOwnerQuery({ _id: requestedUserId })
        : {}
      : getReleaseOwnerQuery(user);

    const result = await listTracksPage(db, baseQuery, {
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || searchParams.get('q') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: result.tracks,
      tracks: result.tracks,
      pagination: result.pagination,
      counts: result.counts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tracks';
    const status = message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message, data: [] }, { status });
  }
}

export const dynamic = 'force-dynamic';
