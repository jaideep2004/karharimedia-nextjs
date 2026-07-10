import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { proxyBackend } from '@/app/api/_lib/backend';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { connectToDatabase } from '@/utils/mongodb';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const backendResponse = await proxyBackend(`/api/dsp/deliveries/${encodeURIComponent(jobId)}`);
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
    const job = await db.collection('deliveryjobs').findOne({ _id: new ObjectId(jobId) });
    if (!job) {
      return NextResponse.json({ success: false, message: 'Delivery job not found', data: null }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Delivery job fetched', data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch delivery job';
    return NextResponse.json({ success: false, message, data: null }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  try {
    const user = await getCurrentBackendUser();
    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ success: false, message: 'Admin access required', data: null }, { status: 403 });
    }
    if (!ObjectId.isValid(jobId)) {
      return NextResponse.json({ success: false, message: 'Delivery job not found', data: null }, { status: 404 });
    }
    const { db } = await connectToDatabase();
    const job = await db.collection('deliveryjobs').findOneAndDelete({ _id: new ObjectId(jobId) });
    if (!job) {
      return NextResponse.json({ success: false, message: 'Delivery job not found', data: null }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Delivery job deleted permanently' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete delivery job';
    return NextResponse.json({ success: false, message, data: null }, { status: 500 });
  }
}
