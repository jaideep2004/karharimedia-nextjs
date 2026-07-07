import 'server-only';

const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

type YoutubeVideosResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      thumbnails?: Record<string, { url?: string }>;
      publishedAt?: string;
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }>;
  error?: { message?: string };
};

export type YoutubeVideoMetadata = {
  videoId: string;
  title: string;
  thumbnail: string;
  publishedAt?: string;
  publicViews: number;
  publicLikes: number;
  publicComments: number;
};

export class YoutubeDataApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'YoutubeDataApiError';
    this.statusCode = statusCode;
  }
}

export async function fetchYoutubeVideosMetadata(accessToken: string, videoIds: string[]) {
  const uniqueIds = [...new Set(videoIds.filter(Boolean))].slice(0, 50);
  if (uniqueIds.length === 0) return new Map<string, YoutubeVideoMetadata>();

  const url = new URL(YOUTUBE_VIDEOS_URL);
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('id', uniqueIds.join(','));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as YoutubeVideosResponse;
  if (!response.ok) {
    throw new YoutubeDataApiError(payload.error?.message || 'YouTube Data API request failed', response.status);
  }

  return new Map(
    (payload.items || [])
      .filter((item) => item.id)
      .map((item) => [
        item.id!,
        {
          videoId: item.id!,
          title: item.snippet?.title || item.id!,
          thumbnail:
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url ||
            '',
          publishedAt: item.snippet?.publishedAt,
          publicViews: toNumber(item.statistics?.viewCount),
          publicLikes: toNumber(item.statistics?.likeCount),
          publicComments: toNumber(item.statistics?.commentCount),
        },
      ])
  );
}

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
