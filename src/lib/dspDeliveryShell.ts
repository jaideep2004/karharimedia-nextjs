import crypto from 'crypto';
import { Db, ObjectId } from 'mongodb';
import { validateReleaseAssetsForDelivery } from './dspAssetReadiness';
import { evaluateBromaReleaseReadiness } from './bromaDeliveryReadiness';
import { hydrateReleasesWithCanonicalTracks } from '@/lib/repositories/tracks';
import { releasesCollection } from '@/lib/repositories/releases';
import { ALL_DSP_KEYS } from '@/lib/platforms';

type ReleaseDoc = Record<string, any> & {
  _id: ObjectId;
  releaseTitle?: string;
  title?: string;
  stores?: string[];
  tracks?: Array<Record<string, any>>;
};

type AssetReadiness = Awaited<ReturnType<typeof validateReleaseAssetsForDelivery>>;
type BromaReadiness = Awaited<ReturnType<typeof evaluateBromaReleaseReadiness>>;

type CreateReleaseDeliveryShellOptions = {
  assetReadiness?: AssetReadiness;
  bromaReadiness?: BromaReadiness;
  defaultCreatedCountryId?: unknown;
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: unknown) =>
  crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

const firstString = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();

const BROMA_COUNTRY_CODE_IDS: Record<string, number> = {
  IN: 32,
};

const bromaDictionaryId = (value: unknown, codeMap: Record<string, number>) => {
  const text = firstString(value);
  if (!text) return undefined;
  const numeric = Number(text);
  if (Number.isInteger(numeric)) return numeric;
  return codeMap[text.toUpperCase()];
};

function releaseRightsholder(release: Record<string, any>) {
  return firstString(
    release.label,
    release.metadata?.label,
    release.recordLabel,
    release.metadata?.recordLabel,
    release.rightsholder,
    release.rightsHolder,
    release.metadata?.rightsholder,
    release.metadata?.rightsHolder,
    release.ownerLabel,
    release.labelName,
    release.ownerName,
    release.primaryArtist,
    release.artist,
    release.artistName
  );
}

function producerRightsholder(track: Record<string, any>, release: Record<string, any>, fallback?: string) {
  return firstString(
    track.producer,
    track.producers,
    track.metadata?.producer,
    track.metadata?.producers,
    track.rightsholder,
    track.rightsHolder,
    track.label,
    release.producer,
    release.producers,
    release.metadata?.producer,
    release.metadata?.producers,
    fallback
  );
}

function buildSnapshot(
  release: ReleaseDoc,
  providerKeys: string[],
  createdBy?: string,
  options: { defaultCreatedCountryId?: unknown } = {}
) {
  const tracks = Array.isArray(release.tracks) ? release.tracks : [];
  const assetChecks = release.deliveryAssetReadiness?.checks || [];
  const bromaReadiness = release.bromaReadiness || {};
  const releaseGenre = release.genre || release.metadata?.genre || tracks[0]?.genre || tracks[0]?.metadata?.genre;
  const rightsholder = releaseRightsholder(release);
  const createdCountryValue =
    release.createdCountryId ||
    release.created_country_id ||
    release.creationCountryId ||
    release.metadata?.createdCountryId ||
    release.metadata?.created_country_id ||
    options.defaultCreatedCountryId;
  const createdCountryId = bromaDictionaryId(createdCountryValue, BROMA_COUNTRY_CODE_IDS) ?? createdCountryValue;
  const catalogNumber = release.catalogNumber || release.catalog_number || release.upc || release._id.toString();
  const payload = {
    releaseId: release._id.toString(),
    releaseTitle: release.releaseTitle || release.title || 'Untitled release',
    upc: release.upc,
    primaryArtist: release.primaryArtist || release.artist || release.artistName,
    label: rightsholder,
    genre: releaseGenre,
    language: release.language,
    releaseDate: release.releaseDate,
    stores: Array.isArray(release.stores) ? release.stores : [],
    tracks: tracks.map((track) => ({
      id: String(track._id || track.id || track.isrc || track.title || ''),
      title: track.title,
      artistName: track.artistName || track.primaryArtist || release.primaryArtist,
      version: track.version || track.subtitle || track.metadata?.version || track.metadata?.subtitle,
      isrc: track.isrc,
      upc: track.upc || release.upc,
      genre: track.genre,
      explicit: track.explicit,
      releaseDate: track.releaseDate || release.releaseDate,
      audioFile: track.audioFile || track.audioUrl || track.fileUrl,
      artwork: track.artwork || track.artworkUrl || release.artwork || release.artworkUrl || release.coverArt,
      duration: track.duration,
      contributors: track.contributors || track.rightsHolders || [],
      composers: track.composers || [],
      lyricists: track.lyricists || [],
      publishers: track.publishers || [],
      metadata: {
        subtitle: track.subtitle || track.metadata?.subtitle,
        version: track.version || track.metadata?.version,
        catalogNumber: track.catalogNumber || track.catalog_number || catalogNumber,
        createdDate: track.createdDate || track.created_date,
        originalReleaseDate: track.originalReleaseDate || track.original_release_date || release.originalReleaseDate || release.original_release_date,
        createdCountryId: track.createdCountryId || track.created_country_id || createdCountryId,
        producer: producerRightsholder(track, release, rightsholder),
        featuredArtist: track.featuredArtist || track.featuring || track.metadata?.featuredArtist || track.metadata?.featuring,
        label: rightsholder,
      },
    })),
    territories: release.territories || ['WORLD'],
    assetChecks: assetChecks.map((check: any) => ({
      kind: check.kind,
      owner: check.owner,
      value: check.value,
      sizeBytes: check.sizeBytes,
      checksumSha256: check.checksumSha256,
    })),
    metadata: {
      artwork: release.artwork || release.artworkUrl || release.coverArt,
      releaseType: release.releaseType,
      catalogNumber,
      createdDate: release.createdDate || release.created_date,
      originalReleaseDate: release.originalReleaseDate || release.original_release_date,
      createdCountryId,
      producer: release.producer || release.producers || release.metadata?.producer || release.metadata?.producers || rightsholder,
      featuring: release.featuring || release.metadata?.featuring,
      pline: release.pline || release.pLine,
      cline: release.cline || release.cLine,
      bromaOutletIds: bromaReadiness.outletIds || [],
      bromaOutletMappings: bromaReadiness.outletMappings || [],
    },
  };

  return {
    releaseId: release._id,
    version: 1,
    providerKeys,
    payload,
    payloadHash: sha256(payload),
    createdBy,
    createdAt: new Date(),
  };
}

