import { NextResponse } from 'next/server';
import { getAuthToken, getBackendBaseUrl, getRequestAuthToken } from '@/app/api/_lib/backend';

type StreamRequestInit = RequestInit & { duplex?: 'half' };

const parseBackendPayload = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return {
      success: response.ok,
      message: response.ok ? 'Profile image updated' : `Backend request failed with status ${response.status}`,
      data: null,
    };
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      message: text,
      data: null,
    };
  }
};

export async function PUT(request: Request) {
  const token = getRequestAuthToken(request) || await getAuthToken();
  if (!token) {
    return NextResponse.json(
      { success: false, message: 'Authentication required', data: null },
      { status: 401 }
    );
  }

  try {
    const headers = new Headers();
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    headers.set('Authorization', `Bearer ${token}`);

    const init: StreamRequestInit = {
      method: 'PUT',
      headers,
      body: request.body,
      duplex: 'half',
    };

    const response = await fetch(`${getBackendBaseUrl()}/api/auth/me/profile-picture`, init);
    const payload = await parseBackendPayload(response);
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend request failed';
    return NextResponse.json(
      { success: false, message, data: null },
      { status: 500 }
    );
  }
}
