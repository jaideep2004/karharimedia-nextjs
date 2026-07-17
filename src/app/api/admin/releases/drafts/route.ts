import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import {
  deleteReleaseDraftById,
  ensureReleaseDraftIndexes,
  listAllReleaseDrafts,
} from '@/lib/repositories/releaseDrafts';

export async function GET() {
  try {
    const user = await getCurrentBackendUser();
    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    await ensureReleaseDraftIndexes(db);
    const drafts = await listAllReleaseDrafts(db);

    const serialized = drafts.map((d) => ({
      _id: String(d._id),
      draftId: d.draftId,
      ownerUserId: d.ownerUserId,
      ownerEmail: d.ownerEmail || null,
      ownerName: d.ownerName || null,
      title: d.draft?.releaseTitle || d.draft?.title || d.draft?.release_title || 'Untitled',
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    return NextResponse.json({ success: true, data: { drafts: serialized } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch drafts';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const draftId = req.nextUrl.searchParams.get('id')?.trim();
    const deleteOlderThanDays = req.nextUrl.searchParams.get('olderThanDays');

    const { db } = await connectToDatabase();
    await ensureReleaseDraftIndexes(db);

    if (deleteOlderThanDays) {
      const days = Number(deleteOlderThanDays);
      if (isNaN(days) || days < 1) {
        return NextResponse.json({ success: false, error: 'Invalid olderThanDays' }, { status: 400 });
      }
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const result = await (await import('@/lib/repositories/releaseDrafts'))
        .releaseDraftsCollection(db)
        .deleteMany({ updatedAt: { $lt: cutoff } });
      return NextResponse.json({ success: true, deleted: result.deletedCount });
    }

    if (!draftId) {
      return NextResponse.json({ success: false, error: 'Draft id is required' }, { status: 400 });
    }

    const result = await deleteReleaseDraftById(db, draftId);
    if (!result?.deletedCount) {
      return NextResponse.json({ success: false, error: 'Draft not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete draft';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
