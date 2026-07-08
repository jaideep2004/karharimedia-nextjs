import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { Db, ObjectId } from 'mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { getGs1DatakartApprovalErrorMessage, Gs1DatakartError } from '@/lib/gs1Datakart';
import { assignIsrcsToTracks, markIsrcsAssigned } from '@/lib/isrcAllocator';
import { assignReleaseUpcWithGs1 } from '@/lib/releaseCodeAssignment';
import { assertBromaReleaseReady } from '@/lib/bromaDeliveryReadiness';
import { createReleaseDeliveryShellJobs } from '@/lib/dspDeliveryShell';
import {
  appUrl,
  getAdminRecipients,
  sendActionEmail,
  sendUserAndAdminEmail,
} from '@/lib/emailNotifications';
import { auditLogsCollection } from '@/lib/repositories/audit';
import {
  findReleaseByIdRaw,
  releasesCollection,
  withOptionalLegacyTrackSnapshot,
} from '@/lib/repositories/releases';
import { replaceReleaseCanonicalTracks } from '@/lib/repositories/tracks';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let dbForFailure: Db | null = null;
  let releaseForFailure: Record<string, any> | null = null;
  try {
    const user = await getCurrentBackendUser();
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    if (user.role !== 'admin' && !(user.role === 'subadmin' && permissions.includes('review'))) {
      return NextResponse.json({ success: false, error: 'Review permission is required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { status, reason } = body as { status?: string; reason?: string };

    if (!status || !['approved', 'rejected', 'pending', 'pending_review'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    let _id: ObjectId;
    try {
      _id = new ObjectId(id);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    dbForFailure = db;

    const nextReleaseStatus = status === 'approved' ? 'uploading_to_broma' : status;
    const update: any = { status: nextReleaseStatus, updatedAt: new Date() };
    const unset: Record<string, ''> = {};
    if (status === 'rejected') update.rejectReason = reason || '';
    if (status !== 'rejected') unset.rejectReason = '';

    const existing = await findReleaseByIdRaw(db, _id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Release not found' }, { status: 404 });
    }
    releaseForFailure = existing;

    let upcAuditDetails: Record<string, unknown> | null = null;
    let deliveryReadiness: Awaited<ReturnType<typeof assertBromaReleaseReady>> | null = null;
    let defaultCreatedCountryIdForDelivery: unknown;

    if (status === 'approved') {
      const tracks = Array.isArray(existing.tracks) ? existing.tracks : [];
      const tracksWithIsrcs = await assignIsrcsToTracks(db, tracks, {
        releaseTitle: existing.releaseTitle,
        source: 'release',
        releaseId: id,
      });
      const codeAssignment = await assignReleaseUpcWithGs1(db, existing, id, tracksWithIsrcs);
      const assignedTracks = codeAssignment.tracksWithUpc;
      const assignment = codeAssignment.releaseUpdate.upcAssignment;

      Object.assign(update, codeAssignment.releaseUpdate);
      Object.assign(update, withOptionalLegacyTrackSnapshot({}, assignedTracks));
      update.codesAssignedAt = existing.codesAssignedAt || new Date();
      unset.upcAssignmentLock = '';
      upcAuditDetails = {
        provider: assignment.provider,
        action: assignment.action,
        gtin: assignment.gtin,
        recordStatus: assignment.recordStatus,
        isComplete: assignment.isComplete,
      };
      const bromaProvider = await db.collection('dspproviders').findOne(
        { key: 'broma' },
        { projection: { 'config.createdCountryId': 1 } }
      );
      defaultCreatedCountryIdForDelivery = bromaProvider?.config?.createdCountryId;
      deliveryReadiness = await assertBromaReleaseReady(db, {
        ...existing,
        ...update,
        tracks: assignedTracks,
      }, { defaultCreatedCountryId: defaultCreatedCountryIdForDelivery });
      await replaceReleaseCanonicalTracks(db, { ...existing, status: nextReleaseStatus }, assignedTracks);
      await markIsrcsAssigned(
        db,
        assignedTracks.map((track: any) => track.isrc).filter(Boolean),
        id
      );
    }

    const res = await releasesCollection(db).findOneAndUpdate(
      { _id },
      {
        $set: update,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { returnDocument: 'after' }
    );

    if (!res.value) {
      return NextResponse.json({ success: false, error: 'Release not found' }, { status: 404 });
    }

    if (upcAuditDetails) {
      await auditLogsCollection(db)
        .insertOne({
          event: 'release.upc.assigned',
          releaseId: id,
          actorUserId: String(user._id),
          details: upcAuditDetails,
          createdAt: new Date(),
        })
        .catch((error) =>
          console.warn(
            'Release UPC audit skipped:',
            error instanceof Error ? error.message : error
          )
        );

      void getAdminRecipients(db)
        .then((admins) =>
          sendActionEmail(
            admins,
            {
              subject: 'GS1 UPC Assigned',
              title: 'GS1 UPC Assigned',
              intro: 'GS1 DataKart assigned and validated a UPC for a release.',
              details: {
                Release: existing.releaseTitle || existing.title || 'Untitled release',
                UPC: String(upcAuditDetails.gtin || ''),
                Provider: String(upcAuditDetails.provider || ''),
                Action: String(upcAuditDetails.action || ''),
                Status: String(upcAuditDetails.recordStatus || 'validated'),
                'Reviewed By': 'Karhari Media Distribution',
              },
              actionLabel: 'Open Release',
              actionUrl: appUrl(`/admin/releases/${id}`),
            },
            db
          )
        )
        .catch((error) =>
          console.warn(
            'GS1 UPC notification skipped:',
            error instanceof Error ? error.message : error
          )
        );
    }

    let deliveryShell = null;
    if (status === 'approved') {
      deliveryShell = await createReleaseDeliveryShellJobs(db, res.value as any, String(user._id), {
        bromaReadiness: deliveryReadiness || undefined,
        assetReadiness: deliveryReadiness?.assetReadiness,
        defaultCreatedCountryId: defaultCreatedCountryIdForDelivery,
      });
    }

    if (status === 'approved' || status === 'rejected') {
      const approvedAction = status === 'approved';
      void sendUserAndAdminEmail(
        db,
        { name: existing.ownerName || existing.primaryArtist || existing.artist, email: existing.ownerEmail },
        {
          subject: `Release ${approvedAction ? 'in process' : 'needs correction'}: ${existing.releaseTitle || existing.title || 'Untitled release'}`,
          title: `Release ${approvedAction ? 'In Process' : 'Rejected'}`,
          intro: approvedAction
            ? 'Your release passed admin review and is now being delivered to Broma for moderation.'
            : 'Your release needs correction before distribution.',
          details: {
            Release: existing.releaseTitle || existing.title || 'Untitled release',
            Status: approvedAction ? 'in_process' : status,
            UPC: approvedAction ? String(res.value.upc || '') : undefined,
            UPCProvider: approvedAction ? String(res.value.upcProvider || '') : undefined,
            Reason: reason,
            'Reviewed By': 'Karhari Media Distribution',
          },
          release: {
            title: existing.releaseTitle || existing.title || 'Untitled release',
            coverUrl: existing.artworkUrl || existing.artwork || existing.coverUrl,
            artist: existing.primaryArtist || existing.artist || existing.ownerName,
            label: existing.label,
            genre: existing.genre,
            releaseDate: existing.releaseDate,
            upc: String(res.value.upc || existing.upc || ''),
            status: approvedAction ? 'uploading_to_broma' : status,
            tracks: Array.isArray(res.value.tracks) ? res.value.tracks : Array.isArray(existing.tracks) ? existing.tracks : [],
            stores: Array.isArray(existing.stores) ? existing.stores : [],
            policyAcceptances: existing.policyAcceptances,
          },
          actionLabel: approvedAction ? 'Open Releases' : 'Review Release',
          actionUrl: appUrl(approvedAction ? '/dashboard/releases?status=in_process' : `/dashboard/releases/${id}`),
        }
      ).catch((error) => console.warn('Release status email skipped:', error));
    }

    return NextResponse.json({ success: true, release: res.value, deliveryShell });
  } catch (e: any) {
    let responseStatus = 500;
    if (e instanceof Gs1DatakartError) {
      responseStatus = e.statusCode >= 500 && e.details !== undefined ? 502 : e.statusCode;
    } else if (typeof e?.statusCode === 'number' && e.statusCode >= 400 && e.statusCode <= 599) {
      responseStatus = e.statusCode;
    }

    const responseMessage =
      e instanceof Gs1DatakartError
        ? getGs1DatakartApprovalErrorMessage(e)
        : e?.message || 'Failed to update status';
    if (e instanceof Gs1DatakartError && dbForFailure) {
      console.warn('GS1 UPC assignment blocked approval:', {
        statusCode: e.statusCode,
        message: e.message,
        details: e.details,
        releaseId: id,
      });
      void getAdminRecipients(dbForFailure)
        .then((admins) =>
          sendActionEmail(
            admins,
            {
              subject: 'GS1 UPC Assignment Failed',
              title: 'GS1 UPC Assignment Failed',
              intro: 'Release approval was blocked before UPC was saved.',
              details: {
                Release: releaseForFailure?.releaseTitle || releaseForFailure?.title || id,
                Provider: 'gs1-datakart',
                Error: responseMessage,
                ProviderError: responseMessage === e.message ? undefined : e.message,
                'Reviewed By': 'Karhari Media Distribution',
              },
              actionLabel: 'Open Release',
              actionUrl: appUrl(`/admin/releases/${id}`),
            },
            dbForFailure || undefined
          )
        )
        .catch((error) =>
          console.warn(
            'GS1 UPC failure notification skipped:',
            error instanceof Error ? error.message : error
          )
        );
    }
    return NextResponse.json(
      { success: false, error: responseMessage },
      { status: responseStatus }
    );
  }
}

export const dynamic = 'force-dynamic';
