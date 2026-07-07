import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import {
  deleteKycDraftForUser,
  getKycDraftForUser,
  upsertKycDraftForUser,
} from '@/lib/repositories/kycDrafts';

export async function GET() {
  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    const draft = await getKycDraftForUser(db, String(user._id));

    return NextResponse.json({
      success: true,
      draft: draft?.draft || null,
      updatedAt: draft?.updatedAt || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load KYC draft';
    return NextResponse.json(
      { success: false, error: message },
      { status: message === 'Authentication required' ? 401 : 500 }
    );
  }
}

async function saveKycDraft(req: NextRequest) {
  try {
    const user = await getCurrentBackendUser();
    const body = await req.json().catch(() => null);
    const draft = body?.draft;

    if (!draft || typeof draft !== 'object' || draft.status !== 'draft' || !draft.form) {
      return NextResponse.json({ success: false, error: 'Invalid KYC draft payload' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const saved = await upsertKycDraftForUser(db, String(user._id), {
      ...draft,
      ownerUserId: String(user._id),
    });

    return NextResponse.json({
      success: true,
      draft: saved.value?.draft || draft,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save KYC draft';
    return NextResponse.json(
      { success: false, error: message },
      { status: message === 'Authentication required' ? 401 : 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  return saveKycDraft(req);
}

export async function POST(req: NextRequest) {
  return saveKycDraft(req);
}

export async function DELETE() {
  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    await deleteKycDraftForUser(db, String(user._id));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete KYC draft';
    return NextResponse.json(
      { success: false, error: message },
      { status: message === 'Authentication required' ? 401 : 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
