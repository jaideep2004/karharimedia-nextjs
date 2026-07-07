export type AcrCloudDataType = 'audio' | 'fingerprint' | 'audio_url' | 'platforms';

export type AcrCloudScanState = 'not_configured' | 'pending' | 'ready' | 'no_results' | 'error';

export interface AcrCloudSourceProbability {
  source: string;
  probability: number;
}

export interface AcrCloudAiDetection {
  start: number;
  end: number;
  prediction: 'ai_generated' | 'human' | string;
  likelySource: string;
  aiProbability: number;
  duration: number;
  stem?: string;
  sourceProbabilities: AcrCloudSourceProbability[];
  segments?: Array<{
    start: number;
    end: number;
    prediction: string;
    likelySource: string;
    aiProbability: number;
  }>;
}

export interface AcrCloudFingerprintMatch {
  score?: number;
  title?: string;
  artist?: string;
  album?: string;
  isrc?: string;
  upc?: string;
  acrid?: string;
  raw?: unknown;
}

export interface AcrCloudScanSummary {
  fileId?: string;
  state: AcrCloudScanState;
  aiDetection: AcrCloudAiDetection[];
  fingerprintMatches: AcrCloudFingerprintMatch[];
  rawResult?: unknown;
}

export interface AcrCloudIdentifyResult {
  statusCode?: number;
  statusMessage?: string;
  raw: unknown;
  fingerprintMatches: AcrCloudFingerprintMatch[];
}
