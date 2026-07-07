import { NextResponse } from 'next/server';

const CSC_BASE_URL = 'https://api.countrystatecity.in/v1';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ countryIso: string; stateIso: string }> }
) {
  const apiKey = process.env.COUNTRY_STATE_CITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, message: 'CountryStateCity API key is not configured', data: [] }, { status: 503 });
  }

  const { countryIso, stateIso } = await params;
  const response = await fetch(
    `${CSC_BASE_URL}/countries/${encodeURIComponent(countryIso)}/states/${encodeURIComponent(stateIso)}/cities`,
    {
      headers: { 'X-CSCAPI-KEY': apiKey },
      next: { revalidate: 60 * 60 * 24 },
    }
  );
  const data = await response.json().catch(() => []);

  return NextResponse.json({ success: response.ok, data }, { status: response.status });
}
