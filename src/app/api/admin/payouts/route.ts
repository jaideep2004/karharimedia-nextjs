import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const limit = searchParams.get('limit') || '10';

  // Return empty array for now since we don't have a real payouts API
  return NextResponse.json({
    success: true,
    data: [],
    pagination: {
      total: 0,
      limit: parseInt(limit),
      page: 1,
      totalPages: 1
    }
  });
}
