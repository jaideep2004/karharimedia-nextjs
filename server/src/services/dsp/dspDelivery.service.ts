import crypto from 'crypto';
import mongoose from 'mongoose';
import DspProvider from '../../models/dspProvider.model';
import DeliveryJob, { IDeliveryJob } from '../../models/deliveryJob.model';

const syncProgress = new Map<string, { total: number; processed: number; errors: number; current: string; done: boolean; startTime: number }>();
export function getSyncProgress(id: string) { return syncProgress.get(id) || null; }
export function clearSyncProgress(id: string) { syncProgress.delete(id); }
import DspWebhookEvent from '../../models/dspWebhookEvent.model';
import RightsClaim from '../../models/rightsClaim.model';
import FingerprintMatch from '../../models/fingerprintMatch.model';
import {
  DspConnectorContext,
  DspDeliveryOperation,
  DspDeliveryPayload,
  DspDeliveryResult,
  DspDeliveryState,
  DspIntegrationMode,
  DspReleasePayload,
  DspTrackPayload,
} from '../../types/dsp';
import { dspRegistry } from './dspRegistry';
import { applyMetadataRules } from './rules/metadataRuleEngine';
import { releaseVersionService } from './releaseVersion.service';
import { evaluateDspReadiness, getDspRequirement } from './dspProviderRequirements';
import { findTrackById } from '../../repositories/track.repository';
import {
  decryptCredentialMap,
  encryptCredentialMap,
  getConfiguredCredentialKeys,
  isPlainCredentialMap,
} from './dspCredentialVault';
import { listBromaOutlets, syncBromaOutlets } from './bromaOutlet.service';
import {
  createBromaStatisticsReport,
  deleteBromaStatisticsReport,
  listBromaStatisticsReports,
  refreshBromaStatisticsReport,
} from './bromaStatistics.service';
import { BromaClient } from './connectors/bromaClient';
import {
  BROMA_DELIVERED_STATUSES,
  BROMA_REJECTED_STATUSES,
  BROMA_MODERATION_STATUSES,
  BROMA_DSP_PROCESSING_STATUSES,
} from '../../config/constants';

const BASE_RETRY_DELAY_MS = 15_000;
const WORKER_LOCK_MS = 15 * 60_000;
const DEFAULT_WORKER_BATCH_SIZE = 25;
const SOCIAL_PROVIDERS = new Set(['youtube', 'facebook']);
const TERMINAL_JOB_RETENTION_DAYS = 7;
const STUCK_PROCESSING_RETENTION_DAYS = 7;
const TERMINAL_STATES: DspDeliveryState[] = ['delivered', 'failed', 'cancelled', 'needs_attention'];
const TERMINAL_STATES_SET = new Set(TERMINAL_STATES);
const MAX_ATTEMPTS = 20;
const MAX_EVENTS = 100;
const CLUSTER_STORAGE_LIMIT_MB = 512;
const AUTO_CLEANUP_THRESHOLD_PCT = 0.7;
const SENSITIVE_CONFIG_KEYS = new Set(['webhookSecret']);
const ALLOWED_WEBHOOK_STATES: DspDeliveryState[] = [
  'queued',
  'processing',
  'delivered',
  'failed',
  'needs_attention',
  'cancelled',
];

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown delivery error';

const getProviderErrorResponseBody = (error: unknown): unknown =>
  error && typeof error === 'object' && 'responseBody' in error
    ? (error as { responseBody?: unknown }).responseBody
    : undefined;

const hasOwn = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

const getHeadersRecord = (headers: Record<string, unknown>): Record<string, string | string[] | undefined> => {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) out[key.toLowerCase()] = value.map(String);
    else if (value === undefined || value === null) out[key.toLowerCase()] = undefined;
    else out[key.toLowerCase()] = String(value);
  }
  return out;
};

const toPlainObject = (value: any): Record<string, any> =>
  typeof value?.toObject === 'function' ? value.toObject() : { ...value };

const sanitizeConfig = (config: Record<string, unknown> = {}) => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SENSITIVE_CONFIG_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
};

const normalizeConfigAndCredentials = (
  config: Record<string, unknown> = {},
  credentials: Record<string, unknown> = {}
) => {
  const nextConfig = { ...config };
  const nextCredentials = { ...credentials };
  for (const key of SENSITIVE_CONFIG_KEYS) {
    if (nextConfig[key] !== undefined && nextConfig[key] !== null && nextConfig[key] !== '') {
      nextCredentials[key] = nextConfig[key];
      delete nextConfig[key];
    }
  }
  return { config: nextConfig, credentials: nextCredentials };
};

