import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import {
  deleteReleaseDraftForUser,
  ensureReleaseDraftIndexes,
  getReleaseDraftForUser,
  listReleaseDraftsForUser,
  upsertReleaseDraftForUser,
} from '@/lib/repositories/releaseDrafts';

const serializeDraft = (document: any) => ({
  ...(document?.draft || {}),
  draftId: document?.draftId || String(document?._id || ''),
  createdAt: document?.createdAt || document?.draft?.createdAt || null,
  updatedAt: document?.updatedAt || document?.draft?.updatedAt || null,
});

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    await ensureReleaseDraftIndexes(db);
    const draftId = req.nextUrl.searchParams.get('id')?.trim();

    if (draftId) {
      const draft = await getReleaseDraftForUser(db, String(user._id), draftId);
      return NextResponse.json({
        success: true,
        draft: draft ? serializeDraft(draft) : null,
      });
    }

    const documents = await listReleaseDraftsForUser(db, String(user._id));
    const drafts = documents.map(serializeDraft);

    return NextResponse.json({
      success: true,
      drafts,
      draft: drafts[0] || null,
      updatedAt: documents[0]?.updatedAt || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load release draft';
    return NextResponse.json(
      { success: false, error: message },
      { status: message === 'Authentication required' ? 401 : 500 }
    );
  }
}

async function saveReleaseDraft(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    const body = await req.json().catch(() => null);
    const draft = body?.draft;
    const draftId = String(body?.draftId || draft?.draftId || '').trim();

    if (!draft || typeof draft !== 'object' || draft.status !== 'draft' || !draftId) {
      return NextResponse.json({ success: false, error: 'Invalid draft payload' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    await ensureReleaseDraftIndexes(db);
    const saved = await upsertReleaseDraftForUser(db, String(user._id), draftId, {
      ...draft,
      draftId,
      ownerUserId: String(user._id),
    });

    return NextResponse.json({
      success: true,
      draft: saved.value ? serializeDraft(saved.value) : draft,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save release draft';
    return NextResponse.json(
      { success: false, error: message },
      { status: message === 'Authentication required' ? 401 : 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  return saveReleaseDraft(req);
}

export async function POST(req: NextRequest) {
  return saveReleaseDraft(req);
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    const draftId = req.nextUrl.searchParams.get('id')?.trim();
    if (!draftId) {
      return NextResponse.json({ success: false, error: 'Draft id is required' }, { status: 400 });
    }
    const { db } = await connectToDatabase();
    await ensureReleaseDraftIndexes(db);
    await deleteReleaseDraftForUser(db, String(user._id), draftId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete release draft';
    return NextResponse.json(
      { success: false, error: message },
      { status: message === 'Authentication required' ? 401 : 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
