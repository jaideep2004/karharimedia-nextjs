import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { enforceMongoRateLimit, RateLimitError } from '@/lib/mongoRateLimit';
import {
  type CatalogExportScope,
  type CatalogExportStatus,
  createCatalogExportJob,
  listCatalogExportJobs,
} from '@/lib/adminCatalogExport';

function getClientKey(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function serializeJob(job: unknown) {
  if (!job || typeof job !== 'object') return null;
  const row = job as Record<string, unknown>;
  const parts = Array.isArray(row.parts)
    ? row.parts.map((part) => {
        const value = part as Record<string, unknown>;
        return {
          name: value.name,
          type: value.type,
          size: value.size,
          trackCount: value.trackCount,
          createdAt: value.createdAt,
        };
      })
    : [];

  return {
    _id: String(row._id || ''),
    scope: row.scope,
    criteria: row.criteria,
    state: row.state,
    counts: row.counts,
    parts,
    errors: row.errors,
    warnings: row.warnings,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requireFullAdmin() {
  const user = await getCurrentBackendUser();
  if (user.role !== 'admin') {
    return { user, response: NextResponse.json({ success: false, error: 'Full admin access required' }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function GET() {
  try {
    const { response } = await requireFullAdmin();
    if (response) return response;

    const { db } = await connectToDatabase();
    const jobs = await listCatalogExportJobs(db);

    return NextResponse.json({
      success: true,
      data: {
        jobs: jobs.map(serializeJob),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load export jobs';
    const status = message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireFullAdmin();
    if (response) return response;

    const { db } = await connectToDatabase();
    const body = await req.json().catch(() => ({}));
    const scope = ['release', 'user', 'users', 'status'].includes(body?.scope) ? body.scope as CatalogExportScope : 'status';
    const statuses = Array.isArray(body?.statuses)
      ? body.statuses.filter((status: string): status is CatalogExportStatus => ['approved', 'pending', 'rejected'].includes(status))
      : ['approved'];
    const releaseIds = Array.isArray(body?.releaseIds)
      ? body.releaseIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];
    const userId = body?.userId ? String(body.userId) : undefined;
    const userIds = Array.isArray(body?.userIds)
      ? body.userIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];
    const zipGrouping = body?.zipGrouping === 'per_user' ? 'per_user' : 'per_release';

    if (scope === 'release' && releaseIds.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one release is required' }, { status: 400 });
    }
    if (scope === 'user' && !userId) {
      return NextResponse.json({ success: false, error: 'User is required for user-wise export' }, { status: 400 });
    }
    if (scope === 'users' && userIds.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one user is required for selected-users export' }, { status: 400 });
    }

    await enforceMongoRateLimit(db, {
      key: `POST:/api/admin/export/catalog:${user._id || getClientKey(req)}`,
      limit: 5,
      windowMs: 60 * 1000,
    });

    const job = await createCatalogExportJob(db, {
      _id: String(user._id),
      email: user.email,
    }, {
      scope,
      criteria: {
        releaseIds,
        userId,
        userIds,
        statuses,
        zipGrouping: scope === 'users' || (scope === 'user' && zipGrouping === 'per_user')
          ? 'per_user'
          : 'per_release',
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: { job: serializeJob(job) },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create catalog export';
    const status = error instanceof RateLimitError ? error.statusCode : message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
