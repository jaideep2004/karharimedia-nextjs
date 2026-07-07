import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { sanitizeDspKeys } from '@/lib/platforms';

const COLLECTION = 'userPlatformAccess';

type Params = { params: Promise<{ userId: string }> };

async function requireAdmin() {
  const user = await getCurrentBackendUser();
  // Project currently has admin role in JWT; keep check simple + allow workspace supervisor emails too.
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const isAdmin =
    (user as any)?.role === 'admin' ||
    ((user as any)?.role === 'subadmin' && permissions.includes('users'));
  if (!isAdmin) {
    return { ok: false as const };
  }
  return { ok: true as const, user };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { userId } = await params;
  const { db } = await connectToDatabase();
  const record = await db.collection(COLLECTION).findOne<{ userId: string; dspKeys: string[] }>({ userId });

  return NextResponse.json({
    success: true,
    data: { dspKeys: Array.isArray(record?.dspKeys) ? record!.dspKeys : null },
  });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { userId } = await params;
  const body = await req.json().catch(() => ({}));
  const dspKeys = sanitizeDspKeys(body?.dspKeys);

  const { db } = await connectToDatabase();
  const now = new Date();
  await db.collection(COLLECTION).updateOne(
    { userId },
    { $set: { userId, dspKeys, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  return NextResponse.json({ success: true, data: { userId, dspKeys } });
}

export const dynamic = 'force-dynamic';
