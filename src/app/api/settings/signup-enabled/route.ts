import { NextResponse } from 'next/server';
import { fetchBackend } from '@/app/api/_lib/backend';

export async function GET() {
  try {
    const result = await fetchBackend('/api/settings/signupEnabled', {}, { requireAuth: false });
    const data = result.data as {
      success?: boolean;
      data?: { value?: boolean };
    } | null;

    if (result.ok && data?.success && data.data) {
      return NextResponse.json({
        success: true,
        enabled: data.data.value === true
      });
    }

    return NextResponse.json(
      {
        success: false,
        enabled: true,
        message: 'Failed to verify signup availability'
      },
      { status: result.status }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check if signups are enabled';
    return NextResponse.json({
      success: false,
      enabled: true,
      message
    });
  }
} 
