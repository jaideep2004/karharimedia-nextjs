import { NextResponse } from 'next/server';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { connectToDatabase } from '@/utils/mongodb';

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const user = await getCurrentBackendUser();
    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ success: false, message: 'Admin access required', data: null }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const providerKey = url.searchParams.get('providerKey') || '';
    const state = url.searchParams.get('state') || '';
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 100)));
    const search = url.searchParams.get('search') || '';
    const query: Record<string, any> = {};
    if (providerKey) query.providerKey = providerKey;
    if (state) query.state = state;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { releaseId: { $regex: escaped, $options: 'i' } },
        { 'metadata.releaseTitle': { $regex: escaped, $options: 'i' } },
        { externalId: { $regex: escaped, $options: 'i' } },
        { providerJobId: { $regex: escaped, $options: 'i' } },
      ];
    }

    const allJobsQuery: Record<string, any> = {};
    if (providerKey) allJobsQuery.providerKey = providerKey;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      allJobsQuery.$or = [
        { releaseId: { $regex: escaped, $options: 'i' } },
        { 'metadata.releaseTitle': { $regex: escaped, $options: 'i' } },
        { externalId: { $regex: escaped, $options: 'i' } },
        { providerJobId: { $regex: escaped, $options: 'i' } },
      ];
    }
    const [rawData, total, countResults] = await Promise.all([
      db.collection('deliveryjobs')
        .find(query, { projection: { attempts: 0, events: 0 } })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      db.collection('deliveryjobs').countDocuments(query),
      db.collection('deliveryjobs').aggregate([
        { $match: allJobsQuery },
        { $group: { _id: '$state', count: { $sum: 1 } } },
      ]).toArray(),
    ]);
    const data = rawData.sort((a, b) => {
      const tA = a.updatedAt ? new Date(a.updatedAt).valueOf() : (a.createdAt ? new Date(a.createdAt).valueOf() : 0);
      const tB = b.updatedAt ? new Date(b.updatedAt).valueOf() : (b.createdAt ? new Date(b.createdAt).valueOf() : 0);
      return tB - tA;
    });

    const counts: Record<string, number> = {};
    for (const row of countResults) {
      counts[row._id || 'unknown'] = row.count;
    }
    const totalAll = (counts.processing || 0) + (counts.delivered || 0) + (counts.queued || 0) + (counts.failed || 0) + (counts.needs_attention || 0);

    return NextResponse.json({
      success: true,
      message: 'Delivery jobs fetched',
      data: {
        data,
        counts: {
          all: totalAll,
          processing: counts.processing || 0,
          delivered: counts.delivered || 0,
          failed: (counts.failed || 0) + (counts.needs_attention || 0),
          queued: counts.queued || 0,
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch delivery jobs';
    const status = message === 'Authentication required' ? 401 : 200;
    return NextResponse.json({
      success: status !== 401,
      message: status === 401 ? message : 'Delivery jobs temporarily unavailable',
      data: {
        data: [],
        pagination: {
          total: 0,
          page: Math.max(1, Number(url.searchParams.get('page') || 1)),
          limit: Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20))),
          totalPages: 1,
        },
      },
    }, { status });
  }
}
