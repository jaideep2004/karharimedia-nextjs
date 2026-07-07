import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { findReleaseByIdWithTracks, releasesCollection } from '@/lib/repositories/releases';
import { tracksCollection } from '@/lib/repositories/tracks';

type DspLifecycleStatus =
  | 'none'
  | 'takedown_requested'
  | 'taken_down'
  | 'redelivery_requested'
  | 'redelivered';

const lifecycleStatuses = new Set<DspLifecycleStatus>([
  'none',
  'takedown_requested',
  'taken_down',
  'redelivery_requested',
  'redelivered',
]);

function canManageReleaseLifecycle(user: { role?: string; permissions?: string[] }) {
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return user.role === 'admin' || (user.role === 'subadmin' && (permissions.includes('review') || permissions.includes('delivery')));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentBackendUser();
    if (!canManageReleaseLifecycle(user)) {
      return NextResponse.json({ success: false, error: 'Review or delivery permission is required' }, { status: 403 });
    }

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid release id' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const status = body?.status as DspLifecycleStatus | undefined;
    const trackIndex = body?.trackIndex;
    const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : '';
    const dspProviders = Array.isArray(body?.dspProviders)
      ? body.dspProviders
          .map((provider: unknown) => String(provider).trim())
          .filter(Boolean)
          .slice(0, 100)
      : [];

    if (!status || !lifecycleStatuses.has(status)) {
      return NextResponse.json({ success: false, error: 'Invalid lifecycle status' }, { status: 400 });
    }

    const releaseObjectId = new ObjectId(id);
    const { db } = await connectToDatabase();
    const now = new Date();
    const lifecycle = {
      dspLifecycleStatus: status,
      dspLifecycleUpdatedAt: now,
      dspLifecycleUpdatedBy: String(user._id),
      dspLifecycleUpdatedByEmail: user.email,
      dspLifecycleNote: note,
      dspLifecycleProviders: dspProviders,
    };

    if (Number.isInteger(trackIndex) && trackIndex >= 0) {
      const index = Number(trackIndex);
      await Promise.all([
        releasesCollection(db).updateOne(
          { _id: releaseObjectId },
          {
            $set: {
              [`tracks.${index}.dspLifecycleStatus`]: status,
              [`tracks.${index}.dspLifecycleUpdatedAt`]: now,
              [`tracks.${index}.dspLifecycleUpdatedBy`]: String(user._id),
              [`tracks.${index}.dspLifecycleUpdatedByEmail`]: user.email,
              [`tracks.${index}.dspLifecycleNote`]: note,
              [`tracks.${index}.dspLifecycleProviders`]: dspProviders,
              updatedAt: now,
            },
          }
        ),
        tracksCollection(db).updateOne(
          { releaseId: releaseObjectId, releaseTrackIndex: index, source: 'release_embed', deletedAt: { $exists: false } },
          {
            $set: {
              'legacyMetadata.dspLifecycleStatus': status,
              'legacyMetadata.dspLifecycleUpdatedAt': now,
              'legacyMetadata.dspLifecycleUpdatedBy': String(user._id),
              'legacyMetadata.dspLifecycleUpdatedByEmail': user.email,
              'legacyMetadata.dspLifecycleNote': note,
              'legacyMetadata.dspLifecycleProviders': dspProviders,
              updatedAt: now,
            },
          }
        ),
      ]);
    } else {
      await releasesCollection(db).updateOne(
        { _id: releaseObjectId },
        {
          $set: {
            ...lifecycle,
            updatedAt: now,
          },
        }
      );
    }

    const release = await findReleaseByIdWithTracks(db, releaseObjectId);
    return NextResponse.json({ success: true, release });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update DSP lifecycle status';
    const status = message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
