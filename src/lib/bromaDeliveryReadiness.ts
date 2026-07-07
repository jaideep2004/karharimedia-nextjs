import { Db } from 'mongodb';
import { validateReleaseAssetsForDelivery } from './dspAssetReadiness';

type ReleaseLike = Record<string, any> & {
  stores?: string[];
  tracks?: Array<Record<string, any>>;
};

type BromaReadiness = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  outletIds: string[];
  outletMappings: Array<{ store: string; outletId: string; name: string }>;
  assetReadiness: Awaited<ReturnType<typeof validateReleaseAssetsForDelivery>>;
};

type BromaReadinessOptions = {
  defaultCreatedCountryId?: unknown;
};

const STORE_ALIASES: Record<string, string[]> = {
  'acr cloud': ['acr cloud'],
  'acr-cloud': ['acr cloud'],
  amazon: ['amazon music'],
  apple: ['apple music itunes', 'itunes'],
  boom: ['boomplay'],
  facebook: ['facebook instagram oculus'], 
  'facebook delivery': ['facebook instagram oculus'],
  'facebook-delivery': ['facebook instagram oculus'],
  'facebook rights management': ['facebook instagram oculus'],
  'facebook-rights-management': ['facebook instagram oculus'],
  flo: ['flo dsp'],
  iheartradio: ['iheart radio'],
  instagram: ['facebook instagram oculus'],
  kugou: ['qq music kugou kuwo wesing'],
  kuwo: ['qq music kugou kuwo wesing'],
  netease: ['netease cloud music'],
  pandora: ['pandora dsp'],
  snap: ['canva roxi soundtrack your brand turntable snap coda music'],
  snapchat: ['canva roxi soundtrack your brand turntable snap coda music'],
  tencent: ['qq music kugou kuwo wesing'],
  tidal: ['tidal music'],
  tiktok: ['tiktok branded as dou yin in china'],
  vk: ['vk music odnoklassniki music'],
  yandex: ['yandex music'],
  youtube: ['youtube youtube music'],
  'youtube delivery': ['youtube youtube music'],
  'youtube-delivery': ['youtube youtube music'],
  'youtube music': ['youtube youtube music'],
};

const normalize = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const candidateOutletKeys = (store: string) => {
  const normalized = normalize(store);
  return Array.from(new Set([normalized, ...(STORE_ALIASES[normalized] || []).map(normalize)])).filter(Boolean);
};

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

const hasBromaDictionaryId = (value: unknown, codeMap: Record<string, number>) =>
  bromaDictionaryId(value, codeMap) !== undefined;

function getContributors(track: Record<string, any>) {
  const values = [
    track.contributors,
    track.composers,
    track.lyricists,
    track.publishers,
    track.rightsHolders,
    track.metadata?.contributors,
    track.metadata?.composers,
  ];
  return values.flatMap((value) => (Array.isArray(value) ? value : []));
}