function evaluateNativeProviderReadiness(provider: any) {
  if (!provider || provider.enabled === false || provider.maintenanceMode) {
    return { state: 'paused', canDispatch: false, missing: [] };
  }

  const integrationMode = provider.integrationMode || provider.config?.integrationMode || 'shell';
  if (integrationMode === 'shell') {
    return {
      state: 'shell_ready',
      canDispatch: false,
      missing: ['partner_contract', 'credentials', 'delivery_endpoint', 'webhook_secret'],
    };
  }

  const config = provider.config || {};
  const hasEncryptedCredential = (key: string) =>
    Boolean(provider.credentials?.__encrypted && provider.credentials?.values?.[key]);
  const requiredConfig = provider.key === 'mock_dsp'
    ? ['webhookSecret']
    : provider.key === 'broma'
      ? ['baseUrl', 'accountId', 'createdCountryId']
      : ['baseUrl', 'webhookSecret'];
  const requiredCredentials = provider.key === 'broma' ? ['email', 'password'] : [];
  const missing = [
    ...requiredConfig.filter((key) => {
      if (key === 'webhookSecret') return !config[key] && !hasEncryptedCredential('webhookSecret');
      return !config[key];
    }),
    ...requiredCredentials.filter((key) => !hasEncryptedCredential(key)),
  ];
  if (missing.length > 0) {
    return { state: 'missing_credentials', canDispatch: false, missing };
  }
  if (provider.key === 'broma' && bromaDictionaryId(config.createdCountryId, BROMA_COUNTRY_CODE_IDS) === undefined) {
    return { state: 'missing_credentials', canDispatch: false, missing: ['createdCountryId'] };
  }

  return {
    state: integrationMode === 'live' ? 'live_ready' : 'sandbox_ready',
    canDispatch: true,
    missing: [],
  };
}

