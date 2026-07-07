import { fetchBackend, getRequestAuthToken } from '@/app/api/_lib/backend';

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  const result = await fetchBackend(
    `/api/notifications${search}`,
    {},
    { authToken: getRequestAuthToken(request) }
  );

  if (result.status === 401 || result.status === 404) {
    return Response.json({
      success: true,
      data: {
        notifications: [],
        unreadCount: 0,
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      },
    });
  }

  return Response.json(result.data, { status: result.status });
}

export const dynamic = 'force-dynamic';
