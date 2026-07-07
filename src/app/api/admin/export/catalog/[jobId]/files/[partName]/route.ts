import fs from 'fs';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/utils/mongodb';
import { getCurrentBackendUser } from '@/lib/currentUser';
import { getCatalogExportPart } from '@/lib/adminCatalogExport';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string; partName: string }> }
) {
  const { jobId, partName } = await params;

  try {
    const user = await getCurrentBackendUser();
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Full admin access required' }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const result = await getCatalogExportPart(db, jobId, partName);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Export file not found' }, { status: 404 });
    }

    const stats = await fs.promises.stat(result.part.path);
    if (!stats.isFile()) {
      return NextResponse.json({ success: false, error: 'Export file is unavailable' }, { status: 404 });
    }

    const stream = fs.createReadStream(result.part.path);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${result.part.name}"`,
        'Content-Length': String(stats.size),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download export file';
    const status = message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
