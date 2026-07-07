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
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20)));
    const query: Record<string, any> = {};
    if (providerKey) query.providerKey = providerKey;
    if (state) query.state = state;

    const [data, total] = await Promise.all([
      db.collection('deliveryjobs')
        .find(query, { projection: { attempts: 0, events: 0 } })
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      db.collection('deliveryjobs').countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Delivery jobs fetched',
      data: {
        data,
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
