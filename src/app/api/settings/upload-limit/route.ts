import { NextResponse } from 'next/server';
import { fetchBackend } from '@/app/api/_lib/backend';

export async function GET() {
  try {
    const result = await fetchBackend('/api/settings/uploadLimit', {}, { requireAuth: false });
    const data = result.data as {
      success?: boolean;
      data?: { value?: number; allowedFileTypes?: string[] };
    } | null;

    if (result.ok && data?.success && data.data) {
      const value = Number(data.data.value || 100);
      return NextResponse.json({
        success: true,
        maxUploadSize: Math.min(200, Math.max(1, Number.isFinite(value) ? value : 100)),
        allowedFileTypes: Array.isArray(data.data.allowedFileTypes)
          ? data.data.allowedFileTypes
          : ['mp3', 'wav', 'aac', 'flac'],
      });
    }

    return NextResponse.json(
      { success: false, maxUploadSize: 100, allowedFileTypes: ['mp3', 'wav', 'aac', 'flac'] },
      { status: result.status }
    );
  } catch {
    return NextResponse.json({
      success: false,
      maxUploadSize: 100,
      allowedFileTypes: ['mp3', 'wav', 'aac', 'flac'],
    });
  }
}
