import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import {
  findReleaseByIdRaw,
  releasesCollection,
  withOptionalLegacyTrackSnapshot,
} from '@/lib/repositories/releases';
import { replaceReleaseCanonicalTracks } from '@/lib/repositories/tracks';

function getClientKey(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; trackKey: string }> }
) {
  const { id, trackKey } = await params;

  try {
    const user = await getCurrentBackendUser();
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    let _id: ObjectId;
    try {
      _id = new ObjectId(id);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid release id' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    await enforceMongoRateLimit(db, {
      key: `DELETE:/api/releases/${id}/tracks:${user._id || getClientKey(req)}`,
      limit: 30,
      windowMs: 60 * 1000,
    });

    const release = await findReleaseByIdRaw(db, _id);
    if (!release) {
      return NextResponse.json({ success: false, error: 'Release not found' }, { status: 404 });
    }

    const tracks = Array.isArray(release.tracks) ? [...release.tracks] : [];
    const indexFromPath = Number(trackKey);
    const trackIndex = Number.isInteger(indexFromPath)
      ? indexFromPath
      : tracks.findIndex((track: any) => String(track?._id || track?.id || track?.isrc || '') === trackKey);

    if (trackIndex < 0 || trackIndex >= tracks.length) {
      return NextResponse.json({ success: false, error: 'Track not found in release' }, { status: 404 });
    }

    const [removedTrack] = tracks.splice(trackIndex, 1);
    const body = await req.json().catch(() => ({}));
    const auditEntry = {
      action: 'admin_removed_release_track',
      at: new Date(),
      adminId: user._id,
      adminEmail: user.email,
      trackIndex,
      trackTitle: removedTrack?.title || removedTrack?.name || null,
      trackIsrc: removedTrack?.isrc || removedTrack?.ISRC || null,
      reason: typeof body?.reason === 'string' ? body.reason.slice(0, 500) : '',
    };

    await replaceReleaseCanonicalTracks(db, release, tracks);

    const update = {
      $set: {
        ...withOptionalLegacyTrackSnapshot({}, tracks),
        updatedAt: new Date(),
      },
      $push: {
        adminActions: auditEntry,
      },
    };

    const result = await releasesCollection(db).findOneAndUpdate(
      { _id },
      update as any,
      { returnDocument: 'after' }
    );

    return NextResponse.json({ success: true, release: result.value, removedTrack });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove release track';
    const status = error instanceof RateLimitError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const dynamic = 'force-dynamic';
