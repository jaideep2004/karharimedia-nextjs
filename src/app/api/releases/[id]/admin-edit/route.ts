import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { buildReleasePolicyProof } from '@/lib/releaseConsent';
import {
  findReleaseByIdRaw,
  releasesCollection,
  updateReleaseTracksSnapshot,
} from '@/lib/repositories/releases';

const ADMIN_EDITABLE_FIELDS = [
  'releaseType',
  'releaseTitle',
  'primaryArtist',
  'label',
  'releaseDate',
  'originalReleaseDate',
  'artwork',
  'artworkFile',
  'territories',
  'stores',
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const user = await getCurrentBackendUser();
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    if (
      user.role !== 'admin' &&
      !(user.role === 'subadmin' && permissions.includes('review'))
    ) {
      return NextResponse.json(
        { success: false, error: 'Review permission is required' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { db } = await connectToDatabase();
    const release = await findReleaseByIdRaw(db, id);

    if (!release) {
      return NextResponse.json(
        { success: false, error: 'Release not found' },
        { status: 404 }
      );
    }

    const normalizedStatus = String(release.status || '').trim().toLowerCase();
    const isPending = ['pending', 'pending_review', 'submitted', 'under_review', 'review', ''].includes(normalizedStatus);
    const isRejected = ['rejected', 'declined', 'failed', 'error', 'cancelled', 'not_ready'].includes(normalizedStatus);

    if (!isPending && !isRejected) {
      return NextResponse.json(
        { success: false, error: 'Only pending or rejected releases can be edited by admin' },
        { status: 400 }
      );
    }

    const releaseUpdate: Record<string, any> = {};
    for (const field of ADMIN_EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        releaseUpdate[field] = body[field];
      }
    }

    if (Object.keys(releaseUpdate).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No editable fields provided' },
        { status: 400 }
      );
    }

    const now = new Date();
    const tracks = Array.isArray(body.tracks) ? body.tracks : undefined;

    if (isRejected && tracks !== undefined) {
      const policyAcceptances = buildReleasePolicyProof(
        body.stores ?? release.stores,
        body.policyAcceptances,
        user
      );

      await updateReleaseTracksSnapshot(
        db,
        release,
        tracks,
        {
          ...releaseUpdate,
          policyAcceptances,
          status: 'pending',
          updatedAt: now,
          resubmittedAt: now,
          resubmittedBy: String(user._id),
          editLockedByStatus: false,
        }
      );

      await releasesCollection(db).updateOne(
        { _id: release._id },
        {
          $unset: {
            rejectReason: '',
            rejectionReason: '',
          },
          $push: {
            auditEvents: {
              type: 'release_admin_edited_and_resubmitted',
              actorId: String(user._id),
              actorEmail: user.email || '',
              createdAt: now,
            },
            ...(body.policyAcceptances
              ? { policyAcceptanceEvents: policyAcceptances }
              : {}),
          },
        } as any,
      );
    } else {
      releaseUpdate.updatedAt = now;
      await releasesCollection(db).updateOne(
        { _id: release._id },
        {
          $set: releaseUpdate,
          $push: {
            auditEvents: {
              type: 'release_admin_edited',
              actorId: String(user._id),
              actorEmail: user.email || '',
              createdAt: now,
              fields: Object.keys(releaseUpdate),
            },
          },
        } as any,
      );
    }

    const updatedRelease = await findReleaseByIdRaw(db, release._id);
    return NextResponse.json({ success: true, release: updatedRelease });
  } catch (e: any) {
    const message = e?.message || 'Failed to update release';
    return NextResponse.json(
      { success: false, error: message },
      { status: message === 'Authentication required' ? 401 : 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
