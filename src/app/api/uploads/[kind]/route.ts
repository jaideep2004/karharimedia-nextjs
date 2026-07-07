import { NextRequest, NextResponse } from 'next/server';
import { getRequestAuthToken, proxyBackend } from '@/app/api/_lib/backend';

const ALLOWED_UPLOAD_KINDS = new Set(['artwork', 'audio']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
) {
  const { kind } = await params;

  if (!ALLOWED_UPLOAD_KINDS.has(kind)) {
    return NextResponse.json(
      { success: false, error: 'Unsupported upload type' },
      { status: 404 }
    );
  }

  const formData = await request.formData();

  return proxyBackend(
    `/api/uploads/${kind}`,
    {
      method: 'POST',
      body: formData,
    },
    {
      authToken: getRequestAuthToken(request),
    }
  );
}
