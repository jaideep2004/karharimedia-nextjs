import crypto from 'crypto';
import mongoose from 'mongoose';
import DspProvider from '../../models/dspProvider.model';
import DeliveryJob, { IDeliveryJob } from '../../models/deliveryJob.model';
import DspWebhookEvent from '../../models/dspWebhookEvent.model';
import RightsClaim from '../../models/rightsClaim.model';
import FingerprintMatch from '../../models/fingerprintMatch.model';
import {
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

const BASE_RETRY_DELAY_MS = 15_000;
const WORKER_LOCK_MS = 5 * 60_000;
const DEFAULT_WORKER_BATCH_SIZE = 5;
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

  private buildTrackPayload(trackDoc: any): DspTrackPayload {
    return {
      trackId: trackDoc._id.toString(),
      title: trackDoc.title,
      artistName: trackDoc.artistName,
      isrc: trackDoc.isrc,
      upc: trackDoc.upc,
      genre: trackDoc.genre,
      language: trackDoc.language,
      explicit: trackDoc.explicit,
      releaseDate: trackDoc.releaseDate ? new Date(trackDoc.releaseDate).toISOString() : undefined,
      audioFile: trackDoc.audioFile,
      artwork: trackDoc.artwork,
      contributors: [
        {
          name: trackDoc.artistName,
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
    const providerRecord = await this.getProviderWithDecryptedCredentials(normalizedProviderKey);
    if (!providerRecord || !providerRecord.provider.enabled) throw new Error(`Provider ${normalizedProviderKey} is not active`);
    if (providerRecord.provider.maintenanceMode) throw new Error(`Provider ${normalizedProviderKey} is in maintenance mode`);

    const track = await findTrackById(trackId);
    if (!track) throw new Error('Track not found');

    const payload = this.buildTrackPayload(track);
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
    const track = await findTrackById(job.trackId.toString());
    if (!track) return { errors: ['Track not found'], warnings: [] };
    const ruleResult = applyMetadataRules(job.providerKey, this.buildTrackPayload(track));
    return {
      payload: ruleResult.normalized,
      errors: ruleResult.errors,
      warnings: ruleResult.warnings,
    };
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
    return DeliveryJob.findById(jobId);
  }

  private async failJob(jobId: string, message: string) {
    await DeliveryJob.findByIdAndUpdate(jobId, {
      state: 'failed',
      errorMessage: message,
      deadLettered: true,
      $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '' },
      $push: { events: { state: 'failed', message, source: 'system' } },
    });
    return DeliveryJob.findById(jobId);
  }

  private async updateReleaseLifecycle(job: IDeliveryJob, state: string, metadata: Record<string, any> = {}) {
    if (job.targetType !== 'release' || !job.releaseId) return;

    let releaseStatus: string | null = null;
    const step = String(metadata.bromaStep || '');
    const moderationStatus = String(metadata.bromaModerationStatus || '').toLowerCase();
    const bromaRejected = ['rejected', 'declined', 'cancelled', 'failed', 'error', 'not_ready'].includes(moderationStatus);
    if (bromaRejected) releaseStatus = 'rejected';
    else if (state === 'delivered') releaseStatus = 'live';
    else if (step === 'send_moderation') releaseStatus = 'broma_moderation';
    else if (step === 'poll_status') {
      releaseStatus = ['approved', 'live', 'published', 'delivered', 'processed', 'done', 'active', 'success', 'shipped'].includes(moderationStatus)
        ? 'live'
        : ['accepted', 'processing', 'distributed', 'in_distribution'].includes(moderationStatus)
        ? 'dsp_processing'
        : 'broma_moderation';
    }
    else if (step === 'done') releaseStatus = 'live';
    else if (state === 'processing') releaseStatus = 'uploading_to_broma';
    else if (state === 'needs_attention') releaseStatus = 'uploading_to_broma';

    if (!releaseStatus) return;

    const TERMINAL_STATUSES = new Set(['live', 'rejected', 'removed', 'takedown_requested']);
    const existingRelease = await mongoose.connection.collection('releases').findOne(
      { _id: job.releaseId },
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
      releaseUpdate.rejectReason = metadata.bromaRejectionReason || 'Rejected during moderation';
      releaseUpdate.rejectionReason = releaseUpdate.rejectReason;
      releaseUpdate.rejectedAt = new Date();
    }

    await mongoose.connection.collection('releases').updateOne(
      { _id: job.releaseId },
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
      const context = {
        providerKey: provider.key,
        credentials,
        region: provider.region,
        config: provider.config,
        operation: job.operation,
        jobId,
        jobMetadata: job.metadata || {},
      };
      if (job.operation === 'deliver') {
        result = await connector.deliver(payloadResult.payload, context);
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
      const completionUpdate: Record<string, any> = {
        state: finalState,
        externalId: result.externalId,
        nextRetryAt,
        metadata: {
          ...job.metadata,
          ...connectorMetadata,
          connectorMetadata,
          metadataWarnings: payloadResult.warnings,
        },
        $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '' },
        $push: {
          attempts: {
            attemptNo: job.retryCount + 1,
            status: successLike ? 'success' : 'failed',
            responseCode: successLike ? 'ACCEPTED' : 'FAILED',
            requestHash: hashPayload(payloadResult.payload),
            responseBody: result,
            retryable: finalState === 'failed',
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
      await this.updateReleaseLifecycle(job, finalState, {
        ...job.metadata,
        ...connectorMetadata,
      });
      return DeliveryJob.findById(jobId);
    } catch (error) {
      const latestJob = await DeliveryJob.findById(jobId).select('metadata');
      const latestMetadata = (latestJob?.metadata || job.metadata || {}) as Record<string, any>;
      const message = getErrorMessage(error);
      const statusCode = typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : undefined;
      const responseBody = getProviderErrorResponseBody(error);
      const responseCode = statusCode ? `HTTP_${statusCode}` : undefined;
      const needsAttention = Boolean(statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 401 && statusCode !== 429);
      const retryCount = job.retryCount + 1;
      const shouldRetry = !needsAttention && retryCount <= job.maxRetries;
      const nextRetryAt = shouldRetry ? new Date(Date.now() + BASE_RETRY_DELAY_MS * retryCount) : undefined;

      await DeliveryJob.findByIdAndUpdate(jobId, {
        state: needsAttention ? 'needs_attention' : shouldRetry ? 'queued' : 'failed',
        retryCount,
        nextRetryAt,
        deadLettered: !needsAttention && !shouldRetry,
        errorMessage: message,
        metadata: {
          ...latestMetadata,
          lastProviderError: responseBody,
        },
        $unset: { lockedAt: '', lockedBy: '', lockExpiresAt: '' },
        $push: {
          attempts: {
            attemptNo: retryCount,
            status: 'failed',
            responseCode,
            responseBody,
            errorMessage: message,
            retryable: shouldRetry,
          },
          events: {
            state: needsAttention ? 'needs_attention' : shouldRetry ? 'queued' : 'failed',
            message: needsAttention ? `Broma needs attention: ${message}` : shouldRetry ? `Retry scheduled: ${message}` : `Dead-lettered: ${message}`,
            source: 'system',
          },
        },
      });

      if (needsAttention) {
        await this.updateReleaseLifecycle(job, 'needs_attention', latestMetadata);
      }

      return DeliveryJob.findById(jobId);
    }
  }

  async claimNextDeliveryJob(workerId: string) {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + WORKER_LOCK_MS);
    return DeliveryJob.findOneAndUpdate(
      {
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
      },
      {
        lockedAt: now,
        lockedBy: workerId,
        lockExpiresAt,
      },
      { new: true, sort: { priority: 1, createdAt: 1 } }
    );
  }

  async releaseExpiredLocks() {
    const now = new Date();
    const result = await DeliveryJob.updateMany(
      {
        state: 'processing',
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

  async processDueDeliveryJobs(input: { maxJobs?: number; workerId?: string; dispatchOnly?: boolean } = {}) {
    const workerId = input.workerId || `dsp-worker:${process.pid}:${Date.now()}`;
    const maxJobs = Math.min(50, Math.max(1, input.maxJobs || DEFAULT_WORKER_BATCH_SIZE));
    const expiredLocksReleased = await this.releaseExpiredLocks();
    const processed: Array<{ jobId: string; state: string; error?: string }> = [];

    for (let index = 0; index < maxJobs; index += 1) {
      const job = await this.claimNextDeliveryJob(workerId);
      if (!job) break;
      if (input.dispatchOnly) {
        this.processJobDetached(job._id.toString());
        processed.push({
          jobId: job._id.toString(),
          state: 'processing',
        });
        continue;
      }
      const result = await this.processJob(job._id.toString());
      processed.push({
        jobId: job._id.toString(),
        state: result?.state || 'missing',
        error: result?.errorMessage,
      });
    }

    return { workerId, expiredLocksReleased, processed };
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
    const nextMetadata = {
      ...metadata,
      ...resultMeta,
      bromaAssetId: resultMeta.bromaAssetId ?? metadata.bromaAssetId,
      connectorMetadata: {
        ...(metadata.connectorMetadata || {}),
        ...resultMeta,
      },
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
    await this.updateReleaseLifecycle(job, result.state, nextMetadata);
    return DeliveryJob.findById(jobId);
  }

  async syncBromaReleaseStatuses(input: { releaseIds?: string[]; limit?: number } = {}) {
    const limit = Math.min(300, Math.max(1, input.limit || 150));
    const releaseObjectIds = (input.releaseIds || [])
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const query: Record<string, any> = {
      providerKey: 'broma',
      targetType: 'release',
      $or: [
        { externalId: { $exists: true, $ne: '' } },
        { 'metadata.bromaReleaseId': { $exists: true, $ne: '' } },
      ],
    };
    if (releaseObjectIds.length > 0) query.releaseId = { $in: releaseObjectIds };

    const jobs = await DeliveryJob.find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .select('_id releaseId state externalId metadata');

    const seenReleaseIds = new Set<string>();
    const results: Array<{ jobId: string; releaseId?: string; state?: string; status?: string; error?: string }> = [];

    for (const job of jobs) {
      const releaseId = job.releaseId?.toString();
      if (releaseId && seenReleaseIds.has(releaseId)) continue;
      if (releaseId) seenReleaseIds.add(releaseId);

      try {
        const refreshed = await this.refreshJobStatus(job._id.toString());
        results.push({
          jobId: job._id.toString(),
          releaseId,
          state: refreshed?.state,
          status: (refreshed?.metadata as Record<string, any> | undefined)?.bromaModerationStatus,
        });
      } catch (error) {
        results.push({
          jobId: job._id.toString(),
          releaseId,
          error: getErrorMessage(error),
        });
      }
    }

    return {
      checked: results.length,
      approved: results.filter((item) => item.state === 'delivered').length,
      rejected: results.filter((item) => item.state === 'needs_attention' && item.status === 'rejected').length,
      stillProcessing: results.filter((item) => item.state === 'processing').length,
      failed: results.filter((item) => item.error).length,
      results,
    };
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

  async listJobs(filters: { providerKey?: string; state?: string; page?: number; limit?: number }) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const query: Record<string, unknown> = {};
    query.hiddenFromOps = { $ne: true };
    query['metadata.resetForApproval'] = { $ne: true };
    if (filters.providerKey) query.providerKey = filters.providerKey;

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

    const [result] = await DeliveryJob.aggregate(pipeline);
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
