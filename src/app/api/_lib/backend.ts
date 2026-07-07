import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getConfiguredBackendOrigin } from '@/lib/urlConfig';

type ProxyOptions = {
  requireAuth?: boolean;
  authToken?: string | null;
};

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export const getBackendBaseUrl = () =>
  getConfiguredBackendOrigin();

export const getAuthToken = async () => {
  const cookieStore = await cookies();
  return cookieStore.get('token')?.value ?? null;
};

const parseJson = async (response: Response): Promise<JsonValue | null> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export async function fetchBackend(
  path: string,
  init: RequestInit = {},
  options: ProxyOptions = {}
) {
  const { requireAuth = true, authToken } = options;
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;

  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (requireAuth) {
    const token = authToken || await getAuthToken();

    if (!token) {
      return {
        ok: false,
        status: 401,
        data: {
          success: false,
          message: 'Authentication required',
          data: null,
        },
      };
    }

    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  const data = await parseJson(response);

  return {
    ok: response.ok,
    status: response.status,
    data:
      data ??
      ({
        success: false,
        message: `Backend request failed with status ${response.status}`,
        data: null,
      } satisfies JsonValue),
  };
}

export function getRequestAuthToken(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  return null;
}

export async function proxyBackend(
  path: string,
  init: RequestInit = {},
  options: ProxyOptions = {}
) {
  try {
    const result = await fetchBackend(path, init, options);
    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend request failed';
    return NextResponse.json(
      {
        success: false,
        message,
        data: null,
      },
      { status: 500 }
    );
  }
}
