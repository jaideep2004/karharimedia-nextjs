import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { proxyBackend } from '@/app/api/_lib/backend';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { connectToDatabase } from '@/utils/mongodb';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const backendResponse = await proxyBackend(`/api/dsp/deliveries/${encodeURIComponent(jobId)}/logs`, { method: 'DELETE' });
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

    await db.collection('deliveryjobs').updateOne(
      { _id },
      {
        $set: {
          state: 'queued',
          retryCount: 0,
          deadLettered: false,
          nextRetryAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: {
          errorMessage: '',
          lockedAt: '',
          lockedBy: '',
          lockExpiresAt: '',
        },
        $push: {
          events: {
            state: 'queued',
            message: 'Delivery log cleared by admin',
            source: 'user',
            createdAt: new Date(),
          },
        },
      }
    );

    let releaseReset = false;
    if (job.releaseId) {
      const releaseResult = await db.collection('releases').updateOne(
        { _id: job.releaseId },
        {
          $set: {
            status: 'pending_review',
            updatedAt: new Date(),
          },
        }
      );
      releaseReset = releaseResult.modifiedCount > 0;
    }

    return NextResponse.json({
      success: true,
      message: releaseReset ? 'Delivery log cleared and release moved back to pending' : 'Delivery log cleared',
      data: {
        jobId,
        cleared: true,
        releaseId: job.releaseId?.toString?.(),
        releaseReset,
        releaseMissing: Boolean(job.releaseId) && !releaseReset,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear delivery logs';
    return NextResponse.json({ success: false, message, data: null }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}
