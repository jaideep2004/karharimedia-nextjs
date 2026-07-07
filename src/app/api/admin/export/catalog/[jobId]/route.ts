import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { getCatalogExportJob } from '@/lib/adminCatalogExport';

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    const user = await getCurrentBackendUser();
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Full admin access required' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const job = await getCatalogExportJob(db, jobId);
    if (!job) {
      return NextResponse.json({ success: false, error: 'Export job not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { job: serializeJob(job) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load export job';
    const status = message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