const hashPayload = (payload: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const asDate = (value: unknown) => {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

class DspDeliveryService {
  private buildProviderView(provider: any) {
    const plain = toPlainObject(provider);
    const decryptedCredentials = decryptCredentialMap(plain.credentials || {});
    const requirement = getDspRequirement({
      key: plain.key,
      displayName: plain.displayName,
      capabilities: plain.capabilities,
    });
    const readiness = evaluateDspReadiness({
      key: plain.key,
      displayName: plain.displayName,
      capabilities: plain.capabilities,
      enabled: plain.enabled,
      maintenanceMode: plain.maintenanceMode,
      integrationMode: plain.integrationMode,
      config: plain.config,
      credentials: decryptedCredentials,
    });
    const configuredCredentialKeys = getConfiguredCredentialKeys(plain.credentials || {});
    const missingCredentialKeys = requirement.requiredCredentialKeys.filter(
      (key) => !configuredCredentialKeys.includes(key)
    );

    delete plain.credentials;
    delete plain.credentialEnvelopeVersion;
    return {
      ...plain,
      config: sanitizeConfig(plain.config || {}),
      integrationMode: plain.integrationMode || plain.config?.integrationMode || 'shell',
      readiness: readiness.state,
      readinessReport: readiness,
      requirement,
      configuredCredentialKeys,
      missingCredentialKeys,
    };
  }

  async bootstrapPhase1Providers() {
    const defaults = [
      { key: 'mock_dsp', displayName: 'Mock DSP', enabled: true, integrationMode: 'sandbox' as DspIntegrationMode },
      { key: 'broma', displayName: 'Broma', enabled: false, integrationMode: 'shell' as DspIntegrationMode },
    ];

    const created = [];
    for (const provider of defaults) {
      const result = await this.registerProvider({
        key: provider.key,
        displayName: provider.displayName,
        enabled: provider.enabled ?? false,
        integrationMode: provider.integrationMode || 'shell',
        credentials: provider.key === 'mock_dsp' ? { webhookSecret: 'mock-dsp-webhook-secret' } : {},
        config: { integrationMode: provider.integrationMode || 'shell', ddexProfile: 'ERN-4' },
      });
      created.push(result);
    }
    return created;
  }

  private async buildTrackPayload(trackDoc: any): Promise<DspTrackPayload> {
    const legacy = trackDoc.legacyMetadata || {};
    const artistName = trackDoc.artistName?.trim()
      || trackDoc.artist?.trim()
      || legacy.artist?.trim()
      || legacy.artistName?.trim()
      || '';
    const releaseDate = trackDoc.releaseDate
      || trackDoc.originalReleaseDate
      || legacy.releaseDate
      || legacy.originalReleaseDate
      || null;

    // Fallback artwork from parent release if not set on track
    let artwork = trackDoc.artwork || trackDoc.artworkUrl || '';
    const releaseId = trackDoc.releaseId || trackDoc.release_id || trackDoc.albumId || trackDoc.album_id;
    if (!artwork && releaseId) {
      try {
        const oid = typeof releaseId === 'string' ? new mongoose.Types.ObjectId(releaseId) : releaseId;
        const release = await mongoose.connection.collection('releases').findOne(
          { _id: oid },
          { projection: { artwork: 1, artworkUrl: 1 } }
        );
        artwork = release?.artwork || release?.artworkUrl || '';
      } catch { /* non-fatal */ }
    }

    return {
      trackId: trackDoc._id?.toString() || '',
      title: trackDoc.title || '',
      artistName,
      isrc: trackDoc.isrc,
      upc: trackDoc.upc,
      genre: trackDoc.genre,
      language: trackDoc.language,
      explicit: trackDoc.explicit,
      releaseDate: releaseDate ? new Date(releaseDate).toISOString() : undefined,
      audioFile: trackDoc.audioFile || trackDoc.audioUrl || trackDoc.fileUrl,
      artwork,
      contributors: [
        {
          name: artistName,
          role: 'main_artist',
        },
      ],
      territories: ['WORLD'],
      contentRating: trackDoc.explicit ? 'explicit' : 'clean',
      ddexProfile: 'ERN-4',
      metadata: {
        source: 'track.model',
        trackStatus: trackDoc.status,
      },
    };
  }

  private buildReleasePayload(snapshot: Record<string, any>): DspReleasePayload {
    const payload = snapshot.payload || {};
    const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
    return {
      releaseId: String(payload.releaseId || snapshot.releaseId || ''),
      releaseTitle: String(payload.releaseTitle || 'Untitled release'),
      upc: payload.upc,
      primaryArtist: payload.primaryArtist,
      label: payload.label,
      genre: payload.genre,
      language: payload.language,
      releaseDate: payload.releaseDate,
      stores: Array.isArray(payload.stores) ? payload.stores : [],
      territories: Array.isArray(payload.territories) ? payload.territories : ['WORLD'],
      assetChecks: Array.isArray(payload.assetChecks) ? payload.assetChecks : [],
      tracks: tracks.map((track: Record<string, any>, index: number) => ({
        trackId: String(track.id || `${payload.releaseId || snapshot.releaseId || 'release'}:${index + 1}`),
        title: track.title,
        artistName: track.artistName || payload.primaryArtist,
        version: track.version,
        isrc: track.isrc,
        upc: track.upc || payload.upc,
        explicit: track.explicit,
        audioFile: track.audioFile,
        artwork: track.artwork,
        contributors: Array.isArray(track.contributors) ? track.contributors : [],
        releaseDate: payload.releaseDate,
        territories: Array.isArray(payload.territories) ? payload.territories : ['WORLD'],
        contentRating: track.explicit ? 'explicit' : 'clean',
        ddexProfile: 'ERN-4',
        metadata: {
          ...(track.metadata || {}),
          source: 'releaseDeliverySnapshot',
          releaseId: String(payload.releaseId || snapshot.releaseId || ''),
          contributors: track.contributors || [],
          composers: track.composers || [],
          lyricists: track.lyricists || [],
          publishers: track.publishers || [],
        },
      })),
      metadata: {
        source: 'releaseDeliverySnapshot',
        payloadHash: snapshot.payloadHash,
        snapshotId: snapshot._id?.toString?.(),
        ...(payload.metadata || {}),
      },
    };
  }

  private withBromaLegacyDateFallbacks(snapshot: Record<string, any>, release: Record<string, any> | null) {
    if (!release) return snapshot;

    const payload = snapshot.payload || {};
    const payloadTracks = Array.isArray(payload.tracks) ? payload.tracks : [];
    const releaseTracks = Array.isArray(release.tracks) ? release.tracks : [];
    const dateFallback = release.originalReleaseDate || release.original_release_date || release.createdDate || release.created_date;

    return {
      ...snapshot,
      payload: {
        ...payload,
        metadata: {
          ...(payload.metadata || {}),
          originalReleaseDate: payload.metadata?.originalReleaseDate || payload.metadata?.original_release_date || dateFallback,
          createdDate: payload.metadata?.createdDate || payload.metadata?.created_date || release.createdDate || release.created_date,
        },
        tracks: payloadTracks.map((track: Record<string, any>, index: number) => {
          const releaseTrack = releaseTracks.find((candidate: Record<string, any>) => {
            const candidateId = String(candidate._id || candidate.id || '');
            return (
              candidateId === String(track.id || track.trackId || '') ||
              (candidate.isrc && candidate.isrc === track.isrc) ||
              (candidate.title && candidate.title === track.title)
            );
          }) || releaseTracks[index] || {};

          return {
            ...track,
            releaseDate: track.releaseDate || releaseTrack.releaseDate || release.releaseDate,
            metadata: {
              ...(track.metadata || {}),
              originalReleaseDate:
                track.metadata?.originalReleaseDate ||
                track.metadata?.original_release_date ||
                releaseTrack.originalReleaseDate ||
                releaseTrack.original_release_date ||
                dateFallback,
              createdDate:
                track.metadata?.createdDate ||
                track.metadata?.created_date ||
                releaseTrack.createdDate ||
                releaseTrack.created_date,
            },
          };
        }),
      },
    };
  }

  private generateIdempotencyKey(
    trackId: string,
    providerKey: string,
    operation: DspDeliveryOperation,
    versionNumber: number
  ): string {
    return crypto.createHash('sha256').update(`${trackId}:${providerKey}:${operation}:${versionNumber}`).digest('hex');
  }

  private async getProviderWithDecryptedCredentials(providerKey: string) {
    const provider = await DspProvider.findOne({ key: providerKey }).select('+credentials +credentialEnvelopeVersion');
    if (!provider) return null;

    const plain = toPlainObject(provider);
    const credentials = decryptCredentialMap(plain.credentials || {});

    if (isPlainCredentialMap(plain.credentials || {})) {
      provider.credentials = encryptCredentialMap(credentials);
      provider.credentialEnvelopeVersion = 'dsp-v1';
      await provider.save();
    }

    return { provider, credentials };
  }

  private async refreshOAuthToken(providerKey: string, refreshToken: string): Promise<Record<string, any> | null> {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.warn(`[tokenRefresh] ${providerKey}: YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET not configured`);
      return null;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[tokenRefresh] ${providerKey} Google token refresh failed (${response.status}): ${body}`);
      return null;
    }

    return response.json() as Promise<Record<string, any>>;
  }

  async registerProvider(input: {
    key: string;
    displayName: string;
    capabilities?: string[];
    region?: string;
    enabled?: boolean;
    maintenanceMode?: boolean;
    integrationMode?: DspIntegrationMode;
    credentials?: Record<string, unknown>;
    config?: Record<string, unknown>;
  }) {
    const key = input.key.toLowerCase().trim();
    const connector = dspRegistry.get(key);
    const existing = await DspProvider.findOne({ key }).select('+credentials +credentialEnvelopeVersion');
    const existingPlain = existing ? toPlainObject(existing) : null;
    const existingCredentials = existingPlain ? decryptCredentialMap(existingPlain.credentials || {}) : {};
    const rawConfig = { ...(input.config || {}) };
    const rawCredentials = hasOwn(input as Record<string, unknown>, 'credentials')
      ? { ...(input.credentials || {}) }
      : existingCredentials;
    const normalized = normalizeConfigAndCredentials(rawConfig, rawCredentials);
    const enabled = input.enabled ?? existing?.enabled ?? true;
    const integrationMode =
      input.integrationMode ||
      (normalized.config.integrationMode as DspIntegrationMode | undefined) ||
      existing?.integrationMode ||
      'shell';
    const config = { ...(existingPlain?.config || {}), ...normalized.config, integrationMode };
    const credentials = normalized.credentials;

    if (enabled && integrationMode !== 'shell') {
      const validation = await connector.validateCredentials(credentials);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid provider credentials');
      }
    }

    const readiness = evaluateDspReadiness({
      key,
      displayName: input.displayName || existing?.displayName || connector.displayName,
      capabilities: (input.capabilities || existing?.capabilities || connector.capabilities) as any,
      enabled,
      maintenanceMode: input.maintenanceMode ?? existing?.maintenanceMode ?? false,
      integrationMode,
      config,
      credentials,
    });

    const provider = await DspProvider.findOneAndUpdate(
      { key },
      {
        key,
        displayName: input.displayName || existing?.displayName || connector.displayName,
        capabilities: input.capabilities || existing?.capabilities || connector.capabilities,
        region: input.region ?? existing?.region,
        enabled,
        maintenanceMode: input.maintenanceMode ?? existing?.maintenanceMode ?? false,
        integrationMode,
        readiness: readiness.state,
        credentials: encryptCredentialMap(credentials),
        credentialEnvelopeVersion: 'dsp-v1',
        config,
      },
      { upsert: true, new: true }
    ).select('+credentials +credentialEnvelopeVersion');

    return this.buildProviderView(provider);
  }

  async listProviders() {
    const dbProviders = await DspProvider.find().sort({ displayName: 1 }).select('+credentials +credentialEnvelopeVersion');
    if (dbProviders.length > 0) {
      const supportedProviders = dbProviders
        .filter((provider) => {
          try {
            dspRegistry.get(provider.key);
            return true;
          } catch {
            return false;
          }
        })
        .map((provider) => this.buildProviderView(provider));
      if (supportedProviders.length > 0) return supportedProviders;
    }

    return dspRegistry.list().map((connector) => ({
      key: connector.key,
      displayName: connector.displayName,
      capabilities: connector.capabilities,
      enabled: false,
      maintenanceMode: false,
      integrationMode: 'shell',
      readiness: 'paused',
      readinessReport: {
        state: 'paused',
        missing: [],
        warnings: ['Provider not bootstrapped yet'],
        canDispatch: false,
      },
      requirement: getDspRequirement(connector),
      configuredCredentialKeys: [],
      missingCredentialKeys: getDspRequirement(connector).requiredCredentialKeys,
      region: null,
      config: {},
    }));
  }

  async syncBromaOutlets() {
    const providerRecord = await this.getProviderWithDecryptedCredentials('broma');
    if (!providerRecord || !providerRecord.provider.enabled) {
      throw new Error('Broma provider is not active');
    }

    return syncBromaOutlets({
      credentials: providerRecord.credentials,
      config: providerRecord.provider.config || {},
    });
  }

  async listBromaOutlets() {
    return listBromaOutlets();
  }

  async createBromaStatisticsReport(input: {
    payload?: Record<string, unknown>;
    reportKind?: 'detail' | 'summary';
    requestedBy?: string;
  }) {
    const providerRecord = await this.getProviderWithDecryptedCredentials('broma');
    if (!providerRecord || !providerRecord.provider.enabled) {
      throw new Error('Broma provider is not active');
    }

    return createBromaStatisticsReport({
      credentials: providerRecord.credentials,
      config: providerRecord.provider.config || {},
      payload: input.payload || {},
      reportKind: input.reportKind || 'summary',
      requestedBy: input.requestedBy,
    });
  }

  async refreshBromaStatisticsReport(reportId: string) {
    const providerRecord = await this.getProviderWithDecryptedCredentials('broma');
    if (!providerRecord || !providerRecord.provider.enabled) {
      throw new Error('Broma provider is not active');
    }

    return refreshBromaStatisticsReport({
      credentials: providerRecord.credentials,
      config: providerRecord.provider.config || {},
      reportId,
    });
  }

  async deleteBromaStatisticsReport(reportId: string) {
    const providerRecord = await this.getProviderWithDecryptedCredentials('broma');
    if (!providerRecord || !providerRecord.provider.enabled) {
      throw new Error('Broma provider is not active');
    }

    return deleteBromaStatisticsReport({
      credentials: providerRecord.credentials,
      config: providerRecord.provider.config || {},
      reportId,
    });
  }

  async listBromaStatisticsReports(limit?: number) {
    return listBromaStatisticsReports(limit);
  }

  async deleteBromaDraft(input: { draftType: 'composition' | 'release'; draftId: string | number }) {
    const providerRecord = await this.getProviderWithDecryptedCredentials('broma');
    if (!providerRecord || !providerRecord.provider.enabled) {
      throw new Error('Broma provider is not active');
    }

    const client = new BromaClient({
      credentials: providerRecord.credentials,
      config: providerRecord.provider.config || {},
    });
    return client.deleteDraft(input.draftType, input.draftId);
  }

  async dispatchDelivery(trackId: string, providerKey: string, operation: DspDeliveryOperation, createdBy?: string) {
    const normalizedProviderKey = providerKey.toLowerCase().trim();
    const logSocial = (...args: any[]) => { if (SOCIAL_PROVIDERS.has(normalizedProviderKey)) console.log(...args); };
    logSocial(`[dispatchDelivery] provider=${normalizedProviderKey} trackId=${trackId} op=${operation}`);
    const providerRecord = await this.getProviderWithDecryptedCredentials(normalizedProviderKey);
    if (!providerRecord || !providerRecord.provider.enabled) throw new Error(`Provider ${normalizedProviderKey} is not active`);
    if (providerRecord.provider.maintenanceMode) throw new Error(`Provider ${normalizedProviderKey} is in maintenance mode`);

    const track = await findTrackById(trackId);
    if (!track) {
      console.error(`[dispatchDelivery] Track not found: ${trackId}`);
      throw new Error('Track not found');
    }
    logSocial(`[dispatchDelivery] Track found: ${track.title}`);

    const payload = await this.buildTrackPayload(track);
    logSocial(`[dispatchDelivery] Payload: artist="${payload.artistName}" isrc="${payload.isrc}"`);
    const connector = dspRegistry.get(normalizedProviderKey);
    const ruleResult = applyMetadataRules(normalizedProviderKey, payload);
    if (!ruleResult.valid) {
      throw new Error(`Metadata/DDEX validation failed: ${ruleResult.errors.join(', ')}`);
    }

    const version = await releaseVersionService.createVersion({
      trackId,
      providerKey: normalizedProviderKey,
      payload: ruleResult.normalized,
      createdBy,
    });
    logSocial(`[dispatchDelivery] v${version.versionNumber} queued`);

    const idempotencyKey = this.generateIdempotencyKey(trackId, normalizedProviderKey, operation, version.versionNumber);
    const existing = await DeliveryJob.findOne({ idempotencyKey });
    if (existing && ['queued', 'processing', 'delivered'].includes(existing.state)) {
      return existing;
    }

    const validation = await connector.validateTrack(ruleResult.normalized);
    if (!validation.valid) {
      throw new Error(`Connector validation failed: ${validation.errors.join(', ')}`);
    }

    const job = await DeliveryJob.create({
      targetType: 'track',
      trackId: track._id,
      providerKey: normalizedProviderKey,
      operation,
      state: 'queued',
      idempotencyKey,
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: new Date(),
      metadata: {
        deliverySnapshot: {
          title: ruleResult.normalized.title,
          artistName: ruleResult.normalized.artistName,
          isrc: ruleResult.normalized.isrc,
        },
        releaseVersion: {
          versionNumber: version.versionNumber,
          versionLabel: version.versionLabel,
          ddexProfile: version.ddexProfile,
        },
        metadataWarnings: ruleResult.warnings,
      },
      createdBy,
      events: [
        {
          state: 'queued',
          message: `Delivery job created with ${version.versionLabel}`,
          source: 'system',
        },
      ],
    });

    return job;
  }

  async dispatchAlbumDelivery(
    releaseId: string,
    trackIds: string[],
    providerKey: string,
    operation: DspDeliveryOperation,
    createdBy?: string,
    config?: Record<string, unknown>
  ) {
    const normalizedProviderKey = providerKey.toLowerCase().trim();
    if (SOCIAL_PROVIDERS.has(normalizedProviderKey)) {
      console.log(`[dispatchAlbumDelivery] release=${releaseId} tracks=${trackIds.length} provider=${normalizedProviderKey}`);
    }
    const providerRecord = await this.getProviderWithDecryptedCredentials(normalizedProviderKey);
    if (!providerRecord || !providerRecord.provider.enabled) throw new Error(`Provider ${normalizedProviderKey} is not active`);
    if (providerRecord.provider.maintenanceMode) throw new Error(`Provider ${normalizedProviderKey} is in maintenance mode`);

    if (trackIds.length === 0) throw new Error('No tracks provided for album delivery');

    const firstTrack = await findTrackById(trackIds[0]);
    if (!firstTrack) throw new Error('First track not found');

    const connector = dspRegistry.get(normalizedProviderKey);

    const idempotencyKey = this.generateIdempotencyKey(
      `album:${releaseId}`, normalizedProviderKey, operation, 1
    );
    const existing = await DeliveryJob.findOne({ idempotencyKey });
    if (existing && ['queued', 'processing', 'delivered'].includes(existing.state)) {
      return existing;
    }

    const validation = await connector.validateTrack({
      trackId: String(firstTrack._id),
      title: firstTrack.title,
      artistName: firstTrack.artistName,
      audioFile: firstTrack.audioFile,
      artwork: firstTrack.artwork,
      metadata: {},
    } as DspTrackPayload);
    if (!validation.valid) {
      throw new Error(`Connector validation failed: ${validation.errors.join(', ')}`);
    }

    const job = await DeliveryJob.create({
      targetType: 'track',
      trackId: firstTrack._id,
      providerKey: normalizedProviderKey,
      operation,
      state: 'queued',
      idempotencyKey,
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: new Date(),
      metadata: {
        config: {
          ...((config || {}) as Record<string, unknown>),
          albumMode: 'album',
          releaseId,
          trackIds,
        },
        deliverySnapshot: {
          title: firstTrack.title,
          artistName: firstTrack.artistName,
          isrc: firstTrack.isrc,
        },
      },
      createdBy,
      events: [
        {
          state: 'queued',
          message: 'Album delivery job created',
          source: 'system',
        },
      ],
    });

    return job;
  }

  private async loadJobPayload(job: IDeliveryJob): Promise<{ payload?: DspDeliveryPayload; errors: string[]; warnings: string[] }> {
    if (job.targetType === 'release') {
      if (!job.snapshotId) return { errors: ['Release delivery snapshot missing'], warnings: [] };
      const snapshot = await mongoose.connection
        .collection('releaseDeliverySnapshots')
        .findOne({ _id: job.snapshotId });
      if (!snapshot) return { errors: ['Release delivery snapshot not found'], warnings: [] };
      if (job.providerKey === 'broma' && job.releaseId) {
        const release = await mongoose.connection
          .collection('releases')
          .findOne(
            { _id: job.releaseId },
            {
              projection: {
                originalReleaseDate: 1,
                original_release_date: 1,
                createdDate: 1,
                created_date: 1,
                releaseDate: 1,
                tracks: 1,
              },
            }
          );
        return { payload: this.buildReleasePayload(this.withBromaLegacyDateFallbacks(snapshot, release)), errors: [], warnings: [] };
      }
      return { payload: this.buildReleasePayload(snapshot), errors: [], warnings: [] };
    }

    if (!job.trackId) return { errors: ['Track id missing'], warnings: [] };

    const meta = (job.metadata || {}) as Record<string, any>;
    if (meta?.config?.albumMode === 'album') {
      return await this.loadAlbumPayload(job);
    }

    const track = await findTrackById(job.trackId.toString());
    if (!track) return { errors: ['Track not found'], warnings: [] };
    const ruleResult = applyMetadataRules(job.providerKey, await this.buildTrackPayload(track));
    return {
      payload: ruleResult.normalized,
      errors: ruleResult.errors,
      warnings: ruleResult.warnings,
    };
  }

  private async loadAlbumPayload(job: IDeliveryJob): Promise<{ payload?: DspReleasePayload; errors: string[]; warnings: string[] }> {
    const meta = (job.metadata || {}) as Record<string, any>;
    const trackIds: string[] = meta.config?.trackIds || [];
    const releaseId = meta.config?.releaseId || (job.metadata as any)?.releaseId;

    if (!releaseId && trackIds.length === 0) {
      return { errors: ['Album delivery requires releaseId or trackIds'], warnings: [] };
    }

    const release = releaseId
      ? await mongoose.connection.collection('releases').findOne({ _id: new mongoose.Types.ObjectId(String(releaseId)) })
      : null;

    const tracks: any[] = [];
    for (const id of trackIds) {
      const track = await findTrackById(id);
      if (track) tracks.push(track);
    }

    if (tracks.length === 0) {
      return { errors: ['No tracks found for album delivery'], warnings: [] };
    }

    const firstTrack = tracks[0];
    const payload: DspReleasePayload = {
      releaseId: releaseId ? String(releaseId) : 'album',
      releaseTitle: meta.config?.title || release?.releaseTitle || release?.title || firstTrack.title || 'Album',
      primaryArtist: release?.primaryArtist || release?.artist || release?.artistName || firstTrack.artistName,
      upc: release?.upc,
      genre: release?.genre || firstTrack.genre,
      language: release?.language,
      releaseDate: release?.releaseDate,
      stores: Array.isArray(release?.stores) ? release.stores : [],
      tracks: tracks.map((track, index) => ({
        trackId: String(track._id),
        title: track.title,
        artistName: track.artistName,
        isrc: track.isrc,
        upc: track.upc || release?.upc,
        genre: track.genre,
        explicit: track.explicit,
        audioFile: track.audioFile,
        artwork: track.artwork || release?.artwork,
        releaseDate: track.releaseDate || release?.releaseDate,
        contributors: track.contributors || [],
        contentRating: track.explicit ? 'explicit' : 'clean',
        ddexProfile: 'ERN-4',
        metadata: {
          source: 'albumDelivery',
          releaseId: releaseId ? String(releaseId) : undefined,
        },
      })),
      territories: release?.territories || ['WORLD'],
      metadata: {
        artwork: release?.artwork || tracks[0]?.artwork,
        releaseType: release?.releaseType,
      },
    };

    return { payload, errors: [], warnings: [] };
  }

  private async markJobNeedsAttention(jobId: string, job: IDeliveryJob, message: string, metadata?: Record<string, unknown>) {
    await DeliveryJob.findByIdAndUpdate(jobId, {
      state: 'needs_attention',
      errorMessage: message,
      metadata: {
        ...job.metadata,
        ...(metadata || {}),
      },
      $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '' },
      $push: { events: { state: 'needs_attention', message, source: 'system' } },
    });
    await this.setJobExpiry(jobId, 'needs_attention');
    const updated = await DeliveryJob.findById(jobId);
    if (updated) {
      try {
        await this.updateReleaseLifecycle(job, 'needs_attention', { ...job.metadata, ...(metadata || {}) } as Record<string, any>, message);
      } catch { /* lifecycle update is best-effort */ }
    }
    return updated;
  }

  private async failJob(jobId: string, message: string) {
    await DeliveryJob.findByIdAndUpdate(jobId, {
      state: 'failed',
      errorMessage: message,
      deadLettered: true,
      $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '' },
      $push: { events: { state: 'failed', message, source: 'system' } },
    });
    await this.setJobExpiry(jobId, 'failed');
    return DeliveryJob.findById(jobId);
  }

  private async setJobExpiry(jobId: string, state: DspDeliveryState) {
    if (!TERMINAL_STATES_SET.has(state)) return;
    await DeliveryJob.findByIdAndUpdate(jobId, {
      $set: { expiresAt: new Date(Date.now() + TERMINAL_JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000) },
    });
  }

  private async getCollectionSizeMB(): Promise<number> {
    try {
      const stats = await DeliveryJob.aggregate([{ $collStats: { storageStats: {} } }]).exec();
      return Math.round(((stats[0]?.storageStats?.size || 0) / (1024 * 1024)) * 100) / 100;
    } catch {
      return 0;
    }
  }

  async cleanupOldDeliveryJobs(retentionDays = TERMINAL_JOB_RETENTION_DAYS, dryRun = false) {
    const collectionSizeMB = await this.getCollectionSizeMB();
    const thresholdMB = CLUSTER_STORAGE_LIMIT_MB * AUTO_CLEANUP_THRESHOLD_PCT;
    const overThreshold = collectionSizeMB > thresholdMB;
    let actualRetentionDays = retentionDays;
    let triggeredBySize = false;

    if (overThreshold && retentionDays > 3) {
      actualRetentionDays = 3;
      triggeredBySize = true;
    }

    const cutoff = new Date(Date.now() - actualRetentionDays * 24 * 60 * 60 * 1000);
    const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const terminalMatch = { state: { $in: TERMINAL_STATES }, createdAt: { $lt: cutoff } };
    const stuckMatch = { state: 'processing', createdAt: { $lt: stuckCutoff } };

    const terminalCount = await DeliveryJob.countDocuments(terminalMatch);
    const stuckCount = await DeliveryJob.countDocuments(stuckMatch);

    if (dryRun) {
      return {
        dryRun: true,
        terminalCount,
        stuckProcessingCount: stuckCount,
        retentionDays: actualRetentionDays,
        stuckRetentionDays: STUCK_PROCESSING_RETENTION_DAYS,
        collectionSizeMB,
        clusterLimitMB: CLUSTER_STORAGE_LIMIT_MB,
        overThreshold,
        triggeredBySize,
      };
    }

    const terminalResult = await DeliveryJob.deleteMany(terminalMatch);
    const stuckResult = await DeliveryJob.deleteMany(stuckMatch);
    return {
      terminalDeleted: terminalResult.deletedCount,
      stuckProcessingDeleted: stuckResult.deletedCount,
      retentionDays: actualRetentionDays,
      stuckRetentionDays: STUCK_PROCESSING_RETENTION_DAYS,
      collectionSizeMB,
      clusterLimitMB: CLUSTER_STORAGE_LIMIT_MB,
      overThreshold,
      triggeredBySize,
    };
  }

  private async updateReleaseLifecycle(job: IDeliveryJob, state: string, metadata: Record<string, any> = {}, errorMessage?: string) {
    if (job.targetType !== 'release' || !job.releaseId) return;

    let releaseStatus: string | null = null;
    const step = String(metadata.bromaStep || '');
    const moderationStatus = String(metadata.bromaModerationStatus || '').toLowerCase();
    const bromaRejected = BROMA_REJECTED_STATUSES.has(moderationStatus);
    const bromaModeration = BROMA_MODERATION_STATUSES.has(moderationStatus);
    const bromaDspProcessing = BROMA_DSP_PROCESSING_STATUSES.has(moderationStatus);

    if (bromaRejected) releaseStatus = 'rejected';
    else if (state === 'delivered') releaseStatus = 'live';
    else if (step === 'send_moderation') releaseStatus = 'broma_moderation';
    else if (step === 'poll_status') {
      if (BROMA_DELIVERED_STATUSES.has(moderationStatus)) {
        releaseStatus = 'live';
      } else if (bromaModeration) {
        releaseStatus = 'broma_moderation';
      } else if (bromaDspProcessing) {
        releaseStatus = 'dsp_processing';
      } else if (moderationStatus) {
        releaseStatus = 'broma_moderation';
      } else {
        releaseStatus = 'uploading_to_broma';
      }
    }
    else if (step === 'done') releaseStatus = 'live';
    else if (state === 'processing') releaseStatus = 'uploading_to_broma';
    else if (state === 'needs_attention') releaseStatus = 'failed';

    if (!releaseStatus) return;

    let releaseObjectId: mongoose.Types.ObjectId;
    if (typeof job.releaseId === 'string' && mongoose.Types.ObjectId.isValid(job.releaseId)) {
      releaseObjectId = new mongoose.Types.ObjectId(job.releaseId);
    } else if (job.releaseId instanceof mongoose.Types.ObjectId) {
      releaseObjectId = job.releaseId;
    } else {
      return;
    }

    const TERMINAL_STATUSES = new Set(['live', 'rejected', 'removed', 'takedown_requested']);
    const existingRelease = await mongoose.connection.collection('releases').findOne(
      { _id: releaseObjectId },
      { projection: { status: 1 } }
    );
    if (existingRelease && TERMINAL_STATUSES.has(existingRelease.status) && !TERMINAL_STATUSES.has(releaseStatus)) {
      return;
    }

    const releaseUpdate: Record<string, any> = {
      status: releaseStatus,
      updatedAt: new Date(),
      bromaDelivery: {
        releaseId: metadata.bromaReleaseId,
        recordingIds: metadata.bromaRecordingIds || {},
        step,
        moderationStatus: metadata.bromaModerationStatus,
        outletIds: metadata.bromaOutletIds || [],
        updatedAt: new Date(),
      },
    };
    if (bromaRejected) {
      releaseUpdate.rejectionReason = metadata.bromaRejectionReason || 'Rejected during moderation';
      releaseUpdate.rejectedAt = new Date();
    }
    if (releaseStatus === 'failed' && !bromaRejected) {
      releaseUpdate.rejectionReason = errorMessage || 'Delivery requires attention';
    }

    await mongoose.connection.collection('releases').updateOne(
      { _id: releaseObjectId },
      {
        $set: releaseUpdate,
      }
    );
  }

  async processJob(jobId: string): Promise<IDeliveryJob | null> {
    const job = await DeliveryJob.findById(jobId);
    if (!job) return null;
    if (job.deadLettered) return job;

    const providerRecord = await this.getProviderWithDecryptedCredentials(job.providerKey);
    if (!providerRecord || !providerRecord.provider.enabled || providerRecord.provider.maintenanceMode) {
      return this.markJobNeedsAttention(jobId, job, 'Provider inactive or in maintenance mode');
    }

    const { provider, credentials } = providerRecord;

    // Auto-refresh expired YouTube/Facebook OAuth tokens
    if (credentials.refreshToken) {
      const expiresAt = Number(credentials.tokenExpiresAt || 0);
      if (!expiresAt || Date.now() >= expiresAt) {
        const isSocial = SOCIAL_PROVIDERS.has(provider.key);
        if (isSocial) console.log(`[tokenRefresh] ${provider.key} token expired, refreshing...`);
        try {
          const newTokens = await this.refreshOAuthToken(provider.key, String(credentials.refreshToken));
          if (newTokens) {
            credentials.accessToken = newTokens.access_token;
            credentials.tokenExpiresAt = String(Date.now() + Number(newTokens.expires_in || 3600) * 1000);
            if (newTokens.refresh_token) credentials.refreshToken = newTokens.refresh_token;
            await DspProvider.updateOne(
              { key: provider.key },
              { $set: { credentials: encryptCredentialMap({ ...credentials }) } }
            );
            if (isSocial) console.log(`[tokenRefresh] ${provider.key} token refreshed`);
          }
        } catch (refreshError) {
          console.error(`[tokenRefresh] ${provider.key} token refresh failed:`, getErrorMessage(refreshError));
        }
      }
    }

    const readiness = evaluateDspReadiness({
      key: provider.key,
      displayName: provider.displayName,
      capabilities: provider.capabilities,
      enabled: provider.enabled,
      maintenanceMode: provider.maintenanceMode,
      integrationMode: provider.integrationMode,
      config: provider.config,
      credentials,
    });
    if (!readiness.canDispatch) {
      return this.markJobNeedsAttention(jobId, job, `Provider not ready: ${readiness.state}`, { readiness });
    }

    const payloadResult = await this.loadJobPayload(job);
    if (payloadResult.errors.length > 0 || !payloadResult.payload) {
      return this.failJob(jobId, `${job.targetType === 'release' ? 'Release package' : 'Metadata/DDEX'} validation failed: ${payloadResult.errors.join(', ')}`);
    }

    let connector;
    try {
      connector = dspRegistry.get(job.providerKey);
    } catch (error) {
      return this.markJobNeedsAttention(jobId, job, getErrorMessage(error));
    }
    const validation = await connector.validateTrack(payloadResult.payload);
    if (!validation.valid) {
      return this.failJob(jobId, `Connector validation failed: ${validation.errors.join(', ')}`);
    }

    await DeliveryJob.findByIdAndUpdate(jobId, {
      state: 'processing',
      lastAttemptAt: new Date(),
      $push: { events: { state: 'processing', message: 'Connector dispatch started', source: 'system' } },
    });
    if (job.targetType === 'release' && job.releaseId && job.providerKey === 'broma') {
      await mongoose.connection.collection('releases').updateOne(
        { _id: job.releaseId },
        { $set: { status: 'uploading_to_broma', updatedAt: new Date() } }
      );
    }

    try {
      let result;
      const context: DspConnectorContext = {
        providerKey: provider.key,
        credentials,
        region: provider.region,
        config: { ...provider.config },
        operation: job.operation,
        jobId,
        jobMetadata: job.metadata || {},
      };
      if (provider.key === 'broma' && context.config?.distributeToAllOutlets && context.jobMetadata?.expandToAllOutlets) {
        (context.config as Record<string, unknown>).expandToAllOutlets = true;
      }
      if (job.operation === 'deliver') {
        const isSocial = SOCIAL_PROVIDERS.has(job.providerKey);
        if (isSocial) console.log(`[processJob] Calling ${job.providerKey} deliver job=${jobId}`);
        const t0 = Date.now();
        result = await connector.deliver(payloadResult.payload, context);
        if (isSocial) console.log(`[processJob] ${job.providerKey} deliver done in ${Date.now() - t0}ms state=${result.state}`);
      } else if (job.operation === 'update' && connector.update) {
        result = await connector.update(payloadResult.payload, context);
      } else if (job.operation === 'takedown' && connector.takedown) {
        result = await connector.takedown(payloadResult.payload, context);
      } else {
        throw new Error(`Connector ${job.providerKey} does not support operation ${job.operation}`);
      }

      const finalState: DspDeliveryState = result.state;
      const successLike = ['processing', 'delivered'].includes(finalState);
      const connectorMetadata = result.metadata || {};
      const nextRetryAt = finalState === 'processing' ? asDate(connectorMetadata.nextPollAt) : undefined;
      const { connectorMetadata: _strippedNested, ...connectorDelta } = connectorMetadata;
      const completionUpdate: Record<string, any> = {
        state: finalState,
        externalId: result.externalId,
        nextRetryAt,
        metadata: {
          ...job.metadata,
          ...connectorMetadata,
          connectorMetadata: connectorDelta,
          metadataWarnings: payloadResult.warnings,
        },
        $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '' },
        $push: {
          attempts: {
            $each: [{
              attemptNo: job.retryCount + 1,
              status: successLike ? 'success' : 'failed',
              responseCode: successLike ? 'ACCEPTED' : 'FAILED',
              requestHash: hashPayload(payloadResult.payload),
              responseBody: result,
              retryable: finalState === 'failed',
            }],
            $slice: -MAX_ATTEMPTS,
          },
          events: {
            state: finalState,
            message: result.message || `Connector returned ${finalState}`,
            source: 'connector',
          },
        },
      };
      if (successLike) completionUpdate.$unset.errorMessage = '';
      else completionUpdate.errorMessage = result.message;
      if (!nextRetryAt) completionUpdate.$unset.nextRetryAt = '';

      await DeliveryJob.findByIdAndUpdate(jobId, completionUpdate);
      await this.setJobExpiry(jobId, finalState);
      await this.updateReleaseLifecycle(job, finalState, {
        ...job.metadata,
        ...connectorMetadata,
      });
      if (SOCIAL_PROVIDERS.has(job.providerKey)) console.log(`[processJob] Job ${jobId} done: state=${finalState}`);
      return DeliveryJob.findById(jobId);
    } catch (error) {
      console.error(`[processJob] Job ${jobId} failed:`, getErrorMessage(error), (error as any)?.statusCode);
      const latestJob = await DeliveryJob.findById(jobId).select('metadata');
      const latestMetadata = (latestJob?.metadata || job.metadata || {}) as Record<string, any>;
      const message = getErrorMessage(error);
      const statusCode = typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : undefined;
      const responseBody = getProviderErrorResponseBody(error);
      const responseCode = statusCode ? `HTTP_${statusCode}` : undefined;
      const isSocial = SOCIAL_PROVIDERS.has(job.providerKey);
      const needsAttention = Boolean(statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 401 && statusCode !== 429);
      const retryCount = job.retryCount + 1;
      const isRateLimit = statusCode === 429;

      let shouldRetry: boolean;
      let nextRetryAt: Date | undefined;

      // For social providers (YouTube, Facebook): never auto-retry on any failure.
      // Mark dead-lettered immediately so admin must retry manually.
      if (isSocial) {
        shouldRetry = false;
        nextRetryAt = undefined;
      } else if (needsAttention) {
        shouldRetry = false;
        nextRetryAt = undefined;
      } else if (retryCount > job.maxRetries) {
        shouldRetry = false;
        nextRetryAt = undefined;
      } else {
        shouldRetry = true;
        if (isRateLimit) {
          const retryAfter = (error as any)?.retryAfter
            ? parseInt((error as any).retryAfter, 10)
            : undefined;
          const retryAfterMs = retryAfter ? retryAfter * 1000 : undefined;
          const exponentialMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
          const cappedMs = Math.min(exponentialMs, 3_600_000);
          const jitter = Math.random() * 0.3 * cappedMs;
          const delayMs = retryAfterMs
            ? Math.max(retryAfterMs + jitter * 0.1, cappedMs)
            : cappedMs + jitter;
          nextRetryAt = new Date(Date.now() + delayMs);
        } else {
          const exponentialMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
          const cappedMs = Math.min(exponentialMs, 3_600_000);
          const jitter = Math.random() * 0.3 * cappedMs;
          nextRetryAt = new Date(Date.now() + cappedMs + jitter);
        }
      }

      const socialDeadLettered = isSocial && !shouldRetry;
      await DeliveryJob.findByIdAndUpdate(jobId, {
        state: socialDeadLettered ? 'failed' : needsAttention ? 'needs_attention' : shouldRetry ? 'queued' : 'failed',
        retryCount,
        nextRetryAt,
        deadLettered: socialDeadLettered || (!needsAttention && !shouldRetry),
        errorMessage: message,
        metadata: {
          ...latestMetadata,
          lastProviderError: responseBody,
        },
        $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '' },
        $push: {
          attempts: {
            $each: [{
              attemptNo: retryCount,
              status: 'failed',
              responseCode,
              responseBody,
              errorMessage: message,
              retryable: shouldRetry,
            }],
            $slice: -MAX_ATTEMPTS,
          },
          events: {
            state: socialDeadLettered ? 'failed' : needsAttention ? 'needs_attention' : shouldRetry ? 'queued' : 'failed',
            message: socialDeadLettered ? `YouTube/Facebook job dead-lettered (admin retry only): ${message}` : needsAttention ? `Provider needs attention: ${message}` : isRateLimit ? `Rate limited, retry scheduled: ${message}` : shouldRetry ? `Retry scheduled: ${message}` : `Dead-lettered: ${message}`,
            source: 'system',
          },
        },
      });

      const errorState: DspDeliveryState = socialDeadLettered ? 'failed' : needsAttention ? 'needs_attention' : shouldRetry ? 'queued' : 'failed';
      await this.setJobExpiry(jobId, errorState);

      if (needsAttention) {
        await this.updateReleaseLifecycle(job, 'needs_attention', latestMetadata, message);
      }

      return DeliveryJob.findById(jobId);
    }
  }

  async claimNextDeliveryJob(workerId: string, preferredProvider?: string) {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + WORKER_LOCK_MS);

    const baseFilter: Record<string, any> = {
      deadLettered: false,
      $and: [
        {
          $or: [
            {
              state: 'queued',
              $or: [
                { nextRetryAt: { $exists: false } },
                { nextRetryAt: null },
                { nextRetryAt: { $lte: now } },
              ],
            },
            {
              state: 'processing',
              nextRetryAt: { $lte: now },
            },
          ],
        },
        {
          $or: [
            { lockExpiresAt: { $exists: false } },
            { lockExpiresAt: null },
            { lockExpiresAt: { $lte: now } },
          ],
        },
      ],
    };

    if (preferredProvider) {
      baseFilter.providerKey = preferredProvider;
    }

    const job = await DeliveryJob.findOneAndUpdate(
      baseFilter,
      {
        lockedAt: now,
        lockedBy: workerId,
        lockExpiresAt,
      },
      { new: true, sort: { priority: 1, createdAt: 1 } }
    );
    if (job && SOCIAL_PROVIDERS.has(job.providerKey)) console.log(`[claimJob] Claimed ${job.providerKey} job=${job._id}`);
    return job;
  }

  async releaseExpiredLocks() {
    const now = new Date();
    const result = await DeliveryJob.updateMany(
      {
        state: { $in: ['processing', 'queued'] },
        lockExpiresAt: { $lte: now },
        deadLettered: false,
      },
      {
        state: 'queued',
        errorMessage: 'Worker lock expired before completion',
        $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '' },
        $push: {
          events: {
            state: 'queued',
            message: 'Worker lock expired; job returned to queue',
            source: 'system',
          },
        },
      }
    );
    return result.modifiedCount;
  }

  private processJobDetached(jobId: string) {
    void this.processJob(jobId).catch(async (error) => {
      const message = error instanceof Error ? error.message : 'Detached delivery worker failed';
      await DeliveryJob.findByIdAndUpdate(jobId, {
        state: 'failed',
        errorMessage: message,
        $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '' },
        $push: {
          events: {
            state: 'failed',
            message,
            source: 'system',
          },
        },
      });
    });
  }

  async processAllQueuedJobs(workerId?: string) {
    const id = workerId || `backfill:${process.pid}:${Date.now()}`;
    await this.releaseExpiredLocks();
    const dispatched: Array<{ jobId: string; state: string }> = [];
    for (let batch = 0; batch < 5; batch += 1) {
      const result = await this.processDueDeliveryJobs({ maxJobs: 25, workerId: id, dispatchOnly: true });
      dispatched.push(...result.processed);
      if (result.processed.length < 25) break;
    }
    return { workerId: id, dispatched };
  }

  private lastProviderTimestamps = new Map<string, number>();
  private readonly PROVIDER_THROTTLE_MS = 1000;

  async processDueDeliveryJobs(input: { maxJobs?: number; workerId?: string; dispatchOnly?: boolean } = {}) {
    const workerId = input.workerId || `dsp-worker:${process.pid}:${Date.now()}`;
    const maxJobs = Math.min(50, Math.max(1, input.maxJobs || DEFAULT_WORKER_BATCH_SIZE));
    const expiredLocksReleased = await this.releaseExpiredLocks();

    // Prioritize social video jobs (youtube, facebook) so they don't get buried by Broma batch jobs
    const priorityProviders = ['youtube', 'facebook'];
    const claimedJobs: Array<{ jobId: string; providerKey: string }> = [];
    const claimedIds = new Set<string>();

    // Round 1: claim one per priority provider to ensure social video gets through
    for (const pp of priorityProviders) {
      if (claimedJobs.length >= maxJobs) break;
      const job = await this.claimNextDeliveryJob(workerId, pp);
      if (job) {
        claimedIds.add(job._id.toString());
        claimedJobs.push({ jobId: job._id.toString(), providerKey: job.providerKey });
      }
    }

    // Round 2: fill remaining slots from any provider
    for (let index = claimedJobs.length; index < maxJobs; index += 1) {
      const job = await this.claimNextDeliveryJob(workerId);
      if (!job) break;
      if (claimedIds.has(job._id.toString())) continue;
      claimedIds.add(job._id.toString());
      claimedJobs.push({ jobId: job._id.toString(), providerKey: job.providerKey });
    }

    if (claimedJobs.length === 0) {
      this.lastProviderTimestamps.clear();
      return { workerId, expiredLocksReleased, processed: [] };
    }

    const socialJobs = claimedJobs.filter(j => SOCIAL_PROVIDERS.has(j.providerKey));
    if (socialJobs.length > 0) {
      console.log(`[scheduler] Processing ${socialJobs.length} social jobs: ${socialJobs.map(j => `${j.providerKey}:${j.jobId.slice(-6)}`).join(', ')}`);
    }

    const results = await Promise.allSettled(
      claimedJobs.map(async ({ jobId, providerKey }) => {
        await this.throttleProvider(providerKey);
        if (input.dispatchOnly) {
          this.processJobDetached(jobId);
          return { jobId, state: 'processing' as const };
        }
        const result = await this.processJob(jobId);
        return {
          jobId,
          state: result?.state || 'missing',
          error: result?.errorMessage,
        };
      })
    );

    const processed: Array<{ jobId: string; state: string; error?: string }> = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        processed.push(r.value);
      } else {
        const jobId = claimedJobs[results.indexOf(r)]?.jobId || 'unknown';
        console.error(`[scheduler] Job ${jobId} failed:`, r.reason);
        processed.push({ jobId, state: 'failed', error: r.reason?.message || String(r.reason) });
      }
    }

    this.lastProviderTimestamps.clear();
    return { workerId, expiredLocksReleased, processed };
  }

  private async throttleProvider(providerKey: string) {
    const now = Date.now();
    const last = this.lastProviderTimestamps.get(providerKey) || 0;
    const elapsed = now - last;
    if (elapsed < this.PROVIDER_THROTTLE_MS) {
      await new Promise((resolve) => setTimeout(resolve, this.PROVIDER_THROTTLE_MS - elapsed));
    }
    this.lastProviderTimestamps.set(providerKey, Date.now());
  }

  async retryJob(jobId: string) {
    const job = await DeliveryJob.findById(jobId);
    if (!job) throw new Error('Delivery job not found');
    await DeliveryJob.findByIdAndUpdate(jobId, {
      state: 'queued',
      deadLettered: false,
      nextRetryAt: new Date(),
      $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '', errorMessage: '' },
      $push: { events: { state: 'queued', message: 'Manual retry requested', source: 'user' } },
    });
    return DeliveryJob.findById(jobId);
  }

  async retryIndividualJob(jobId: string) {
    const job = await DeliveryJob.findById(jobId);
    if (!job) throw new Error('Delivery job not found');
    if (job.targetType !== 'release' || !job.releaseId) {
      throw new Error('Only release delivery jobs can be retried individually');
    }

    const bromaReleaseId = job.metadata?.bromaReleaseId;

    if (bromaReleaseId) {
      try {
        await this.deleteBromaDraft({ draftType: 'release', draftId: String(bromaReleaseId) });
      } catch (error: any) {
        console.warn(`[retryIndividualJob] Delete Broma draft ${bromaReleaseId} failed (proceeding): ${error?.message}`);
      }
    }

    const release = await mongoose.connection.collection('releases').findOne({ _id: job.releaseId });
    if (!release) throw new Error('Release not found');

    const tracks = Array.isArray(release.tracks) ? release.tracks : [];
    const stores = Array.isArray(release.stores) ? release.stores : [];
    const genre = release.genre || release.metadata?.genre || tracks[0]?.genre;
    const catalogNumber = release.catalogNumber || release.catalog_number || release.upc || String(release._id);
    const rightsholder = release.label || release.pLine || release.cLine || release.metadata?.label || 'Self-Released';
    const createdCountryId = release.createdCountryId || release.created_country_id || release.metadata?.createdCountryId;

    const payload = {
      releaseId: String(release._id),
      releaseTitle: release.releaseTitle || release.title || 'Untitled Release',
      upc: release.upc,
      primaryArtist: release.primaryArtist || release.artist || release.artistName,
      label: rightsholder,
      genre,
      language: release.language,
      releaseDate: release.releaseDate,
      stores,
      tracks: tracks.map((track: any, index: number) => ({
        id: String(track._id || track.id || track.isrc || track.title || `${release._id}:${index}`),
        title: track.title,
        artistName: track.artistName || track.primaryArtist || release.primaryArtist,
        version: track.version || track.subtitle,
        isrc: track.isrc,
        upc: track.upc || release.upc,
        genre: track.genre,
        explicit: track.explicit,
        releaseDate: track.releaseDate || release.releaseDate,
        audioFile: track.audioFile || track.audioUrl || track.fileUrl,
        artwork: track.artwork || track.artworkUrl || release.artwork || release.artworkUrl,
        duration: track.duration,
        contributors: track.contributors || track.rightsHolders || [],
        composers: track.composers || [],
        lyricists: track.lyricists || [],
        publishers: track.publishers || [],
        metadata: {
          subtitle: track.subtitle,
          version: track.version,
          catalogNumber: track.catalogNumber || catalogNumber,
          createdDate: track.createdDate || track.created_date,
          originalReleaseDate: track.originalReleaseDate || track.original_release_date || release.originalReleaseDate,
          createdCountryId: track.createdCountryId || createdCountryId,
          producer: track.producer || release.producer || rightsholder,
          featuredArtist: track.featuredArtist || track.featuring,
          label: rightsholder,
        },
      })),
      territories: release.territories || ['WORLD'],
      assetChecks: release.deliveryAssetReadiness?.checks || [],
      metadata: {
        artwork: release.artwork || release.artworkUrl,
        releaseType: release.releaseType,
        catalogNumber,
        createdDate: release.createdDate || release.created_date,
        originalReleaseDate: release.originalReleaseDate || release.original_release_date,
        createdCountryId,
        producer: release.producer || rightsholder,
        featuring: release.featuring || release.metadata?.featuring,
        pline: release.pline || release.pLine,
        cline: release.cline || release.cLine,
        bromaOutletIds: release.bromaReadiness?.outletIds || [],
        bromaOutletMappings: release.bromaReadiness?.outletMappings || [],
      },
    };

    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    const prevVersion = Number((job.metadata as Record<string, any>)?.snapshotVersion || 1);

    const snapshot = {
      releaseId: release._id,
      version: prevVersion + 1,
      providerKeys: ['broma'],
      payload,
      payloadHash,
      createdBy: 'system:retry-individual',
      createdAt: new Date(),
    };
    const insertResult = await mongoose.connection.collection('releaseDeliverySnapshots').insertOne(snapshot);

    await DeliveryJob.findByIdAndUpdate(jobId, {
      state: 'queued',
      snapshotId: insertResult.insertedId,
      deadLettered: false,
      nextRetryAt: new Date(),
      $unset: {
        lockedAt: '',
        lockedBy: '',
        lockExpiresAt: '',
        errorMessage: '',
        externalId: '',
        'metadata.bromaReleaseId': '',
        'metadata.bromaRecordingIds': '',
        'metadata.bromaStep': '',
        'metadata.bromaCoverUploaded': '',
        'metadata.bromaModerationSentAt': '',
        'metadata.bromaModerationStatus': '',
        'metadata.bromaLastStatusAt': '',
        'metadata.bromaRawStatus': '',
        'metadata.bromaAdditionalReleaseIds': '',
        'metadata.bromaAdditionalReleaseSkippedAt': '',
        'metadata.bromaOutletIds': '',
        'metadata.bromaOutletMappings': '',
        'metadata.lastProviderError': '',
        'metadata.bromaReleaseTypeId': '',
        'metadata.bromaErrorDetails': '',
        'metadata.bromaAssetId': '',
        'metadata.bromaAssetStatuses': '',
        'metadata.bromaRejectionReason': '',
        'metadata.bromaStatusSource': '',
        'metadata.bromaTakedownMode': '',
        'metadata.bromaTakedownRequestedAt': '',
        'metadata.nextPollAt': '',
        'metadata.payloadHash': '',
        'metadata.connectorMetadata': '',
        'metadata.metadataWarnings': '',
      },
      $push: {
        events: {
          state: 'queued',
          message: 'Manual retry with data rebuild: Broma draft deleted, snapshot rebuilt with current release data',
          source: 'user',
        },
      },
    });

    return DeliveryJob.findById(jobId);
  }

  async diagnoseBromaApi() {
    const out: Record<string, any> = { checks: [] };

    const providerRecord = await this.getProviderWithDecryptedCredentials('broma');
    if (!providerRecord || !providerRecord.provider.enabled) {
      out.error = 'Broma provider not active';
      return out;
    }

    const client = new BromaClient({
      credentials: providerRecord.credentials,
      config: providerRecord.provider.config || {},
    });

    out.config = {
      baseUrl: providerRecord.provider.config?.baseUrl,
      accountId: providerRecord.provider.config?.accountId,
      integrationMode: providerRecord.provider.integrationMode,
    };
    out.credentialKeys = Object.keys(providerRecord.credentials).filter((k) => k !== 'password');

    try {
      const draftsResponse = await client.getDrafts(String(providerRecord.provider.config?.accountId));
      out.draftsResponse = draftsResponse;
      out.draftsResponseType = typeof draftsResponse;
      out.draftsIsArray = Array.isArray(draftsResponse);
      out.draftsKeys = typeof draftsResponse === 'object' && draftsResponse ? Object.keys(draftsResponse as any) : [];
      if (typeof draftsResponse === 'object' && draftsResponse) {
        const data = (draftsResponse as any).data;
        if (data !== undefined) {
          out.draftsDataType = typeof data;
          out.draftsDataIsArray = Array.isArray(data);
          out.draftsDataKeys = typeof data === 'object' && data ? Object.keys(data) : [];
          if (Array.isArray(data)) out.draftsDataLength = data.length;
        }
      }
      out.draftsRawPreview = JSON.stringify(draftsResponse).slice(0, 2000);
    } catch (error: any) {
      out.draftsError = error?.message || String(error);
      out.draftsErrorCode = error?.statusCode;
      out.draftsErrorBody = error?.responseBody;
    }

    try {
      const accountId = providerRecord.provider.config?.accountId;
      if (accountId) {
        const assetsResponse = await client.getAccountReleaseAssets(String(accountId), { limit: 5 });
        out.assetsResponsePreview = JSON.stringify(assetsResponse).slice(0, 2000);
        out.assetsKeys = typeof assetsResponse === 'object' && assetsResponse ? Object.keys(assetsResponse as any) : [];
      } else {
        out.assetsSkipped = 'No accountId configured';
      }
    } catch (error: any) {
      out.assetsError = error?.message || String(error);
    }

    try {
      const accountId = providerRecord.provider.config?.accountId;
      if (accountId) {
        const pendingResponse = await client.getAccountReleaseAssets(String(accountId), { limit: 200, moderation_status: 'pending' });
        const pendingItems = this.extractBromaAssetsList(pendingResponse);
        out.pendingDraftsCount = pendingItems.length;
        out.pendingDraftIds = pendingItems.slice(0, 10).map((d: any) => ({ id: d.id, title: d.title, ms: d.moderation_status }));
      } else {
        out.pendingDraftsSkipped = 'No accountId configured';
      }
    } catch (error: any) {
      out.pendingDraftsError = error?.message || String(error);
    }

    try {
      const accountId = providerRecord.provider.config?.accountId;
      if (accountId) {
        const allAssets = await client.getAccountReleaseAssets(String(accountId), { limit: 200 });
        const allItems = this.extractBromaAssetsList(allAssets);
        const pendingLocal = allItems.filter((d: any) => d.moderation_status === 'pending' && !d.deleted_at);
        out.pendingDraftsLocalCount = pendingLocal.length;
        out.pendingDraftsLocalIds = pendingLocal.slice(0, 10).map((d: any) => ({ id: d.id, title: d.title, ms: d.moderation_status, statuses: d.statuses }));

        const msBreakdown: Record<string, number> = {};
        const labelBreakdown: Record<string, number> = {};
        const statusBreakdown: Record<string, number> = {};
        const assetsByLabel: Record<string, Array<{ id: number; title: string; moderation_status: string; ean?: string; release_type_id?: number; release_date?: string; statuses?: string[] }>> = {};
        for (const item of allItems) {
          const ms = item.moderation_status ?? '(none)';
          msBreakdown[ms] = (msBreakdown[ms] || 0) + 1;
          const lbl = String(item.label_id ?? '?');
          labelBreakdown[lbl] = (labelBreakdown[lbl] || 0) + 1;
          if (Array.isArray(item.statuses)) {
            for (const s of item.statuses) {
              statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
            }
          }
          if (item.deleted_at) {
            statusBreakdown['_deleted'] = (statusBreakdown['_deleted'] || 0) + 1;
          }
          if (!assetsByLabel[lbl]) assetsByLabel[lbl] = [];
          assetsByLabel[lbl].push({
            id: item.id,
            title: item.title,
            moderation_status: item.moderation_status,
            ean: item.ean,
            release_type_id: item.release_type_id,
            release_date: item.release_date,
            statuses: item.statuses,
          });
        }
        out.moderationStatusBreakdown = msBreakdown;
        out.labelBreakdown = labelBreakdown;
        out.statusBreakdown = statusBreakdown;
        out.assetsByLabel = assetsByLabel;
      } else {
        out.pendingDraftsLocalSkipped = 'No accountId configured';
      }
    } catch (error: any) {
      out.pendingDraftsLocalError = error?.message || String(error);
    }

    const totalJobs = await DeliveryJob.countDocuments({
      providerKey: 'broma',
      targetType: 'release',
      $or: [{ externalId: { $exists: true, $ne: '' } }, { 'metadata.bromaReleaseId': { $exists: true, $ne: '' } }],
    });
    out.totalDeliveryJobs = totalJobs;

    return out;
  }

  private extractBromaAssetsList(response: any): any[] {
    if (!response || typeof response !== 'object') return [];
    const root = response as Record<string, any>;

    if (root.status === 'ok') {
      if (Array.isArray(root.data)) return root.data;
      if (Array.isArray(root.items)) return root.items;
      if (root.data && typeof root.data === 'object') {
        if (Array.isArray(root.data.releases)) return root.data.releases;
        if (Array.isArray(root.data.items)) return root.data.items;
      }
    }

    if (Array.isArray(root.data)) return root.data;
    if (Array.isArray(root.items)) return root.items;
    if (Array.isArray(root.releases)) return root.releases;

    return [];
  }

  async listBromaDrafts(page?: number) {
    const providerRecord = await this.getProviderWithDecryptedCredentials('broma');
    if (!providerRecord || !providerRecord.provider.enabled) {
      throw new Error('Broma provider is not active');
    }
    const accountId = providerRecord.provider.config?.accountId;
    if (!accountId) {
      throw new Error('Broma accountId not configured');
    }

    const client = new BromaClient({
      credentials: providerRecord.credentials,
      config: providerRecord.provider.config || {},
    });

    const firstPage = await client.getDrafts(String(accountId));
    const bromaTotal = typeof firstPage?.total === 'number' ? firstPage.total : 0;
    const allItems = this.extractBromaAssetsList(firstPage);

    const ids = allItems.map((d: any) => String(d?.id ?? '')).filter(Boolean);

    const jobs = ids.length > 0
      ? await DeliveryJob.find({ providerKey: 'broma', 'metadata.bromaReleaseId': { $in: ids } }).sort({ createdAt: -1 }).lean()
      : [];
    const jobMap = new Map(jobs.map((j) => [String((j.metadata as any)?.bromaReleaseId), j]));
    const TERMINAL_JOB_STATES = new Set(['delivered', 'cancelled']);

    const draftItems = allItems.filter((d: any) => {
      const id = String(d.id ?? '');
      const job = jobMap.get(id);
      return !job || !TERMINAL_JOB_STATES.has(job.state);
    });

    const filteredTotal = draftItems.length;

    const sorted = draftItems.map((d: any) => {
      const id = String(d.id ?? '');
      const job = jobMap.get(id);
      return {
        bromaDraftId: id,
        releaseTitle: d.title || d.name || '',
        bromaStep: job ? (job.metadata as any)?.bromaStep : '-',
        jobState: job ? job.state : 'no_job',
        jobId: job ? String(job._id) : null,
        releaseId: job ? String(job.releaseId ?? '') : '',
        createdAt: d.release_date || d.created_at || d.createdAt,
        completed: TERMINAL_JOB_STATES.has(job?.state || ''),
      };
    });

    if (page) {
      const PAGE = 10;
      const start = (page - 1) * PAGE;
      return { total: filteredTotal, drafts: sorted.slice(start, start + PAGE) };
    }
    return { total: filteredTotal, drafts: sorted };
  }

  async retryAllBromaDrafts(workerId?: string) {
    const id = workerId || `draft-retry:${process.pid}:${Date.now()}`;

    const providerRecord = await this.getProviderWithDecryptedCredentials('broma');
    if (!providerRecord || !providerRecord.provider.enabled) {
      return { retried: 0, dispatched: 0, noJobDrafts: 0, error: 'Broma provider not active' };
    }
    const accountId = providerRecord.provider.config?.accountId;
    if (!accountId) {
      return { retried: 0, dispatched: 0, noJobDrafts: 0, error: 'Broma accountId not configured' };
    }

    const client = new BromaClient({
      credentials: providerRecord.credentials,
      config: providerRecord.provider.config || {},
    });

    const resp = await client.getDrafts(String(accountId), { page: 1, limit: 1000 });
    const bromaDraftIds = this.extractBromaAssetsList(resp);
    const draftIds = bromaDraftIds.map((d: any) => String(d?.id ?? '')).filter(Boolean);
    const jobs = draftIds.length > 0
      ? await DeliveryJob.find({
          providerKey: 'broma',
          'metadata.bromaReleaseId': { $in: draftIds },
        }).sort({ createdAt: -1 }).lean()
      : [];
    const jobMap = new Map(jobs.map((j) => [String((j.metadata as any)?.bromaReleaseId), j]));
    const TERMINAL_JOB_STATES = new Set(['delivered', 'cancelled']);

    const retryable: string[] = [];
    let noJobDrafts = 0;
    for (const d of bromaDraftIds) {
      const idStr = String(d.id ?? '');
      const job = jobMap.get(idStr);
      if (!job) { noJobDrafts++; continue; }
      if (TERMINAL_JOB_STATES.has(job.state) || job.state === 'processing') continue;
      retryable.push(String(job._id));
    }

    const retried: string[] = [];
    for (const jobId of retryable) {
      await DeliveryJob.findByIdAndUpdate(jobId, {
        state: 'queued',
        deadLettered: false,
        nextRetryAt: new Date(),
        $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '', errorMessage: '' },
        $push: { events: { state: 'queued', message: 'Bulk draft retry', source: 'system' } },
      });
      retried.push(jobId);
    }

    const dispatched = retried.length > 0
      ? (await this.processDueDeliveryJobs({ maxJobs: Math.min(retried.length, 25), workerId: id, dispatchOnly: true })).processed
      : [];

    return { retried: retried.length, dispatched: dispatched.length, noJobDrafts };
  }

  async forceProcessBromaDrafts() {
    const providerRecord = await this.getProviderWithDecryptedCredentials('broma');
    if (!providerRecord || !providerRecord.provider.enabled) {
      return { requeued: 0, dispatched: 0, error: 'Broma provider not active' };
    }
    const accountId = providerRecord.provider.config?.accountId;
    if (!accountId) {
      return { requeued: 0, dispatched: 0, error: 'Broma accountId not configured' };
    }

    const client = new BromaClient({
      credentials: providerRecord.credentials,
      config: providerRecord.provider.config || {},
    });

    const resp = await client.getDrafts(String(accountId), { page: 1, limit: 1000 });
    const items = this.extractBromaAssetsList(resp);
    const draftIds = items.map((d: any) => String(d?.id ?? '')).filter(Boolean);

    if (draftIds.length === 0) return { requeued: 0, dispatched: 0, error: 'No Broma drafts found' };

    const jobs = await DeliveryJob.find({
      providerKey: 'broma',
      'metadata.bromaReleaseId': { $in: draftIds },
      state: { $nin: ['delivered', 'cancelled'] },
    }).lean();

    if (jobs.length === 0) return { requeued: 0, dispatched: 0, error: 'No active delivery jobs for these drafts' };

    const jobIds = jobs.map((j) => j._id);
    const now = new Date();
    await DeliveryJob.updateMany(
      { _id: { $in: jobIds } },
      {
        $set: { state: 'queued', nextRetryAt: now, deadLettered: false },
        $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '', errorMessage: '' },
        $push: { events: { state: 'queued', message: 'Force process requested from drafts panel', source: 'user' } },
      }
    );

    return { requeued: jobIds.length, dispatched: 0, message: 'Jobs requeued — scheduler will process them automatically' };
  }

  async refreshJobStatus(jobId: string) {
    const job = await DeliveryJob.findById(jobId);
    if (!job) throw new Error('Delivery job not found');
    if (job.providerKey !== 'broma') throw new Error('Fresh status is only supported for Broma deliveries');

    const metadata = (job.metadata || {}) as Record<string, any>;
    const externalId = String(job.externalId || metadata.bromaReleaseId || '');
    if (!externalId) throw new Error('Broma release id missing for status refresh');

    const providerRecord = await this.getProviderWithDecryptedCredentials(job.providerKey);
    if (!providerRecord || !providerRecord.provider.enabled || providerRecord.provider.maintenanceMode) {
      return this.markJobNeedsAttention(jobId, job, 'Provider inactive or in maintenance mode');
    }

    const connector = dspRegistry.get(job.providerKey);
    if (!connector.getDeliveryStatus) throw new Error(`Connector ${job.providerKey} does not support status refresh`);

    let result: DspDeliveryResult;
    try {
      result = await connector.getDeliveryStatus(externalId, {
        providerKey: providerRecord.provider.key,
        credentials: providerRecord.credentials,
        region: providerRecord.provider.region,
        config: providerRecord.provider.config,
        operation: job.operation,
        jobId,
        jobMetadata: job.metadata || {},
      });
    } catch (error) {
      return this.markJobNeedsAttention(jobId, job, `Broma status refresh failed: ${getErrorMessage(error)}`);
    }

    const resultMeta = result.metadata || {};
    const { connectorMetadata: _strippedNested, ...freshResultMeta } = resultMeta;
    const nextMetadata = {
      ...metadata,
      ...resultMeta,
      bromaAssetId: resultMeta.bromaAssetId ?? metadata.bromaAssetId,
      connectorMetadata: freshResultMeta,
    };
    const successLike = ['processing', 'delivered'].includes(result.state);
    const update: Record<string, any> = {
      state: result.state,
      externalId: result.externalId || externalId,
      metadata: nextMetadata,
      $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '' },
      $push: {
        events: {
          state: result.state,
          message: result.message || 'Fresh Broma status fetched',
          source: 'connector',
        },
      },
    };
    if (successLike) update.$unset.errorMessage = '';
    else update.errorMessage = result.message;

    await DeliveryJob.findByIdAndUpdate(jobId, update);
    await this.setJobExpiry(jobId, result.state);
    try {
      await this.updateReleaseLifecycle(job, result.state, nextMetadata, result.state === 'needs_attention' ? result.message : undefined);
    } catch (lifecycleError) {
      console.error(`[refreshJobStatus] updateReleaseLifecycle failed for job ${jobId}: ${getErrorMessage(lifecycleError)}`);
    }
    return DeliveryJob.findById(jobId);
  }

  async syncBromaReleaseStatuses(input: { releaseIds?: string[]; limit?: number; skip?: number; syncId?: string } = {}) {
    const syncId = input.syncId || '';
    const maxLimit = Math.max(1, input.limit ?? 10_000);
    const skip = Math.max(0, input.skip || 0);
    const releaseObjectIds = (input.releaseIds || [])
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (syncId) syncProgress.set(syncId, { total: 0, processed: 0, errors: 0, current: 'Counting jobs…', done: false, startTime: Date.now() });

    const baseQuery: Record<string, any> = { providerKey: 'broma', targetType: 'release' };
    if (releaseObjectIds.length > 0) baseQuery.releaseId = { $in: releaseObjectIds };

    const [totalCount, jobs] = await Promise.all([
      DeliveryJob.collection.countDocuments(baseQuery),
      DeliveryJob.collection.find(baseQuery, {
        projection: { _id: 1, releaseId: 1, state: 1, externalId: 1, metadata: 1, updatedAt: 1, createdAt: 1, hiddenFromOps: 1, deadLettered: 1 },
      }).toArray(),
    ]);
    jobs.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0) || (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    const filtered = !releaseObjectIds.length ? jobs.filter((j) => !j.hiddenFromOps && j.metadata?.resetForApproval !== true && !j.deadLettered) : jobs;
    const limitVal = Math.min(maxLimit, filtered.length);
    const paged = filtered.slice(skip, skip + limitVal);

    if (syncId) syncProgress.set(syncId, { total: paged.length, processed: 0, errors: 0, current: 'Starting…', done: false, startTime: syncProgress.get(syncId)?.startTime || Date.now() });

    const seenReleaseIds = new Set<string>();
    const results: Array<{ jobId: string; releaseId?: string; state?: string; status?: string; error?: string; previousState?: string }> = [];

    for (const job of paged) {
      const releaseId = job.releaseId?.toString();
      if (releaseId && seenReleaseIds.has(releaseId)) {
        if (syncId) syncProgress.set(syncId, { total: paged.length, processed: results.length, errors: results.filter(r => r.error).length, current: `Skipping duplicate ${releaseId?.slice(-6)}…`, done: false, startTime: syncProgress.get(syncId)?.startTime || Date.now() });
        continue;
      }
      if (releaseId) seenReleaseIds.add(releaseId);

      if (syncId) syncProgress.set(syncId, { total: paged.length, processed: results.length, errors: results.filter(r => r.error).length, current: `${job?.state || ''} → checking ${releaseId?.slice(-6) || job._id.toString().slice(-6)}`, done: false, startTime: syncProgress.get(syncId)?.startTime || Date.now() });

      try {
        const previousState = job.state;
        const refreshed = await this.refreshJobStatus(job._id.toString());
        results.push({
          jobId: job._id.toString(),
          releaseId,
          previousState,
          state: refreshed?.state,
          status: (refreshed?.metadata as Record<string, any> | undefined)?.bromaModerationStatus,
        });
      } catch (error) {
        console.error(`[syncBromaReleaseStatuses] Job ${job._id} (release ${releaseId}): ${getErrorMessage(error)}`);
        results.push({
          jobId: job._id.toString(),
          releaseId,
          error: getErrorMessage(error),
        });
      }
    }

    if (syncId) {
      syncProgress.set(syncId, { total: paged.length, processed: results.length, errors: results.filter(r => r.error).length, current: 'Done', done: true, startTime: syncProgress.get(syncId)?.startTime || Date.now() });
      setTimeout(() => syncProgress.delete(syncId), 60_000);
    }

    return {
      syncId,
      checked: results.length,
      approved: results.filter((item) => item.state === 'delivered').length,
      rejected: results.filter((item) => item.state === 'needs_attention' && item.status === 'rejected').length,
      stillProcessing: results.filter((item) => item.state === 'processing').length,
      failed: results.filter((item) => item.error).length,
      results,
    };
  }

  async cleanupBromaDrafts(input: { action?: 'list' | 'delete_orphans' | 'resume_orphans'; maxDrafts?: number } = {}) {
    const action = input.action || 'list';
    const maxDrafts = Math.min(200, Math.max(1, input.maxDrafts || 100));

    const providerRecord = await this.getProviderWithDecryptedCredentials('broma');
    if (!providerRecord || !providerRecord.provider.enabled) {
      return { action, error: 'Broma provider not active', deleted: 0, resumed: 0, orphaned: 0, active: 0 };
    }

    const client = new BromaClient({
      credentials: providerRecord.credentials,
      config: providerRecord.provider.config || {},
    });

    const accountId = providerRecord.provider.config?.accountId;
    if (!accountId) {
      return { action, error: 'Broma accountId not configured', deleted: 0, resumed: 0, orphaned: 0, active: 0 };
    }

    const resp = await client.getDrafts(String(accountId), { page: 1, limit: 1000 });
    const allItems = this.extractBromaAssetsList(resp);
    const drafts = allItems.slice(0, maxDrafts);
    const draftIds = drafts.map((d: any) => String(d?.id ?? '')).filter(Boolean);

    const jobs = draftIds.length > 0
      ? await DeliveryJob.find({
          providerKey: 'broma',
          'metadata.bromaReleaseId': { $in: draftIds },
        }).sort({ createdAt: -1 }).lean()
      : [];

    const jobByBromaId = new Map(jobs.map((j) => [String((j.metadata as any)?.bromaReleaseId), j]));
    const TERMINAL_STATES = new Set(['delivered', 'cancelled']);

    const orphaned: any[] = [];
    const activeJobs: any[] = [];
    const terminalJobs: any[] = [];

    for (const draft of drafts) {
      const id = String(draft.id ?? '');
      const job = jobByBromaId.get(id);
      if (!job) orphaned.push(draft);
      else if (TERMINAL_STATES.has(job.state)) terminalJobs.push({ draft, job });
      else activeJobs.push({ draft, job });
    }

    let deleted = 0;
    let resumed = 0;
    const errors: string[] = [];

    if (action === 'delete_orphans') {
      for (const draft of orphaned) {
        try {
          await client.deleteDraft('release', draft.id);
          deleted++;
        } catch (error) {
          errors.push(`Failed to delete draft ${draft.id}: ${getErrorMessage(error)}`);
        }
      }
    }

    if (action === 'delete_orphans') {
      for (const { draft } of terminalJobs) {
        try {
          await client.deleteDraft('release', draft.id);
          deleted++;
        } catch (error) {
          errors.push(`Failed to delete terminal draft ${draft.id}: ${getErrorMessage(error)}`);
        }
      }
    }

    if (action === 'resume_orphans') {
      const retryIds: string[] = [];
      for (const { draft, job } of activeJobs) {
        if (job.state === 'processing' || job.state === 'queued') continue;
        retryIds.push(String(job._id));
      }
      for (const jobId of retryIds) {
        try {
          await DeliveryJob.findByIdAndUpdate(jobId, {
            state: 'queued',
            deadLettered: false,
            nextRetryAt: new Date(),
            $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '', errorMessage: '' },
            $push: {
              events: {
                state: 'queued',
                message: 'Resumed from draft cleanup',
                source: 'system',
              },
            },
          });
          resumed++;
        } catch (error) {
          errors.push(`Failed to resume job ${jobId}: ${getErrorMessage(error)}`);
        }
      }
    }

    return {
      action,
      totalDrafts: drafts.length,
      orphaned: orphaned.length,
      active: activeJobs.length,
      terminal: terminalJobs.length,
      deleted,
      resumed,
      errors: errors.slice(0, 10),
    };
  }

  async requeueStuckBromaJobs(input: { maxJobs?: number; olderThanMinutes?: number } = {}) {
    const maxJobs = Math.min(500, Math.max(1, input.maxJobs || 200));
    const olderThanMinutes = Math.max(5, input.olderThanMinutes || 60);
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);

    const stuckJobs = await DeliveryJob.find({
      providerKey: 'broma',
      targetType: 'release',
      state: { $in: ['processing', 'queued'] },
      $or: [
        { nextRetryAt: { $lte: new Date() } },
        { nextRetryAt: { $exists: false } },
      ],
      deadLettered: false,
      'metadata.resetForApproval': { $ne: true },
      hiddenFromOps: { $ne: true },
    })
      .sort({ updatedAt: 1 })
      .limit(maxJobs)
      .select('_id releaseId state metadata updatedAt');

    const requeued: string[] = [];
    for (const job of stuckJobs) {
      if (job.state === 'processing' && job.updatedAt && job.updatedAt > cutoff) continue;

      await DeliveryJob.findByIdAndUpdate(job._id, {
        state: 'queued',
        nextRetryAt: new Date(),
        $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '', errorMessage: '' },
        $push: {
          events: {
            state: 'queued',
            message: `Auto-requeued (stuck for >${olderThanMinutes}min in ${job.state})`,
            source: 'system',
          },
        },
      });
      requeued.push(job._id.toString());
    }

    return { requeued: requeued.length, jobs: requeued };
  }

  async clearJobLogs(jobId: string, actorId?: string) {
    const job = await DeliveryJob.findById(jobId);
    if (!job) throw new Error('Delivery job not found');
    const clearedAt = new Date();
    const attemptsCleared = job.attempts?.length || 0;
    const eventsCleared = job.events?.length || 0;
    const resetState: DspDeliveryState = 'cancelled';
    let releaseReset = false;
    let releaseMissing = false;

    await DeliveryJob.findByIdAndUpdate(jobId, {
      state: resetState,
      retryCount: 0,
      deadLettered: false,
      hiddenFromOps: true,
      updatedAt: clearedAt,
      attempts: [],
      events: [
        {
          state: resetState,
          message: `Admin cleared ${attemptsCleared} attempts and ${eventsCleared} events; release moved back to pending`,
          source: 'user',
          createdAt: clearedAt,
        },
      ],
      metadata: {
        ...(job.metadata || {}),
        resetForApproval: true,
        lastLogClear: {
          at: clearedAt.toISOString(),
          by: actorId,
          attemptsCleared,
          eventsCleared,
        },
      },
      $unset: {
        errorMessage: '',
        lockedAt: '',
        lockedBy: '',
        lockExpiresAt: '',
        nextRetryAt: '',
        lastAttemptAt: '',
      },
    });

    await this.setJobExpiry(jobId, resetState);

    if (job.targetType === 'release' && job.releaseId) {
      const releaseUpdate = await mongoose.connection.collection('releases').updateOne(
        { _id: job.releaseId },
        {
          $set: {
            status: 'pending',
            updatedAt: clearedAt,
            'bromaDelivery.resetForApprovalAt': clearedAt,
            'bromaDelivery.resetForApprovalBy': actorId || null,
          },
        }
      );
      releaseReset = releaseUpdate.matchedCount > 0;
      releaseMissing = releaseUpdate.matchedCount === 0;
    }

    return {
      jobId,
      cleared: true,
      attemptsCleared,
      eventsCleared,
      releaseId: job.releaseId?.toString(),
      releaseReset,
      releaseMissing,
    };
  }

  async listJobs(filters: { providerKey?: string; state?: string; releaseId?: string; trackIds?: string[]; page?: number; limit?: number }) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const query: Record<string, unknown> = {};
    query.hiddenFromOps = { $ne: true };
    query['metadata.resetForApproval'] = { $ne: true };
    if (filters.providerKey) query.providerKey = filters.providerKey;
    if (filters.trackIds?.length) {
      query.$or = [
        { releaseId: filters.releaseId },
        { trackId: { $in: filters.trackIds.map(id => new mongoose.Types.ObjectId(id)) } },
      ];
    } else if (filters.releaseId) {
      query.releaseId = filters.releaseId;
    }

    const pipeline: any[] = [
      { $match: query },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            providerKey: '$providerKey',
            targetType: '$targetType',
            releaseId: '$releaseId',
            trackId: '$trackId',
            operation: '$operation',
          },
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } },
    ];

    if (filters.state) pipeline.push({ $match: { state: filters.state } });

    pipeline.push(
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $project: { attempts: 0, events: 0 } },
          ],
          total: [{ $count: 'count' }],
        },
      }
    );

    const [result] = await DeliveryJob.aggregate(pipeline).allowDiskUse(true);
    const items = await DeliveryJob.populate(result?.data || [], {
      path: 'trackId',
      select: 'title artistName isrc',
    });
    const total = Number(result?.total?.[0]?.count || 0);

    return {
      data: items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getJob(jobId: string) {
    return DeliveryJob.findById(jobId).populate('trackId', 'title artistName isrc stores');
  }

  async processWebhook(providerKey: string, payload: Record<string, unknown>, headers: Record<string, unknown>) {
    const normalizedProviderKey = providerKey.toLowerCase().trim();
    const providerRecord = await this.getProviderWithDecryptedCredentials(normalizedProviderKey);
    if (!providerRecord) throw new Error('Provider not found');

    const { provider, credentials } = providerRecord;
    const connector = dspRegistry.get(normalizedProviderKey);
    const webhookSecret = String(credentials.webhookSecret || provider.config?.webhookSecret || '');
    const requiresSignature = provider.integrationMode !== 'shell';
    const signatureValid = connector.validateWebhookSignature
      ? connector.validateWebhookSignature(getHeadersRecord(headers), payload, webhookSecret)
      : !requiresSignature;

    const event = await DspWebhookEvent.create({
      providerKey: normalizedProviderKey,
      eventType: typeof payload.eventType === 'string' ? payload.eventType : undefined,
      signatureValid,
      payload,
      headers: getHeadersRecord(headers),
      processed: false,
    });

    if (requiresSignature && !signatureValid) {
      event.processingError = 'Invalid webhook signature';
      await event.save();
      throw new Error('Invalid webhook signature');
    }

    const externalId = typeof payload.externalId === 'string' ? payload.externalId : undefined;
    if (externalId) {
      const state =
        typeof payload.state === 'string' && ALLOWED_WEBHOOK_STATES.includes(payload.state as DspDeliveryState)
          ? (payload.state as DspDeliveryState)
          : 'processing';
      await DeliveryJob.findOneAndUpdate(
        { providerKey: normalizedProviderKey, externalId },
        {
          state,
          $push: {
            events: {
              state,
              message: typeof payload.message === 'string' ? payload.message : 'Webhook update received',
              source: 'webhook',
            },
          },
        }
      );
    }

    event.processed = true;
    await event.save();
    return event;
  }

  async createRightsClaim(input: {
    trackId: string;
    providerKey: string;
    policyAction: 'monitor' | 'claim' | 'block' | 'monetize';
    evidence?: Record<string, unknown>;
  }) {
    return RightsClaim.create({
      trackId: input.trackId,
      providerKey: input.providerKey,
      policyAction: input.policyAction,
      evidence: input.evidence || {},
    });
  }

  async addFingerprintMatch(input: {
    trackId: string;
    providerKey: string;
    confidence: number;
    matchType: 'audio' | 'video' | 'ugc';
    payload?: Record<string, unknown>;
  }) {
    return FingerprintMatch.create({
      trackId: input.trackId,
      providerKey: input.providerKey,
      confidence: input.confidence,
      matchType: input.matchType,
      payload: input.payload || {},
    });
  }
}

export const dspDeliveryService = new DspDeliveryService();
