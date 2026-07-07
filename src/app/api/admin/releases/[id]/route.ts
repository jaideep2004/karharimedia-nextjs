import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/utils/mongodb';
import { fetchBackend } from '@/app/api/_lib/backend';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { auditLogsCollection } from '@/lib/repositories/audit';
import { findReleaseByIdRaw, releasesCollection } from '@/lib/repositories/releases';
import { tracksCollection } from '@/lib/repositories/tracks';

const firstString = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const user = await getCurrentBackendUser();
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    if (user.role !== 'admin' && !(user.role === 'subadmin' && permissions.includes('settings'))) {
      return NextResponse.json({ success: false, error: 'Settings permission is required' }, { status: 403 });
    }

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid release id' }, { status: 400 });
    }

    const releaseObjectId = new ObjectId(id);
    const { db } = await connectToDatabase();
    const release = await findReleaseByIdRaw(db, releaseObjectId);
    if (!release) {
      return NextResponse.json({ success: false, error: 'Release not found' }, { status: 404 });
    }

    const now = new Date();
    const bromaJob = await (db.collection('deliveryjobs') as any)
      .find({ releaseId: { $in: [releaseObjectId, id] }, providerKey: 'broma', targetType: 'release' })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1)
      .next();
    const bromaReleaseId = firstString(
      release.bromaDelivery?.releaseId,
      bromaJob?.externalId,
      bromaJob?.metadata?.bromaReleaseId
    );
    let bromaDraftDelete: Record<string, unknown> | null = null;
    if (bromaReleaseId) {
      const bromaDeleteResult = await fetchBackend(
        `/api/dsp/broma/drafts/release/${encodeURIComponent(bromaReleaseId)}`,
        { method: 'DELETE' }
      ).catch((error) => ({
        ok: false,
        status: 500,
        data: { success: false, error: error instanceof Error ? error.message : 'Broma draft delete failed' },
      }));
      bromaDraftDelete = {
        attempted: true,
        releaseId: bromaReleaseId,
        ok: bromaDeleteResult.ok,
        status: bromaDeleteResult.status,
        response: bromaDeleteResult.data,
      };
    }

    const [releaseDelete, trackUpdate, deliveryJobUpdate] = await Promise.all([
      releasesCollection(db).deleteOne({ _id: releaseObjectId }),
      (tracksCollection(db) as any).updateMany(
        { releaseId: { $in: [releaseObjectId, id] }, source: 'release_embed', deletedAt: { $exists: false } },
        { $set: { deletedAt: now, updatedAt: now } }
      ),
      (db.collection('deliveryjobs') as any).updateMany(
        { releaseId: { $in: [releaseObjectId, id] }, state: { $in: ['queued', 'processing', 'needs_attention'] } },
        {
          $set: {
            state: 'cancelled',
            errorMessage: 'Release deleted by admin',
            updatedAt: now,
          },
          $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '', nextRetryAt: '' },
          $push: {
            events: {
              state: 'cancelled',
              message: 'Release deleted by admin; delivery job cancelled',
              source: 'system',
              createdAt: now,
            },
          },
        }
      ),
    ]);

    await auditLogsCollection(db).insertOne({
      event: 'release.deleted',
      releaseId: id,
      actorUserId: String(user._id),
      details: {
        releaseTitle: release.releaseTitle || release.title || 'Untitled release',
        upc: release.upc,
        ownerUserId: release.ownerUserId || release.userId || release.artistId || release.ownerId,
        tracksSoftDeleted: trackUpdate.modifiedCount,
        deliveryJobsCancelled: deliveryJobUpdate.modifiedCount,
        bromaDraftDelete,
      },
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      data: {
        releaseDeleted: releaseDelete.deletedCount,
        tracksSoftDeleted: trackUpdate.modifiedCount,
        deliveryJobsCancelled: deliveryJobUpdate.modifiedCount,
        bromaDraftDelete,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete release' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
