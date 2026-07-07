import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import {
  findReleaseByIdRaw,
  findReleaseByIdWithTracks,
  releasesCollection,
  updateReleaseTracksSnapshot,
} from '@/lib/repositories/releases';
import { buildReleasePolicyProof } from '@/lib/releaseConsent';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canReadRelease(release: any, user: any) {
  if (user.role === 'admin' || user.role === 'subadmin') return true;
  const userId = String(user._id);
  if ([release.userId, release.artistId, release.ownerId, release.createdBy].some((value) => String(value || '') === userId)) return true;
  const names = [user.artistName, user.name].filter(Boolean).map((value: string) => value.trim());
  return names.some((name) => {
    const pattern = new RegExp(`^${escapeRegex(name)}$`, 'i');
    return pattern.test(String(release.primaryArtist || '')) || pattern.test(String(release.artist || '')) || pattern.test(String(release.label || ''));
  });
}

function getReleaseOwnerId(release: any) {
  return [release.ownerUserId, release.userId, release.artistId, release.ownerId, release.createdBy]
    .map((value) => String(value || '').trim())
    .find(Boolean);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    const release = await findReleaseByIdWithTracks(db, id);
    if (!release) {
      return NextResponse.json({ success: false, error: 'Release not found' }, { status: 404 });
    }
    if (!canReadRelease(release, user)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const ownerId = getReleaseOwnerId(release);
    const ownerUser = ownerId && ObjectId.isValid(ownerId)
      ? await db.collection('users').findOne(
          { _id: new ObjectId(ownerId) },
          { projection: { name: 1, email: 1, artistName: 1, role: 1, accountType: 1 } }
        )
      : null;
    const enrichedRelease = ownerUser
      ? {
          ...release,
          ownerUser,
          userName: ownerUser.name || ownerUser.artistName || ownerUser.email,
          userEmail: ownerUser.email,
        }
      : release;

    return NextResponse.json({ success: true, release: enrichedRelease });
  } catch (e: any) {
    const message = e?.message || 'Failed to fetch release';
    return NextResponse.json({ success: false, error: message }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    if (action !== 'resubmit' && action !== 'update_and_resubmit') {
      return NextResponse.json({ success: false, error: 'Unsupported release action' }, { status: 400 });
    }

    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    const release = await findReleaseByIdRaw(db, id);

    if (!release) {
      return NextResponse.json({ success: false, error: 'Release not found' }, { status: 404 });
    }
    if (!canReadRelease(release, user)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (release.status !== 'rejected') {
      return NextResponse.json({ success: false, error: 'Only rejected releases can be resubmitted' }, { status: 400 });
    }

    const now = new Date();

    if (action === 'update_and_resubmit') {
      const policyAcceptances = buildReleasePolicyProof(
        body.stores,
        body.policyAcceptances,
        user
      );
      const allowedFields = [
        'releaseType',
        'releaseTitle',
        'primaryArtist',
        'label',
        'upc',
        'autoGenerateCodes',
        'releaseDate',
        'originalReleaseDate',
        'artworkUrl',
        'artworkFile',
        'territories',
        'stores',
      ];
      const releaseUpdate = allowedFields.reduce<Record<string, any>>((next, field) => {
        if (Object.prototype.hasOwnProperty.call(body, field)) next[field] = body[field];
        return next;
      }, {});
      const tracks = Array.isArray(body.tracks) ? body.tracks : [];

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
              type: 'release_updated_and_resubmitted',
              actorId: String(user._id),
              actorEmail: user.email || '',
              createdAt: now,
            },
            policyAcceptanceEvents: policyAcceptances,
          },
        } as any,
      );

      const updatedRelease = await findReleaseByIdRaw(db, release._id);
      return NextResponse.json({ success: true, release: updatedRelease });
    }

    const result = await releasesCollection(db).findOneAndUpdate(
      { _id: release._id },
      {
        $set: {
          status: 'pending',
          updatedAt: now,
          resubmittedAt: now,
          resubmittedBy: String(user._id),
        },
        $unset: {
          rejectReason: '',
          rejectionReason: '',
        },
        $push: {
          auditEvents: {
            type: 'release_resubmitted',
            actorId: String(user._id),
            actorEmail: user.email || '',
            createdAt: now,
          },
        },
      } as any,
      { returnDocument: 'after' }
    );

    return NextResponse.json({ success: true, release: result.value });
  } catch (e: any) {
    const message = e?.message || 'Failed to resubmit release';
    return NextResponse.json({ success: false, error: message }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}

export const dynamic = 'force-dynamic';
