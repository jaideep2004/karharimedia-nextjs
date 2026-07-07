import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { proxyBackend } from '@/app/api/_lib/backend';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { connectToDatabase } from '@/utils/mongodb';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const backendResponse = await proxyBackend(`/api/dsp/deliveries/${encodeURIComponent(jobId)}/refresh-status`, { method: 'POST' });
  if (backendResponse.status < 400) return backendResponse;

  try {
    const user = await getCurrentBackendUser();
    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ success: false, message: 'Admin access required', data: null }, { status: 403 });
    }
    if (!ObjectId.isValid(jobId)) {
      return NextResponse.json({ success: false, message: 'Delivery job not found', data: null }, { status: 404 });
    }
    const { db } = await connectToDatabase();
    const _id = new ObjectId(jobId);
    const job = await db.collection('deliveryjobs').findOne({ _id });
    if (!job) {
      return NextResponse.json({ success: false, message: 'Delivery job not found', data: null }, { status: 404 });
    }

    const now = new Date();
    await db.collection('deliveryjobs').updateOne(
      { _id },
      {
        $set: {
          updatedAt: now,
          'metadata.bromaLastStatusAt': now,
        },
        $push: {
          events: {
            state: job.state || 'processing',
            message: 'Broma status refresh requested; live connector unavailable, showing latest saved job state',
            source: 'system',
            createdAt: now,
          },
        },
      }
    );
    const updated = await db.collection('deliveryjobs').findOne({ _id });

    return NextResponse.json({
      success: true,
      message: 'Latest saved Broma status loaded',
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh delivery status';
    return NextResponse.json({ success: false, message, data: null }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}
