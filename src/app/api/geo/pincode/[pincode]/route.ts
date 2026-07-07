import { NextResponse } from 'next/server';

export async function GET(_request: Request, { params }: { params: Promise<{ pincode: string }> }) {
  const { pincode } = await params;
  if (!/^\d{6}$/.test(pincode)) {
    return NextResponse.json({ success: false, message: 'Valid 6 digit pincode is required', data: [] }, { status: 400 });
  }

  const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
    next: { revalidate: 60 * 60 * 24 },
  });
  const data = await response.json().catch(() => []);

  return NextResponse.json({ success: response.ok, data }, { status: response.status });
}
