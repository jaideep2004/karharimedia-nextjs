import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { ALL_DSP_KEYS } from '@/lib/platforms';

const COLLECTION = 'userPlatformAccess';

export async function GET() {
  try {
    const user = await getCurrentBackendUser();
    const { db } = await connectToDatabase();
    const userId = String(user._id);
    const queryCandidates: Array<Record<string, unknown>> = [{ userId }];
    if (ObjectId.isValid(userId)) {
      queryCandidates.push({ userId: new ObjectId(userId) });
    }

    const record = await db.collection(COLLECTION).findOne<{ userId: string; dspKeys: string[] }>({
      $or: queryCandidates,
    });

    const dspKeys = Array.isArray(record?.dspKeys) ? record!.dspKeys : ALL_DSP_KEYS;
    return NextResponse.json({ success: true, data: { dspKeys } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load platforms';
    return NextResponse.json(
      { success: false, message },
      { status: message === 'Authentication required' ? 401 : 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
