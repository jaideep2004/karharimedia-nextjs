export type DspDeliveryState =
  | 'queued'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'needs_attention'
  | 'cancelled';

export type DspCapability =
  | 'audio_delivery'
  | 'video_delivery'
  | 'rights_management'
  | 'fingerprinting'
  | 'reporting'
  | 'takedown';

export type DspDeliveryOperation = 'deliver' | 'update' | 'takedown';
export type DspIntegrationMode = 'shell' | 'sandbox' | 'live';
export type DspReadinessState =
  | 'shell_ready'
  | 'missing_contract'
  | 'missing_credentials'
  | 'sandbox_ready'
  | 'live_ready'
  | 'paused';
export type DspDocsStatus = 'official_public' | 'partner_only' | 'no_public_docs' | 'unknown';
export type DspPayloadStandard = 'ddex_ern' | 'platform_api' | 'manual_partner_feed' | 'rights_feed' | 'unknown';

export interface DspTrackPayload {
  trackId: string;
  title: string;
  artistName: string;
  version?: string;
  versionNumber?: number;
  isrc?: string;
  upc?: string;
  genre?: string;
  language?: string;
  explicit?: boolean;
  releaseDate?: string;
  audioFile: string;
  artwork: string;
  contributors?: Array<{ name: string; role: string }>;
  territories?: string[];
  contentRating?: 'explicit' | 'clean' | 'not_applicable';
  ddexProfile?: 'ERN-3' | 'ERN-4';
  metadata: Record<string, unknown>;
}

export interface DspReleasePayload {
  releaseId: string;
  releaseTitle: string;
  upc?: string;
  primaryArtist?: string;
  label?: string;
  genre?: string;
  language?: string;
  releaseDate?: string;
  stores: string[];
  tracks: DspTrackPayload[];
  territories?: string[];
  assetChecks?: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
}

export type DspDeliveryPayload = DspTrackPayload | DspReleasePayload;

export interface DspConnectorContext {
  providerKey: string;
  credentials: Record<string, unknown>;
  region?: string;
  config?: Record<string, unknown>;
  operation?: DspDeliveryOperation;
  jobId?: string;
  jobMetadata?: Record<string, unknown>;
}

export interface DspDeliveryResult {
  externalId?: string;
  state: DspDeliveryState;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface MetadataRuleResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalized: DspTrackPayload;
}

export interface DspProviderRequirement {
  key: string;
  displayName: string;
  docsStatus: DspDocsStatus;
  docsUrl?: string;
  payloadStandard: DspPayloadStandard;
  requiredCredentialKeys: string[];
  requiredConfigKeys: string[];
  readinessChecks: string[];
  notes?: string;
}

export interface DspReadinessReport {
  state: DspReadinessState;
  missing: string[];
  warnings: string[];
  canDispatch: boolean;
}

export interface DspConnector {
  key: string;
  displayName: string;
  capabilities: DspCapability[];
  validateCredentials(credentials: Record<string, unknown>): Promise<{ valid: boolean; error?: string }>;
  validateTrack(payload: DspDeliveryPayload): Promise<{ valid: boolean; errors: string[] }>;
  deliver(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult>;
  update?(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult>;
  takedown?(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult>;
  getDeliveryStatus?(externalId: string, context: DspConnectorContext): Promise<DspDeliveryResult>;
  validateWebhookSignature?(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    secret: string
  ): boolean;
}
