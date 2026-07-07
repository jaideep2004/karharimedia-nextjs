import { NextResponse } from 'next/server';

export async function GET(_request: Request, { params }: { params: Promise<{ ifsc: string }> }) {
  const { ifsc } = await params;
  const code = ifsc.trim().toUpperCase();

  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ success: false, message: 'Valid IFSC code is required', data: null }, { status: 400 });
  }

  const response = await fetch(`https://ifsc.razorpay.com/${encodeURIComponent(code)}`, {
    next: { revalidate: 60 * 60 * 24 },
  });
  const data = await response.json().catch(() => null);

  return NextResponse.json({ success: response.ok, data }, { status: response.status });
}
