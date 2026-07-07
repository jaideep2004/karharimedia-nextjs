import Cookies from 'js-cookie';
import { getConfiguredApiBaseUrl } from '@/lib/urlConfig';

export type AcrCloudState = 'not_configured' | 'pending' | 'ready' | 'no_results' | 'error';

export interface AcrCloudStatusLike {
  fileId?: string;
  state?: AcrCloudState;
  scanState?: AcrCloudState;
  aiDetection?: Array<{
    start?: number;
    end?: number;
    prediction?: string;
    likelySource?: string;
    likely_source?: string;
    aiProbability?: number;
    ai_probability?: number;
    duration?: number;
    stem?: string;
    sourceProbabilities?: Array<{ source?: string; probability?: number }>;
    source_probabilities?: Array<{ source?: string; probability?: number }>;
  }>;
  fingerprintMatches?: Array<{
    title?: string;
    artist?: string;
    album?: string;
    isrc?: string;
    upc?: string;
    acrid?: string;
    score?: number;
    raw?: unknown;
  }>;
  lastError?: string;
  checkedAt?: string;
  rawResult?: unknown;
}

export const acrCloudProviderLabelMap: Record<string, string> = {
  spotify: 'Spotify',
  deezer: 'Deezer',
  youtube: 'YouTube',
  musicbrainz: 'MusicBrainz',
  lyricfind: 'LyricFind',
};

export function stringifyAcrCloudRawResult(acrCloud?: AcrCloudStatusLike | null): string {
  if (!acrCloud?.rawResult) return '';
  try {
    return JSON.stringify(acrCloud.rawResult, null, 2);
  } catch {
    return String(acrCloud.rawResult);
  }
}

export function getAcrCloudRawMatchResult(raw: unknown): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, any>;
  const result = record.result;
  return result && typeof result === 'object' ? result : record;
}

export function getAcrCloudProviderMetadata(raw: unknown) {
  const result = getAcrCloudRawMatchResult(raw);
  const externalMetadata = result.external_metadata;
  if (!externalMetadata || typeof externalMetadata !== 'object') return [];

  return Object.entries(externalMetadata as Record<string, any>)
    .map(([provider, value]) => {
      if (!value || typeof value !== 'object') return null;
      const record = value as Record<string, any>;
      const trackId = record.track?.id || record.track_id || record.id || record.vid || record.lfid;
      const albumId = record.album?.id;
      const artistIds = Array.isArray(record.artists)
        ? record.artists.map((artist: any) => artist?.id).filter(Boolean)
        : [];

      return {
        provider,
        label: acrCloudProviderLabelMap[provider] || provider,
        trackId,
        albumId,
        artistIds,
        isYoutube: provider === 'youtube',
      };
    })
    .filter(Boolean) as Array<{
      provider: string;
      label: string;
      trackId?: string;
      albumId?: string;
      artistIds: string[];
      isYoutube: boolean;
    }>;
}

export function getAcrCloudRightsClaims(raw: unknown) {
  const result = getAcrCloudRawMatchResult(raw);
  return Array.isArray(result.rights_claim) ? result.rights_claim : [];
}

const getApiBase = () => {
  return getConfiguredApiBaseUrl().replace(/\/+$/, '').replace(/\/api$/, '') + '/api';
};

export const getAcrCloudState = (acrCloud?: AcrCloudStatusLike | null): AcrCloudState | undefined =>
  acrCloud?.scanState || acrCloud?.state;

export const getAcrCloudLabel = (acrCloud?: AcrCloudStatusLike | null): string => {
  switch (getAcrCloudState(acrCloud)) {
    case 'pending':
      return 'ACR testing';
    case 'ready':
      return 'ACR result ready';
    case 'no_results':
      return 'ACR no match';
    case 'error':
      return 'ACR error';
    case 'not_configured':
      return 'ACR off';
    default:
      return 'ACR queued';
  }
};

export const getAcrCloudColor = (acrCloud?: AcrCloudStatusLike | null) => {
  switch (getAcrCloudState(acrCloud)) {
    case 'no_results':
      return 'success';
    case 'ready':
      return 'info';
    case 'pending':
      return 'warning';
    case 'error':
      return 'error';
    case 'not_configured':
      return 'default';
    default:
      return 'info';
  }
};

function formatProbability(value?: number): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${value.toFixed(1)}%`;
}

export const getAcrCloudSummary = (acrCloud?: AcrCloudStatusLike | null): string | null => {
  if (!acrCloud) return null;

  if (acrCloud.lastError) {
    return acrCloud.lastError;
  }

  const firstMatch = Array.isArray(acrCloud.fingerprintMatches) ? acrCloud.fingerprintMatches[0] : undefined;
  if (firstMatch?.title) {
    return firstMatch.artist ? `${firstMatch.title} - ${firstMatch.artist}` : firstMatch.title;
  }

  const firstAiDetection = Array.isArray(acrCloud.aiDetection) ? acrCloud.aiDetection[0] : undefined;
  if (firstAiDetection) {
    const source = firstAiDetection.likelySource || firstAiDetection.likely_source || firstAiDetection.prediction || 'Unknown';
    const probability = formatProbability(firstAiDetection.aiProbability ?? firstAiDetection.ai_probability);
    return probability ? `AI ${source} ${probability}` : `AI ${source}`;
  }

  switch (getAcrCloudState(acrCloud)) {
    case 'ready':
      return 'Recognition result available';
    case 'no_results':
      return 'No fingerprint match found';
    case 'pending':
      return 'Waiting for ACRCloud result';
    case 'not_configured':
      return 'ACRCloud scanning disabled';
    default:
      return null;
  }
};

export async function fetchAcrCloudScanResult(fileId: string): Promise<AcrCloudStatusLike> {
  const token = Cookies.get('token');
  const response = await fetch(`${getApiBase()}/audio/acr/scan/${fileId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !payload?.data) {
    throw new Error(payload?.message || payload?.error || 'Failed to refresh ACRCloud status');
  }

  return payload.data as AcrCloudStatusLike;
}