export async function createReleaseDeliveryShellJobs(
  db: Db,
  release: ReleaseDoc,
  createdBy?: string,
  options: CreateReleaseDeliveryShellOptions = {}
) {
  const [releaseForDelivery] = await hydrateReleasesWithCanonicalTracks(db, [release]);
  release = releaseForDelivery;
  const rawStores = Array.isArray(release.stores) ? release.stores : [];
  if (rawStores.length === 0) {
    return { snapshotId: null, jobsCreated: 0, providerKeys: [], blocked: true };
  }
  const providerKeys = ['broma'];
  const bromaProvider = await db.collection('dspproviders').findOne({ key: 'broma' });
  const defaultCreatedCountryId = options.defaultCreatedCountryId ?? bromaProvider?.config?.createdCountryId;

  const bromaReadiness =
    options.bromaReadiness ?? (await evaluateBromaReleaseReadiness(db, release, { defaultCreatedCountryId }));
  const assetReadiness =
    options.assetReadiness ?? bromaReadiness.assetReadiness ?? (await validateReleaseAssetsForDelivery(release));
  await releasesCollection(db).updateOne(
    { _id: release._id },
    {
      $set: {
        deliveryAssetReadiness: assetReadiness,
        bromaReadiness,
        deliveryReadinessCheckedAt: new Date(),
      },
    }
  );

  if (!assetReadiness.ok || !bromaReadiness.ok) {
    return {
      snapshotId: null,
      jobsCreated: 0,
      providerKeys,
      blocked: true,
      assetReadiness,
      bromaReadiness,
    };
  }

  release.deliveryAssetReadiness = assetReadiness;
  release.bromaReadiness = bromaReadiness;
  const snapshot = buildSnapshot(release, providerKeys, createdBy, { defaultCreatedCountryId });
  const snapshotResult = await db.collection('releaseDeliverySnapshots').insertOne(snapshot);
  const providers = bromaProvider ? [bromaProvider] : [];
  const providerMap = new Map(providers.map((provider) => [provider.key, provider]));
  const now = new Date();

  const jobs = providerKeys.map((providerKey) => {
    const provider = providerMap.get(providerKey);
    const readiness = evaluateNativeProviderReadiness(provider);
    const state = readiness.canDispatch ? 'queued' : 'needs_attention';
    const idempotencyKey = sha256({
      releaseId: release._id.toString(),
      providerKey,
      operation: 'deliver',
      payloadHash: snapshot.payloadHash,
    });

    return {
      targetType: 'release',
      releaseId: release._id,
      snapshotId: snapshotResult.insertedId,
      providerKey,
      operation: 'deliver',
      state,
      priority: 5,
      idempotencyKey,
      maxRetries: 5,
      retryCount: 0,
      nextRetryAt: now,
      deadLettered: false,
      metadata: {
        releaseTitle: snapshot.payload.releaseTitle,
        payloadHash: snapshot.payloadHash,
        bromaStep: 'create_release',
        bromaOutletIds: bromaReadiness.outletIds,
        bromaOutletMappings: bromaReadiness.outletMappings,
        expandToAllOutlets: ALL_DSP_KEYS.every((key) => rawStores.includes(key)),
        readiness,
        deliverySnapshot: {
          upc: snapshot.payload.upc,
          trackCount: snapshot.payload.tracks.length,
        },
      },
      errorMessage: readiness.canDispatch ? undefined : `Provider not ready: ${readiness.state}`,
      attempts: [],
      events: [
        {
          state,
          message: readiness.canDispatch
            ? 'Release delivery job created from approval snapshot'
            : `Release delivery shell waiting for: ${readiness.missing.join(', ') || readiness.state}`,
          source: 'system',
          createdAt: now,
        },
      ],
      createdBy: createdBy && ObjectId.isValid(createdBy) ? new ObjectId(createdBy) : undefined,
      createdAt: now,
      updatedAt: now,
    };
  });

  if (jobs.length > 0) {
    await db.collection('deliveryjobs').bulkWrite(
      jobs.map((job) => ({
        updateOne: {
          filter: {
            idempotencyKey: job.idempotencyKey,
            state: { $in: ['cancelled', 'failed', 'needs_attention'] },
            'metadata.resetForApproval': true,
          },
          update: {
            $set: {
              targetType: job.targetType,
              releaseId: job.releaseId,
              snapshotId: job.snapshotId,
              providerKey: job.providerKey,
              operation: job.operation,
              state: job.state,
              priority: job.priority,
              maxRetries: job.maxRetries,
              retryCount: 0,
              nextRetryAt: now,
              deadLettered: false,
              metadata: {
                ...job.metadata,
                resetForApproval: false,
                requeuedFromApprovalAt: now.toISOString(),
              },
              errorMessage: job.errorMessage,
              updatedAt: now,
            },
            $unset: {
              lockedAt: '',
              lockedBy: '',
              lockExpiresAt: '',
            },
            $push: {
              events: {
                state: job.state,
                message: 'Release delivery job requeued from admin approval',
                source: 'system',
                createdAt: now,
              },
            },
          },
        },
      })) as any[]
    );

    await db.collection('deliveryjobs').bulkWrite(
      jobs.map((job) => ({
        updateOne: {
          filter: { idempotencyKey: job.idempotencyKey },
          update: { $setOnInsert: job },
          upsert: true,
        },
      }))
    );
  }

  return { snapshotId: snapshotResult.insertedId, jobsCreated: jobs.length, providerKeys };
}