function getContributorShare(contributor: Record<string, any>) {
  const raw = contributor.share ?? contributor.percentage ?? contributor.ownership ?? contributor.split;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function hasContributorShare(contributor: Record<string, any>) {
  return ['share', 'percentage', 'ownership', 'split'].some((key) => contributor[key] !== undefined && contributor[key] !== null && contributor[key] !== '');
}

function hasRole(contributors: Array<Record<string, any>>, names: string[]) {
  return contributors.some((contributor) => {
    const role = normalize(contributor.role || contributor.type || contributor.category);
    return names.some((name) => role.includes(name));
  });
}

function releaseRightsholder(release: Record<string, any>) {
  return firstString(
    release.label,
    release.metadata?.label,
    release.recordLabel,
    release.metadata?.recordLabel,
    release.rightsholder,
    release.rightsHolder,
    release.rightsHolders,
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

function trackProducerRightsholder(
  track: Record<string, any>,
  release: Record<string, any>,
  fallbackRightsholder?: string
) {
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
    fallbackRightsholder
  );
}

async function mapOutlets(db: Db, stores: string[]) {
  const candidateKeys = Array.from(new Set(stores.flatMap(candidateOutletKeys)));
  if (!candidateKeys.length) return { mappings: [], missing: stores };

  const docs = await db
    .collection('bromaOutlets')
    .find({
      active: true,
      $or: [
        { normalizedName: { $in: candidateKeys } },
        { aliases: { $in: candidateKeys } },
      ],
    })
    .toArray();

  const byKey = new Map<string, any>();
  docs.forEach((doc) => {
    byKey.set(doc.normalizedName, doc);
    (doc.aliases || []).forEach((alias: string) => byKey.set(alias, doc));
  });

  const mappings = stores.flatMap((store) => {
    const doc = candidateOutletKeys(store).map((key) => byKey.get(key)).find(Boolean);
    return doc ? [{ store, outletId: String(doc.outletId), name: String(doc.name || store) }] : [];
  });
  const mappedStores = new Set(mappings.map((mapping) => normalize(mapping.store)));
  const missing = stores.filter((store) => !mappedStores.has(normalize(store)));
  return { mappings, missing };
}

function validateTrackComposition(track: Record<string, any>, index: number) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const contributors = getContributors(track).filter(
    (contributor): contributor is Record<string, any> => contributor && typeof contributor === 'object'
  );

  if (!contributors.length) {
    errors.push(`Track ${index + 1}: composition/contributor data is required`);
    return { errors, warnings };
  }

  if (!hasRole(contributors, ['composer', 'author', 'writer', 'c/a', 'ca'])) {
    errors.push(`Track ${index + 1}: composer/author contributor is required`);
  }

  const hasShares = contributors.some(hasContributorShare);
  const totalShare = contributors.reduce((sum, contributor) => sum + (getContributorShare(contributor) || 0), 0);
  if (hasShares && Math.abs(totalShare - 100) > 0.01) {
    errors.push(`Track ${index + 1}: contributor ownership shares must total 100%`);
  } else if (!hasShares) {
    warnings.push(`Track ${index + 1}: contributor ownership shares not provided`);
  }

  return { errors, warnings };
}

export async function evaluateBromaReleaseReadiness(
  db: Db,
  release: ReleaseLike,
  options: BromaReadinessOptions = {}
): Promise<BromaReadiness> {
  const tracks = Array.isArray(release.tracks) ? release.tracks : [];
  const stores = Array.isArray(release.stores) ? release.stores.filter(Boolean) : [];
  const assetReadiness = await validateReleaseAssetsForDelivery(release);
  const errors: string[] = [...assetReadiness.errors];
  const warnings: string[] = [...assetReadiness.warnings];
  const releaseGenre = firstString(release.genre, release.metadata?.genre, tracks[0]?.genre, tracks[0]?.metadata?.genre);
  const releaseRightsholderName = releaseRightsholder(release);
  const createdCountryId = firstString(
    release.createdCountryId,
    release.created_country_id,
    release.creationCountryId,
    release.metadata?.createdCountryId,
    release.metadata?.created_country_id,
    options.defaultCreatedCountryId
  );
  const catalogNumber = firstString(release.catalogNumber, release.catalog_number, release.upc, release.ean, release._id);

  if (!firstString(release.releaseTitle, release.title)) errors.push('Release title is required');
  if (!firstString(release.primaryArtist, release.artist, release.artistName)) errors.push('Primary artist is required');
  if (!firstString(release.upc, release.ean)) errors.push('UPC/EAN is required');
  if (!releaseGenre) errors.push('Release genre is required');
  if (!firstString(release.releaseDate, release.originalReleaseDate)) errors.push('Release date is required');
  if (!createdCountryId) errors.push('Broma creation country is required');
  else if (!hasBromaDictionaryId(createdCountryId, BROMA_COUNTRY_CODE_IDS)) errors.push('Broma creation country must be a numeric dictionary id');
  if (!catalogNumber) errors.push('Broma catalog number or automatic catalog generation is required');
  if (!releaseRightsholderName) errors.push('Release label/rightsholder is required');
  if (!tracks.length) errors.push('At least one track is required');

  if (tracks.length === 1 && String(release.releaseType || '').toLowerCase().includes('album')) {
    errors.push('Album release type requires at least two tracks');
  }
  if (tracks.length === 1 && String(release.releaseType || release.metadata?.releaseType || '').toLowerCase().includes('ep')) {
    warnings.push('Broma will deliver one-track EP releases as single releases because Broma EP requires 2-7 tracks');
  }
  if (tracks.length > 40) errors.push('Broma album/compilation releases support at most 40 tracks');

  tracks.forEach((track, index) => {
    if (!firstString(track.title, track.name)) errors.push(`Track ${index + 1}: title is required`);
    if (!firstString(track.artistName, track.primaryArtist, release.primaryArtist)) {
      errors.push(`Track ${index + 1}: artist is required`);
    }
    if (!firstString(track.genre, releaseGenre)) errors.push(`Track ${index + 1}: genre is required`);
    if (!firstString(track.isrc)) errors.push(`Track ${index + 1}: ISRC is required`);
    if (!firstString(track.audioFile, track.audioUrl, track.fileUrl)) errors.push(`Track ${index + 1}: audio is required`);
    if (!firstString(track.createdCountryId, track.created_country_id, createdCountryId)) {
      errors.push(`Track ${index + 1}: Broma creation country is required`);
    } else if (!hasBromaDictionaryId(firstString(track.createdCountryId, track.created_country_id, createdCountryId), BROMA_COUNTRY_CODE_IDS)) {
      errors.push(`Track ${index + 1}: Broma creation country must be a numeric dictionary id`);
    }
    if (!firstString(track.catalogNumber, track.catalog_number, release.catalogNumber, release.catalog_number, release.upc, release._id)) {
      errors.push(`Track ${index + 1}: Broma catalog number or automatic catalog generation is required`);
    }
    if (!trackProducerRightsholder(track, release, releaseRightsholderName)) {
      errors.push(`Track ${index + 1}: producer/rightsholder is required`);
    }
    const compositionReadiness = validateTrackComposition(track, index);
    errors.push(...compositionReadiness.errors);
    warnings.push(...compositionReadiness.warnings);
  });

  const outletResult = await mapOutlets(db, stores);
  if (!stores.length) errors.push('At least one DSP outlet must be selected');
  else if (!outletResult.mappings.length) errors.push('No selected DSP outlets are available in Broma');
  outletResult.missing.forEach((store) => {
    warnings.push(`Broma outlet mapping missing or inactive for "${store}"`);
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    outletIds: Array.from(new Set(outletResult.mappings.map((mapping) => mapping.outletId))),
    outletMappings: outletResult.mappings,
    assetReadiness,
  };
}

export async function assertBromaReleaseReady(db: Db, release: ReleaseLike, options: BromaReadinessOptions = {}) {
  const readiness = await evaluateBromaReleaseReadiness(db, release, options);
  if (!readiness.ok) {
    const error = new Error(`Broma readiness failed: ${readiness.errors.join('; ')}`);
    (error as any).statusCode = 422;
    (error as any).readiness = readiness;
    throw error;
  }
  return readiness;
}
