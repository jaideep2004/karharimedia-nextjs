import { BaseDspConnector } from './baseConnector';
import { BromaClient } from './bromaClient';
import { DspCapability, DspConnectorContext, DspDeliveryPayload, DspDeliveryResult, DspReleasePayload, DspTrackPayload } from '../../../types/dsp';
import DeliveryJob from '../../../models/deliveryJob.model';
import {
  BROMA_DELIVERED_STATUSES,
  BROMA_REJECTED_STATUSES,
  BROMA_MODERATION_STATUSES,
  BROMA_DSP_PROCESSING_STATUSES,
} from '../../../config/constants';

type BromaStep =
  | 'create_release'
  | 'upload_recordings'
  | 'update_recordings'
  | 'add_compositions'
  | 'upload_cover'
  | 'update_distribution'
  | 'send_moderation'
  | 'poll_status'
  | 'done';

const STEP_ORDER: BromaStep[] = [
  'create_release',
  'upload_recordings',
  'update_recordings',
  'add_compositions',
  'upload_cover',
  'update_distribution',
  'send_moderation',
  'poll_status',
  'done',
];

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const normalizeBromaStatus = (value: unknown) =>
  (firstString(value) || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const firstBromaReleaseStatus = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = normalizeBromaStatus(value);
    if (normalized && normalized !== 'ok') return normalized;
  }
  return '';
};


type BromaStatusSnapshot = {
  normalized: string;
  source: 'release_detail' | 'asset_list';
  releaseDetail: any;
  assetRow?: any;
  rejectionReason?: string;
};

const collectBromaAssetRows = (response: unknown): any[] => {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== 'object') return [];
  const value = response as Record<string, any>;
  return [value.data, value.items, value.results]
    .flatMap((entry) => collectBromaAssetRows(entry))
    .filter(Boolean);
};

const normalizeMatchText = (value: unknown) =>
  firstString(value)?.toLowerCase().replace(/\s+/g, ' ').trim() || '';

const getBromaAssetStatus = (asset: any) =>
  chooseBromaStatus(
    asset?.moderation_status,
    asset?.moderationStatus,
    asset?.release_status,
    asset?.status,
    ...(Array.isArray(asset?.statuses) ? asset.statuses : [])
  );

function chooseBromaStatus(...values: unknown[]) {
  const normalized = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map(normalizeBromaStatus)
    .filter((value) => value && value !== 'ok');
  return (
    normalized.find((value) => BROMA_REJECTED_STATUSES.has(value)) ||
    normalized.find((value) => BROMA_DELIVERED_STATUSES.has(value)) ||
    normalized[0] ||
    ''
  );
}

const findBromaAssetRow = (rows: any[], detail: any, assetId?: string) => {
  if (assetId) {
    const exact = rows.find((row) => String(row?.id) === assetId);
    if (exact) return exact;
  }

  const ean = firstString(detail?.ean, detail?.upc, detail?.catalogue_number);
  if (ean) {
    const exact = rows.find((row) => firstString(row?.ean, row?.upc, row?.catalogue_number) === ean);
    if (exact) return exact;
  }

  const title = normalizeMatchText(detail?.title);
  const releaseTypeId = firstString(detail?.release_type_id, detail?.releaseTypeId);
  if (title && releaseTypeId) {
    const exact = rows.find(
      (row) =>
        normalizeMatchText(row?.title) === title &&
        firstString(row?.release_type_id, row?.releaseTypeId) === releaseTypeId
    );
    if (exact) return exact;
  }

  if (title) return rows.find((row) => normalizeMatchText(row?.title) === title);
  return rows[0];
};

const getBromaRejectionReason = (detail: any, response: any, asset?: any) =>
  firstString(
    asset?.reject_reason,
    asset?.rejection_reason,
    asset?.rejected_reason,
    asset?.moderation_comment,
    asset?.comment,
    asset?.message,
    detail?.reject_reason,
    detail?.rejection_reason,
    detail?.rejected_reason,
    detail?.moderation_comment,
    detail?.comment,
    detail?.message,
    response?.message
  );

const cleanBromaUserReason = (value: unknown) => {
  const text = firstString(value);
  if (!text) return undefined;
  const cleaned = text
    .replace(/^broma\s*status\s*:\s*/i, '')
    .replace(/^broma\s+/i, '')
    .trim();
  if (!cleaned || cleaned.toLowerCase() === 'rejected') return undefined;
  return cleaned;
};

const collectBromaModerationReasons = (moderation: any) => {
  const reasons = Array.isArray(moderation?.data?.reason)
    ? moderation.data.reason
    : Array.isArray(moderation?.reason)
      ? moderation.reason
      : [];
  const messages: string[] = [];

  for (const reason of reasons) {
    const categories = reason?.categories;
    if (!categories || typeof categories !== 'object') continue;
    for (const entries of Object.values(categories)) {
      const list = Array.isArray(entries) ? entries : [entries];
      for (const entry of list) {
        const text = cleanBromaUserReason(
          typeof entry === 'object' && entry
            ? firstString((entry as any).title_en, (entry as any).title, (entry as any).message, (entry as any).value)
            : entry
        );
        if (text) messages.push(text);
      }
    }
  }

  return Array.from(new Set(messages)).join('; ') || undefined;
};

const fetchBromaStatusSnapshot = async (
  client: BromaClient,
  releaseId: string,
  config: Record<string, unknown>,
  jobMetadata?: Record<string, unknown>
): Promise<BromaStatusSnapshot> => {
  const response = await client.getRelease(releaseId);
  const detail = response?.data || response || {};
  let normalized = firstBromaReleaseStatus(
    response?.moderation_status,
    response?.moderationStatus,
    response?.release_status,
    response?.state,
    detail?.moderation_status,
    detail?.moderationStatus,
    detail?.release_status,
    detail?.status,
    detail?.state
  );
  let source: BromaStatusSnapshot['source'] = 'release_detail';
  let assetRow: any;

  const storedAssetId = firstString(jobMetadata?.bromaAssetId);
  const accountId = firstString(config.accountId, config.account_id);
  const search = firstString(detail?.ean, detail?.upc, detail?.catalogue_number, detail?.title);
  if (accountId && (search || storedAssetId)) {
    const assets = await client.getAccountReleaseAssets(accountId, {
      search,
      page: 1,
      limit: 10,
    });
    assetRow = findBromaAssetRow(collectBromaAssetRows(assets), detail, storedAssetId);
    const assetStatus = getBromaAssetStatus(assetRow);
    if (assetStatus) {
      normalized = assetStatus;
      source = 'asset_list';
    }
  }

  let rejectionReason = cleanBromaUserReason(getBromaRejectionReason(detail, response, assetRow));
  if (BROMA_REJECTED_STATUSES.has(normalized) && accountId && assetRow?.id) {
    try {
      const moderation = await client.getReleaseModeration(accountId, assetRow.id);
      rejectionReason = collectBromaModerationReasons(moderation) || rejectionReason;
    } catch {
      // Status sync must not fail only because moderation details are temporarily unavailable.
    }
  }

  return {
    normalized,
    source,
    releaseDetail: detail,
    assetRow,
    rejectionReason,
  };
};

const getResponseId = (response: any) =>
  String(response?.data?.id || response?.data?.release_id || response?.id || response?.release_id || '');

const splitListText = (value: string) =>
  value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const bromaStringList = (...values: unknown[]) =>
  Array.from(
    new Set(
      values.flatMap((value): string[] => {
        if (Array.isArray(value)) return value.flatMap((item) => bromaStringList(item));
        if (value && typeof value === 'object') {
          const named = firstString(
            (value as any).name,
            (value as any).title,
            (value as any).value,
            (value as any).label
          );
          return named ? splitListText(named) : [];
        }
        const text = firstString(value);
        return text ? splitListText(text) : [];
      })
    )
  );

const bromaArtists = (...values: unknown[]) => bromaStringList(...values);

const bromaGenres = (...values: unknown[]) => bromaStringList(...values).slice(0, 3);

const bromaRecordingTitle = (payload: DspReleasePayload, track: DspReleasePayload['tracks'][number]) =>
  payload.tracks.length === 1 ? payload.releaseTitle : track.title;

const AUTHOR_ROLES = ['A', 'C', 'CA', 'AR', 'AD', 'TR'] as const;
type BromaAuthorRole = typeof AUTHOR_ROLES[number];

type BromaCompositionContributor = {
  title: string;
  ownership: string;
  roles: BromaAuthorRole[];
  controlled_by_submitter: 0 | 1;
  publisher?: string;
  publisher_share?: string;
  contributor_author_id?: string;
};

type BromaReleaseTypeOption = {
  id: number;
  title: string;
  min?: number;
  max?: number;
};

type BromaOutletMapping = {
  store?: string;
  outletId?: string;
  name?: string;
};

const BROMA_COUNTRY_CODE_IDS: Record<string, number> = {
  IN: 32,
};

const BROMA_LANGUAGE_CODE_IDS: Record<string, number> = {
  EN: 40,
  HI: 59,
};

const DEFAULT_BROMA_RELEASE_TYPE_ID = 51;

const toDateOnly = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = firstString(value);
  if (!text) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
};

const todayDateOnly = () => new Date().toISOString().slice(0, 10);

const nonFutureDateOnly = (...values: unknown[]) => {
  const today = todayDateOnly();
  const date = values.map(toDateOnly).find((entry): entry is string => Boolean(entry));
  if (!date) return today;
  return date <= today ? date : today;
};

const addDaysDateOnly = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

const minFutureDateOnly = (minDaysFromToday: number, ...values: unknown[]) => {
  const minDate = addDaysDateOnly(new Date(), minDaysFromToday);
  const date = values.map(toDateOnly).find((entry): entry is string => Boolean(entry));
  if (!date) return minDate;
  return date >= minDate ? date : minDate;
};

const bromaInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
};

const bromaDictionaryId = (value: unknown, codeMap: Record<string, number>) => {
  const numeric = bromaInteger(value);
  if (numeric !== undefined) return numeric;
  const code = firstString(value)?.toUpperCase();
  if (!code) return undefined;
  return codeMap[code];
};

const requireBromaInteger = (value: unknown, label: string) => {
  const parsed = bromaInteger(value);
  if (parsed === undefined) throw new Error(`${label} must be a numeric Broma dictionary id`);
  return parsed;
};

const requireBromaString = (value: unknown, label: string) => {
  const text = firstString(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
};

const requireBromaDictionaryId = (value: unknown, label: string, codeMap: Record<string, number>) => {
  const parsed = bromaDictionaryId(value, codeMap);
  if (parsed === undefined) throw new Error(`${label} must be a numeric Broma dictionary id`);
  return parsed;
};

const payloadRightsholder = (payload: DspReleasePayload) =>
  firstString(
    payload.label,
    payload.metadata?.label,
    payload.metadata?.partyId,
    payload.metadata?.party_id,
    payload.metadata?.partyName,
    payload.metadata?.recordLabel,
    payload.metadata?.rightsholder,
    payload.metadata?.rightsHolder,
    payload.metadata?.producer,
    payload.primaryArtist,
    payload.releaseTitle
  );

const trackProducerRightsholder = (
  payload: DspReleasePayload,
  track: DspReleasePayload['tracks'][number]
) =>
  firstString(
    track.metadata?.producer,
    track.metadata?.producers,
    track.metadata?.rightsholder,
    track.metadata?.rightsHolder,
    track.metadata?.label,
    payload.metadata?.producer,
    payload.metadata?.producers,
    payloadRightsholder(payload),
    track.artistName,
    payload.primaryArtist
  );

const createdCountryId = (payload: DspReleasePayload, config: Record<string, unknown>, track?: DspReleasePayload['tracks'][number]) =>
  requireBromaDictionaryId(
    firstString(
      track?.metadata?.createdCountryId,
      track?.metadata?.created_country_id,
      payload.metadata?.createdCountryId,
      payload.metadata?.created_country_id,
      payload.metadata?.creationCountryId,
      config.createdCountryId,
      config.defaultCreatedCountryId
    ),
    'Broma created_country_id',
    BROMA_COUNTRY_CODE_IDS
  );

const languageId = (payload: DspReleasePayload, config: Record<string, unknown>, track: DspReleasePayload['tracks'][number]) =>
  requireBromaDictionaryId(
    firstString(
      track.metadata?.languageId,
      track.metadata?.language_id,
      track.language,
      payload.metadata?.languageId,
      payload.metadata?.language_id,
      payload.language,
      config.defaultLanguageId,
      config.defaultLanguageCode,
      'EN'
    ),
    'Broma language',
    BROMA_LANGUAGE_CODE_IDS
  );

const catalogNumber = (payload: DspReleasePayload, track?: DspReleasePayload['tracks'][number]) =>
  firstString(
    track?.metadata?.catalogNumber,
    track?.metadata?.catalog_number,
    payload.metadata?.catalogNumber,
    payload.metadata?.catalog_number,
    track?.upc,
    payload.upc,
    payload.releaseId
  );

const normalizeDictionaryText = (value: unknown) =>
  firstString(value)?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || '';

const releaseTypeKey = (payload: DspReleasePayload) => {
  const explicit = firstString(payload.metadata?.bromaReleaseType, payload.metadata?.releaseType)?.toLowerCase();
  if (explicit?.includes('album')) return 'album';
  if (explicit?.includes('ep')) return 'ep';
  if (explicit?.includes('single')) return 'single';
  if (payload.tracks.length === 1) return 'single';
  if (payload.tracks.length <= 7) return 'ep';
  return 'album';
};

const configuredReleaseTypeId = (payload: DspReleasePayload, config: Record<string, unknown>) => {
  const key = releaseTypeKey(payload);
  const configured = config.releaseTypeIds as Record<string, unknown> | undefined;
  const releaseMetadata = payload.metadata || {};
  const candidates = [
    releaseMetadata.bromaReleaseTypeId,
    releaseMetadata.release_type_id,
    releaseMetadata.releaseTypeId,
    configured?.[key],
    key === 'single' ? config.defaultSingleReleaseTypeId : undefined,
    key === 'ep' ? config.defaultEpReleaseTypeId : undefined,
    key === 'album' ? config.defaultAlbumReleaseTypeId : undefined,
    config.defaultReleaseTypeId,
  ];
  return candidates.map(bromaInteger).find((value): value is number => value !== undefined);
};

const collectDictionaryEntries = (response: unknown): any[] => {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== 'object') return [];
  const value = response as Record<string, any>;
  const candidates = [value.data, value.items, value.results, value.release_types, value.releaseTypes];
  for (const candidate of candidates) {
    const entries = collectDictionaryEntries(candidate);
    if (entries.length) return entries;
  }
  return [];
};

const releaseTypeOption = (entry: any): BromaReleaseTypeOption | null => {
  const id = bromaInteger(entry?.id ?? entry?.value ?? entry?.release_type_id ?? entry?.releaseTypeId);
  const title = firstString(entry?.title, entry?.name, entry?.label, entry?.value_text, entry?.valueText);
  if (id === undefined || !title) return null;
  return {
    id,
    title,
    min: bromaInteger(entry?.min ?? entry?.min_audio ?? entry?.minAudio ?? entry?.audio_min ?? entry?.audioMin),
    max: bromaInteger(entry?.max ?? entry?.max_audio ?? entry?.maxAudio ?? entry?.audio_max ?? entry?.audioMax),
  };
};

const releaseTypeAllowsTrackCount = (option: BromaReleaseTypeOption, tracks: number) => {
  if (option.min !== undefined && tracks < option.min) return false;
  if (option.max !== undefined && tracks > option.max) return false;
  return true;
};

const releaseTypeScore = (option: BromaReleaseTypeOption, key: string, tracks: number) => {
  const title = normalizeDictionaryText(option.title);
  if (!releaseTypeAllowsTrackCount(option, tracks)) return -1;
  if (key === 'single') {
    if (title === 'single') return 100;
    if (title.includes('single')) return 80;
    return tracks === 1 && option.max === 1 ? 20 : -1;
  }
  if (key === 'ep') {
    if (title === 'ep') return 100;
    if (title.includes('extended play')) return 90;
    if (title.includes('album') || title.includes('compilation')) return 20;
    return option.min !== undefined && option.min <= tracks && option.max !== undefined && option.max >= tracks ? 10 : -1;
  }
  if (title === 'album') return 100;
  if (title.includes('album')) return 90;
  if (title.includes('compilation')) return 30;
  return option.min !== undefined && option.min <= tracks && option.max !== undefined && option.max >= tracks ? 10 : -1;
};

const shouldRecreateSingleDraftForMultiTrack = (metadata: Record<string, any>, payload: DspReleasePayload, step: BromaStep) =>
  payload.tracks.length > 1 &&
  metadata.bromaReleaseId &&
  (metadata.bromaReleaseTypeId === undefined || bromaInteger(metadata.bromaReleaseTypeId) === DEFAULT_BROMA_RELEASE_TYPE_ID) &&
  ['upload_recordings', 'update_recordings', 'add_compositions', 'upload_cover', 'update_distribution', 'send_moderation'].includes(step);

const shouldRecreateDraftForMissedTikTokAdditional = (
  metadata: Record<string, any>,
  payload: DspReleasePayload,
  config: Record<string, unknown>,
  step: BromaStep
) =>
  metadata.bromaReleaseId &&
  wantsTikTokAdditionalRelease(metadata, payload, config) &&
  !hasAdditionalReleaseIds(metadata) &&
  ['upload_cover', 'update_distribution', 'send_moderation'].includes(step);

const TIKTOK_OUTLET_HINTS = ['tiktok', 'tik tok', 'dou yin', 'douyin'];

const normalizeOutletText = (value: unknown) =>
  firstString(value)?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || '';

const outletMappingText = (mapping: BromaOutletMapping) =>
  normalizeOutletText([mapping.store, mapping.name, mapping.outletId].filter(Boolean).join(' '));

const isTikTokOutletMapping = (mapping: BromaOutletMapping, config: Record<string, unknown>) => {
  const configuredIds = bromaStringList(config.tiktokOutletIds, config.bromaTikTokOutletIds).map(String);
  if (mapping.outletId && configuredIds.includes(String(mapping.outletId))) return true;
  const text = outletMappingText(mapping);
  return TIKTOK_OUTLET_HINTS.some((hint) => text.includes(hint));
};

const selectedTikTokMappings = (metadata: Record<string, any>, config: Record<string, unknown>) => {
  const mappings = Array.isArray(metadata.bromaOutletMappings)
    ? metadata.bromaOutletMappings.filter((mapping: unknown): mapping is BromaOutletMapping => Boolean(mapping) && typeof mapping === 'object')
    : [];
  return mappings.filter((mapping) => isTikTokOutletMapping(mapping, config));
};

const filteredParentOutletIds = (metadata: Record<string, any>, config: Record<string, unknown>, outletIds: unknown[]) => {
  const tiktokOutletIds = new Set(selectedTikTokMappings(metadata, config).map((mapping) => String(mapping.outletId)).filter(Boolean));
  return outletIds.filter((id) => !tiktokOutletIds.has(String(id)));
};

const wantsTikTokAdditionalRelease = (metadata: Record<string, any>, payload: DspReleasePayload, config: Record<string, unknown>) =>
  selectedTikTokMappings(metadata, config).length > 0 &&
  !payload.metadata?.disableTikTokAdditionalRelease &&
  !config.disableTikTokAdditionalRelease;

const hasAdditionalReleaseIds = (metadata: Record<string, any>) =>
  Boolean(metadata.bromaAdditionalReleaseIds && Object.keys(metadata.bromaAdditionalReleaseIds).length > 0);

const contentYear = (date?: string) => {
  const parsed = date ? new Date(date) : new Date();
  return String(Number.isNaN(parsed.getTime()) ? new Date().getFullYear() : parsed.getFullYear());
};

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseSnippetSeconds = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;
  const raw = firstString(value);
  if (!raw) return undefined;
  const text = raw.trim();
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;

  const parts = text.split(':').map((part) => part.trim());
  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    return Number.isFinite(minutes) && Number.isFinite(seconds) && minutes >= 0 && seconds >= 0
      ? minutes * 60 + seconds
      : undefined;
  }
  if (parts.length === 3) {
    const first = Number(parts[0]);
    const second = Number(parts[1]);
    const third = Number(parts[2]);
    if (!Number.isFinite(first) || !Number.isFinite(second) || !Number.isFinite(third)) return undefined;
    if (/^\d{3}$/.test(parts[2]) && second >= 0 && second < 60) {
      return first * 60 + second + third / 1000;
    }
    return first * 3600 + second * 60 + third;
  }
  return undefined;
};

const formatSnippetTime = (seconds: number) => {
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const minutes = Math.floor(totalMs / 60000);
  const wholeSeconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}:${String(milliseconds).padStart(3, '0')}`;
};

const trackDurationSeconds = (track: DspTrackPayload) =>
  parseSnippetSeconds((track as any).duration ?? track.metadata?.duration ?? track.metadata?.durationSeconds ?? track.metadata?.duration_seconds);

const bromaSnippetRange = (track: DspTrackPayload, payload: DspReleasePayload, config: Record<string, unknown>) => {
  const duration = trackDurationSeconds(track);
  const fallbackStart = duration && duration <= 40 ? 0 : 10;
  const fallbackEnd = duration ? Math.min(fallbackStart + 30, Math.max(0.001, duration - 0.001)) : fallbackStart + 30;
  let start = parseSnippetSeconds(track.metadata?.snippetStart ?? payload.metadata?.snippetStart ?? config.defaultSnippetStart) ?? fallbackStart;
  let end = parseSnippetSeconds(track.metadata?.snippetEnd ?? payload.metadata?.snippetEnd ?? config.defaultSnippetEnd) ?? fallbackEnd;

  if (duration) {
    start = Math.min(start, Math.max(0, duration - 0.001));
    end = Math.min(end, Math.max(0.001, duration - 0.001));
  }
  if (end <= start) {
    start = fallbackStart;
    end = fallbackEnd;
  }

  return {
    snippet_start: formatSnippetTime(start),
    snippet_end: formatSnippetTime(end),
  };
};

const toOwnership = (value: number) => value.toFixed(2);

const normalizeAuthorRoles = (value: unknown): BromaAuthorRole[] => {
  const values = Array.isArray(value) ? value : [value];
  const roles = values.flatMap((entry): BromaAuthorRole[] => {
    const role = firstString(entry)?.toUpperCase().replace(/[^A-Z/]/g, '');
    if (!role) return [];
    if (role === 'A' || role.includes('LYRIC') || role.includes('AUTHOR') || role.includes('WRITER')) return ['A'];
    if (role === 'C' || role.includes('COMPOSER') || role.includes('MUSIC')) return ['C'];
    if (role === 'CA' || role.includes('SONGWRITER')) return ['CA'];
    if (role === 'AR' || role.includes('ARRANGER')) return ['AR'];
    if (role === 'AD' || role.includes('ADAPTER')) return ['AD'];
    if (role === 'TR' || role.includes('TRANSLATOR')) return ['TR'];
    return [];
  });
  return Array.from(new Set(roles));
};

const mergeAuthorRoles = (roles: BromaAuthorRole[]): BromaAuthorRole[] => {
  const unique = Array.from(new Set(roles));
  if (unique.includes('A') && unique.includes('C')) {
    return ['CA', ...unique.filter((role) => role !== 'A' && role !== 'C' && role !== 'CA')];
  }
  return unique;
};

const splitContributorText = (value: string) =>
  value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const getContributorName = (value: unknown) => {
  if (value && typeof value === 'object') {
    return firstString(
      (value as any).title,
      (value as any).name,
      (value as any).fullName,
      (value as any).value,
      (value as any).label
    );
  }
  return firstString(value);
};

const getContributorOwnership = (value: unknown) => {
  if (!value || typeof value !== 'object') return undefined;
  return toFiniteNumber(
    (value as any).ownership ??
    (value as any).share ??
    (value as any).percentage ??
    (value as any).split
  );
};

const getControlledBySubmitter = (value: unknown): 0 | 1 => {
  if (!value || typeof value !== 'object') return 1;
  const raw = (value as any).controlled_by_submitter ?? (value as any).controlledBySubmitter ?? (value as any).controlled;
  return raw === false || raw === 0 || raw === '0' ? 0 : 1;
};

const collectBromaAuthors = (
  value: unknown,
  defaultRoles: BromaAuthorRole[] = []
): Array<Omit<BromaCompositionContributor, 'ownership'> & { ownership?: number }> => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => collectBromaAuthors(entry, defaultRoles));
  if (typeof value === 'string') {
    return splitContributorText(value).map((title) => ({
      title,
      roles: defaultRoles,
      controlled_by_submitter: 1,
    }));
  }
  if (typeof value !== 'object') return [];

  const title = getContributorName(value);
  if (!title) return [];
  const roles = normalizeAuthorRoles((value as any).roles || (value as any).role || (value as any).type || (value as any).category);
  const mergedRoles = mergeAuthorRoles(roles.length ? roles : defaultRoles);
  if (!mergedRoles.some((role) => AUTHOR_ROLES.includes(role))) return [];

  return [{
    title,
    roles: mergedRoles,
    ownership: getContributorOwnership(value),
    controlled_by_submitter: getControlledBySubmitter(value),
    publisher: firstString((value as any).publisher, (value as any).publisherName),
    publisher_share: firstString((value as any).publisher_share, (value as any).publisherShare),
    contributor_author_id: firstString((value as any).contributor_author_id, (value as any).contributorAuthorId),
  }];
};

const normalizeBromaCompositionContributors = (
  contributors: Array<Omit<BromaCompositionContributor, 'ownership'> & { ownership?: number }>
) => {
  const byName = new Map<string, Omit<BromaCompositionContributor, 'ownership'> & { ownership?: number }>();
  for (const contributor of contributors) {
    const key = contributor.title.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...contributor, roles: mergeAuthorRoles(contributor.roles) });
      continue;
    }
    byName.set(key, {
      ...existing,
      roles: mergeAuthorRoles([...existing.roles, ...contributor.roles]),
      ownership: existing.ownership ?? contributor.ownership,
      publisher: existing.publisher || contributor.publisher,
      publisher_share: existing.publisher_share || contributor.publisher_share,
      contributor_author_id: existing.contributor_author_id || contributor.contributor_author_id,
      controlled_by_submitter: existing.controlled_by_submitter || contributor.controlled_by_submitter,
    });
  }

  const normalized = Array.from(byName.values()).filter((contributor) => contributor.roles.length > 0);
  const providedTotal = normalized.reduce((sum, contributor) => sum + (contributor.ownership || 0), 0);
  const missing = normalized.filter((contributor) => !contributor.ownership);
  const fallbackShare = missing.length ? Math.max(0, 100 - providedTotal) / missing.length : 0;

  return normalized.map((contributor) => {
    const ownership = contributor.ownership || fallbackShare || (normalized.length ? 100 / normalized.length : 100);
    return {
      title: contributor.title,
      ownership: toOwnership(ownership),
      roles: contributor.roles,
      controlled_by_submitter: contributor.controlled_by_submitter,
      ...(contributor.publisher ? { publisher: contributor.publisher } : {}),
      ...(contributor.publisher_share ? { publisher_share: contributor.publisher_share } : {}),
      ...(contributor.contributor_author_id ? { contributor_author_id: contributor.contributor_author_id } : {}),
    };
  });
};

export class BromaConnector extends BaseDspConnector {
  key = 'broma';
  displayName = 'Broma';
  capabilities: DspCapability[] = ['audio_delivery', 'reporting'];

  async validateCredentials(credentials: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const missing = ['email', 'password'].filter((key) => !credentials[key]);
    return missing.length ? { valid: false, error: `Missing credentials: ${missing.join(', ')}` } : { valid: true };
  }

  async validateTrack(payload: DspDeliveryPayload): Promise<{ valid: boolean; errors: string[] }> {
    const base = await super.validateTrack(payload);
    const errors = [...base.errors];
    if (!('releaseId' in payload)) errors.push('Broma delivery requires release payload');
    if ('releaseId' in payload) {
      if (!firstString(payload.upc)) errors.push('Missing release UPC/EAN');
      payload.tracks.forEach((track, index) => {
        if (!firstString(track.isrc)) errors.push(`Track ${index + 1}: missing ISRC`);
        if (!track.audioFile) errors.push(`Track ${index + 1}: missing audio file`);
      });
    }
    return { valid: errors.length === 0, errors };
  }

  async deliver(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult> {
    if (!('releaseId' in payload)) return { state: 'failed', message: 'Broma accepts release deliveries only' };

    const { connectorMetadata: _cm, ...restMetadata } = { ...(context.jobMetadata || {}) } as Record<string, any>;
    const metadata = restMetadata;
    const config = context.config || {};
    const client = new BromaClient({ credentials: context.credentials, config });
    const currentStep = (metadata.bromaStep || 'create_release') as BromaStep;
    const releaseId = String(metadata.bromaReleaseId || '');
    const step = STEP_ORDER.includes(currentStep) ? currentStep : 'create_release';

    if (step === 'poll_status' && releaseId) {
      if (!metadata.bromaModerationSentAt) {
        await client.sendModeration(releaseId);
        const pollIntervalMs = Number(config.moderationPollIntervalMs || config.pollIntervalMs || 15 * 60_000);
        return {
          state: 'processing',
          externalId: releaseId,
          message: 'Release sent to Broma moderation',
          metadata: {
            ...metadata,
            bromaStep: 'poll_status',
            bromaModerationSentAt: new Date().toISOString(),
            bromaModerationStatus: 'moderation_pending',
            bromaLastStatusAt: new Date().toISOString(),
            nextPollAt: new Date(Date.now() + pollIntervalMs).toISOString(),
          },
        };
      }
      const snapshot = await fetchBromaStatusSnapshot(client, releaseId, config, metadata);
      const normalized = snapshot.normalized;
      const live = BROMA_DELIVERED_STATUSES.has(normalized);
      const rejected = BROMA_REJECTED_STATUSES.has(normalized);
      const inModeration = normalized && BROMA_MODERATION_STATUSES.has(normalized);
      const inDspProcessing = normalized && BROMA_DSP_PROCESSING_STATUSES.has(normalized);

      let bromaStep: BromaStep;
      let state: 'delivered' | 'needs_attention' | 'processing';
      let message: string;
      let pollIntervalMs: number;

      if (live) {
        bromaStep = 'done';
        state = 'delivered';
        message = `Broma release is ${normalized}`;
        pollIntervalMs = 0;
      } else if (rejected) {
        bromaStep = 'done';
        state = 'needs_attention';
        message = `Broma release is ${normalized}`;
        pollIntervalMs = 0;
      } else if (inModeration) {
        bromaStep = 'poll_status';
        state = 'processing';
        message = `Broma release in moderation (${normalized})`;
        pollIntervalMs = Number(config.moderationPollIntervalMs || config.pollIntervalMs || 15 * 60_000);
      } else if (inDspProcessing) {
        bromaStep = 'poll_status';
        state = 'processing';
        message = `Broma release in distribution (${normalized})`;
        pollIntervalMs = Number(config.dspPollIntervalMs || config.pollIntervalMs || 30 * 60_000);
      } else {
        bromaStep = 'poll_status';
        state = 'processing';
        message = normalized ? `Broma status: ${normalized}` : 'Broma release still processing';
        pollIntervalMs = Number(config.pollIntervalMs || 30 * 60_000);
      }

      return {
        state,
        externalId: releaseId,
        message,
        metadata: {
          ...metadata,
          bromaStep,
          bromaModerationStatus: normalized || 'processing',
          bromaStatusSource: snapshot.source,
          bromaAssetId: snapshot.assetRow?.id,
          bromaAssetStatuses: snapshot.assetRow?.statuses,
          bromaRejectionReason: rejected ? snapshot.rejectionReason || 'Rejected during moderation' : undefined,
          bromaLastStatusAt: new Date().toISOString(),
          bromaRawStatus: snapshot.releaseDetail?.moderation_status || snapshot.assetRow?.moderation_status || undefined,
          nextPollAt: pollIntervalMs > 0 ? new Date(Date.now() + pollIntervalMs).toISOString() : undefined,
        },
      };
    }

    const next = await this.runUntilNextBoundary(client, payload, config, metadata, step, context.jobId);
    return {
      state: 'processing',
      externalId: String(next.bromaReleaseId || releaseId || ''),
      message: `Broma step completed: ${next.bromaStep}`,
      metadata: {
        ...next,
        nextPollAt: new Date(Date.now() + Number(config.pollIntervalMs || 30 * 60_000)).toISOString(),
      },
    };
  }

  async getDeliveryStatus(externalId: string, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const config = context.config || {};
    const client = new BromaClient({ credentials: context.credentials, config });
    const snapshot = await fetchBromaStatusSnapshot(client, externalId, config, context.jobMetadata);
    const normalized = snapshot.normalized;
    const delivered = BROMA_DELIVERED_STATUSES.has(normalized);
    const rejected = BROMA_REJECTED_STATUSES.has(normalized);
    const inModeration = normalized && BROMA_MODERATION_STATUSES.has(normalized);
    const inDspProcessing = normalized && BROMA_DSP_PROCESSING_STATUSES.has(normalized);

    let state: 'delivered' | 'needs_attention' | 'processing';
    if (delivered) state = 'delivered';
    else if (rejected) state = 'needs_attention';
    else state = 'processing';

    return {
      state,
      externalId,
      message: normalized ? `Broma status: ${normalized}` : 'Broma status refreshed',
      metadata: {
        bromaReleaseId: externalId,
        bromaStep: delivered || rejected ? 'done' : 'poll_status',
        bromaModerationStatus: normalized || 'processing',
        bromaStatusSource: snapshot.source,
        bromaAssetId: snapshot.assetRow?.id,
        bromaAssetStatuses: snapshot.assetRow?.statuses,
        bromaRejectionReason: rejected ? snapshot.rejectionReason || 'Rejected during moderation' : undefined,
        bromaLastStatusAt: new Date().toISOString(),
        bromaRawStatus: snapshot.releaseDetail?.moderation_status || snapshot.assetRow?.moderation_status || undefined,
        bromaIsModeration: inModeration || undefined,
        bromaIsDspProcessing: inDspProcessing || undefined,
      },
    };
  }

  async takedown(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const { connectorMetadata: _cm, ...restMetadata } = { ...(context.jobMetadata || {}) };
    const metadata = restMetadata;
    const externalId = metadata.bromaReleaseId ? String(metadata.bromaReleaseId) : undefined;
    return {
      state: 'needs_attention',
      externalId,
      message: 'Broma takedown requires manual handling: public partner docs do not expose a confirmed release takedown endpoint.',
      metadata: {
        ...metadata,
        bromaTakedownMode: 'manual_required',
        bromaTakedownRequestedAt: new Date().toISOString(),
        requestedStores: 'stores' in payload ? payload.stores : undefined,
      },
    };
  }

  private async runUntilNextBoundary(
    client: BromaClient,
    payload: DspReleasePayload,
    config: Record<string, unknown>,
    metadata: Record<string, any>,
    startStep: BromaStep,
    jobId?: string
  ) {
    const next = { ...metadata };
    let step = startStep;

    if (shouldRecreateSingleDraftForMultiTrack(next, payload, step)) {
      delete next.bromaReleaseId;
      delete next.bromaRecordingIds;
      delete next.bromaCoverUploaded;
      delete next.bromaModerationSentAt;
      delete next.bromaAdditionalReleaseIds;
      delete next.bromaAdditionalReleaseSkippedAt;
      step = next.bromaStep = 'create_release';
      await this.persistProgress(jobId, next);
    }

    if (shouldRecreateDraftForMissedTikTokAdditional(next, payload, config, step)) {
      delete next.bromaReleaseId;
      delete next.bromaRecordingIds;
      delete next.bromaCoverUploaded;
      delete next.bromaModerationSentAt;
      delete next.bromaAdditionalReleaseIds;
      delete next.bromaAdditionalReleaseSkippedAt;
      step = next.bromaStep = 'create_release';
      await this.persistProgress(jobId, next);
    }

    if (step === 'create_release') {
      if (!next.bromaReleaseId) {
        const releasePayload = await this.buildReleasePayload(client, payload, config);
        next.bromaReleaseTypeId = releasePayload.release_type_id;
        const response = await client.createRelease(releasePayload);
        next.bromaReleaseId = getResponseId(response);
        if (!next.bromaReleaseId) throw new Error('Broma create release response missing release id');
      }
      step = next.bromaStep = 'upload_recordings';
      await this.persistProgress(jobId, next);
    }

    if (step === 'upload_recordings') {
      const recordingIds = { ...(next.bromaRecordingIds || {}) };
      for (const track of payload.tracks) {
        const key = track.trackId;
        if (recordingIds[key]) continue;
        const response = await client.uploadRecording(String(next.bromaReleaseId), track.audioFile);
        const recordingId = getResponseId(response);
        if (!recordingId) throw new Error(`Broma upload response missing recording id for ${track.title}`);
        recordingIds[key] = recordingId;
        next.bromaRecordingIds = recordingIds;
        await this.persistProgress(jobId, next);
      }
      next.bromaRecordingIds = recordingIds;
      step = next.bromaStep = 'update_recordings';
      await this.persistProgress(jobId, next);
    }

    if (step === 'update_recordings') {
      for (const track of payload.tracks) {
        const recordingId = next.bromaRecordingIds?.[track.trackId];
        if (!recordingId) throw new Error(`Missing Broma recording id for ${track.title}`);
        await client.updateRecording(String(next.bromaReleaseId), String(recordingId), this.buildRecordingPayload(payload, track, config, recordingId));
      }
      await this.ensureAdditionalReleases(client, payload, config, next, jobId);
      step = next.bromaStep = 'add_compositions';
      await this.persistProgress(jobId, next);
    }

    if (step === 'add_compositions') {
      await this.ensureAdditionalReleases(client, payload, config, next, jobId);
      for (const track of payload.tracks) {
        const recordingId = next.bromaRecordingIds?.[track.trackId];
        await client.addComposition(String(next.bromaReleaseId), String(recordingId), this.buildCompositionPayload(payload, track));
      }
      step = next.bromaStep = 'upload_cover';
      await this.persistProgress(jobId, next);
    }

    if (step === 'upload_cover') {
      if (!next.bromaCoverUploaded) {
        const artwork = firstString(payload.metadata?.artwork, payload.tracks[0]?.artwork);
        if (!artwork) throw new Error('Missing release artwork for Broma cover upload');
        await client.uploadCover(String(next.bromaReleaseId), artwork);
        next.bromaCoverUploaded = true;
      }
      step = next.bromaStep = 'update_distribution';
      await this.persistProgress(jobId, next);
    }

    if (step === 'update_distribution') {
      let outletIds = Array.isArray(next.bromaOutletIds) ? next.bromaOutletIds : [];
      if (config.distributeToAllOutlets && config.expandToAllOutlets) {
        const releaseTypeId = requireBromaInteger(next.bromaReleaseTypeId, 'Broma release type id');
        const remote = await client.getOutlets(releaseTypeId);
        const raw = Array.isArray(remote?.data) ? remote.data
          : Array.isArray(remote?.data?.items) ? remote.data.items
          : Array.isArray(remote?.data?.outlets) ? remote.data.outlets
          : Array.isArray(remote?.items) ? remote.items
          : Array.isArray(remote?.outlets) ? remote.outlets
          : Array.isArray(remote) ? remote
          : [];
        outletIds = raw
          .map((r: any) => bromaInteger(r?.id ?? r?.outlet_id))
          .filter((id: number | undefined): id is number => id !== undefined && id > 0);
        if (!outletIds.length) throw new Error('No valid Broma outlets returned for this release type');
      }
      if (!outletIds.length) throw new Error('Missing Broma outlet ids');
      const parentOutletIds = filteredParentOutletIds(next, config, outletIds);
      const distributionType = firstString(payload.metadata?.bromaDistributionType, config.bromaDistributionType, config.distributionType, 'asap') || 'asap';
      const saleStartDate = minFutureDateOnly(
        distributionType === 'transfer' ? 0 : 2,
        payload.metadata?.saleStartDate,
        payload.metadata?.sale_start_date,
        payload.releaseDate
      );
      if (parentOutletIds.length) {
        await client.updateDistribution(String(next.bromaReleaseId), {
          outlets: parentOutletIds.map((id) => requireBromaInteger(id, 'Broma outlet id')),
          type: ['asap', 'regular', 'transfer'].includes(distributionType) ? distributionType : 'asap',
          sale_start_date: saleStartDate,
        });
      }
      step = next.bromaStep = 'send_moderation';
      await this.persistProgress(jobId, next);
    }

    if (step === 'send_moderation') {
      if (!next.bromaModerationSentAt) {
        await client.sendModeration(String(next.bromaReleaseId));
        next.bromaModerationSentAt = new Date().toISOString();
      }
      next.bromaStep = 'poll_status';
      await this.persistProgress(jobId, next);
    }

    return next;
  }

  private async persistProgress(jobId: string | undefined, metadata: Record<string, any>) {
    if (!jobId) return;
    await DeliveryJob.findByIdAndUpdate(jobId, {
      metadata,
      $push: {
        events: {
          state: 'processing',
          message: `Broma progress saved: ${metadata.bromaStep || 'unknown'}`,
          source: 'connector',
        },
      },
    });
  }

  private async ensureAdditionalReleases(
    client: BromaClient,
    payload: DspReleasePayload,
    config: Record<string, unknown>,
    metadata: Record<string, any>,
    jobId?: string
  ) {
    const hasTikTok = selectedTikTokMappings(metadata, config).length > 0;
    if (!hasTikTok || payload.metadata?.disableTikTokAdditionalRelease || config.disableTikTokAdditionalRelease) return;
    if (!metadata.bromaReleaseId) throw new Error('Missing Broma release id for additional release');

    const additionalReleaseIds = { ...(metadata.bromaAdditionalReleaseIds || {}) };
    const releaseTypeId = requireBromaInteger(
      firstString(
        payload.metadata?.bromaTikTokReleaseTypeId,
        payload.metadata?.additionalReleaseTypeId,
        config.bromaTikTokReleaseTypeId,
        config.defaultTikTokReleaseTypeId,
        config.defaultAdditionalReleaseTypeId,
        '70'
      ),
      'Broma TikTok additional release_type_id'
    );
    const distributionDate = minFutureDateOnly(
      2,
      payload.metadata?.additionalReleaseDate,
      payload.metadata?.saleStartDate,
      payload.metadata?.sale_start_date,
      payload.releaseDate
    );

    for (const track of payload.tracks) {
      if (additionalReleaseIds[track.trackId]) continue;
      const recordingId = metadata.bromaRecordingIds?.[track.trackId];
      if (!recordingId) throw new Error(`Missing Broma recording id for additional release: ${track.title}`);
      const snippetRange = bromaSnippetRange(track, payload, config);
      const response = await client.createAdditionalRelease({
        parent_release: requireBromaInteger(metadata.bromaReleaseId, 'Broma parent release id'),
        parent_recording: requireBromaInteger(recordingId, 'Broma parent recording id'),
        release_type_id: releaseTypeId,
        sale_start_date: distributionDate,
        generate_ean: 1,
        generate_catalog_number: 1,
        account_id: requireBromaInteger(config.accountId, 'Broma account_id'),
        ...snippetRange,
      });
      additionalReleaseIds[track.trackId] = getResponseId(response) || true;
      metadata.bromaAdditionalReleaseIds = additionalReleaseIds;
      await this.persistProgress(jobId, metadata);
    }
  }

  private async resolveReleaseTypeId(client: BromaClient, payload: DspReleasePayload, config: Record<string, unknown>) {
    const explicit = configuredReleaseTypeId(payload, config);
    if (explicit !== undefined) return explicit;

    const key = releaseTypeKey(payload);
    if (key === 'single') return DEFAULT_BROMA_RELEASE_TYPE_ID;

    const response = await client.getReleaseTypes();
    const options = collectDictionaryEntries(response)
      .map(releaseTypeOption)
      .filter((option): option is BromaReleaseTypeOption => Boolean(option));
    const ranked = options
      .map((option) => ({ option, score: releaseTypeScore(option, key, payload.tracks.length) }))
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => right.score - left.score);

    const selected = ranked[0]?.option;
    if (selected) return selected.id;

    throw new Error(`Broma release_type_id not resolved for ${key} with ${payload.tracks.length} tracks`);
  }

  private async buildReleasePayload(client: BromaClient, payload: DspReleasePayload, config: Record<string, unknown>) {
    const year = contentYear(payload.releaseDate);
    const releaseUpc = requireBromaString(payload.upc, 'Broma release EAN/UPC');
    const releaseCatalogNumber = catalogNumber(payload);
    const rightsholder = payloadRightsholder(payload);
    const createdDate = nonFutureDateOnly(
      payload.metadata?.createdDate,
      payload.metadata?.created_date,
      payload.metadata?.originalReleaseDate,
      payload.metadata?.original_release_date,
      payload.releaseDate
    );
    return {
      title: payload.releaseTitle,
      release_type_id: await this.resolveReleaseTypeId(client, payload, config),
      catalog_number: releaseCatalogNumber,
      generate_catalog_number: !releaseCatalogNumber,
      performers: bromaArtists(payload.primaryArtist),
      genres: bromaGenres(payload.genre, payload.metadata?.genre),
      created_country_id: createdCountryId(payload, config),
      ean: releaseUpc,
      parental_warning_type: payload.tracks.some((track) => track.explicit) ? 1 : 0,
      account_id: Number(config.accountId),
      p_line: String(payload.metadata?.pline || rightsholder || payload.primaryArtist || payload.releaseTitle),
      c_line: String(payload.metadata?.cline || rightsholder || payload.primaryArtist || payload.releaseTitle),
      date_p_line: year,
      date_c_line: year,
      created_date: createdDate,
      generate_ean: 0,
      various_artists: Boolean(payload.metadata?.variousArtists),
    };
  }

  private buildRecordingPayload(
    payload: DspReleasePayload,
    track: DspReleasePayload['tracks'][number],
    config: Record<string, unknown> = {},
    recordingId?: unknown
  ) {
    const trackIsrc = requireBromaString(track.isrc, `Broma ISRC for ${track.title || 'track'}`);
    const trackCatalogNumber = catalogNumber(payload, track);
    const primaryArtist = firstString(track.artistName, payload.primaryArtist);
    const featuredArtist = firstString(track.metadata?.featuredArtist, track.metadata?.featuring, payload.metadata?.featuredArtist, payload.metadata?.featuring);
    const rightsholder = payloadRightsholder(payload);
    const partyId = requireBromaString(
      firstString(
        track.metadata?.partyId,
        track.metadata?.party_id,
        track.metadata?.partyName,
        payload.metadata?.partyId,
        payload.metadata?.party_id,
        payload.metadata?.partyName,
        rightsholder,
        payload.label
      ),
      'Broma party_id'
    );
    const createdDate = nonFutureDateOnly(
      track.metadata?.createdDate,
      track.metadata?.created_date,
      track.metadata?.originalReleaseDate,
      track.metadata?.original_release_date,
      track.metadata?.recordingDate,
      payload.metadata?.createdDate,
      payload.metadata?.created_date,
      payload.metadata?.originalReleaseDate,
      payload.metadata?.original_release_date,
      track.releaseDate,
      payload.releaseDate
    );
    return {
      id: requireBromaInteger(recordingId, 'Broma recording id'),
      title: bromaRecordingTitle(payload, track),
      subtitle: firstString(track.version, track.metadata?.subtitle, track.metadata?.version),
      performers: bromaArtists(primaryArtist),
      main_performer: bromaArtists(primaryArtist),
      featured_artist: bromaArtists(featuredArtist),
      isrc: trackIsrc,
      generate_isrc: 0,
      is_instrumental: Boolean(track.metadata?.instrumental || track.metadata?.isInstrumental),
      catalog_number: trackCatalogNumber,
      generate_catalog_number: !trackCatalogNumber,
      genres: bromaGenres(track.genre, track.metadata?.genre, payload.genre, payload.metadata?.genre),
      created_country_id: createdCountryId(payload, config, track),
      created_date: createdDate,
      language: languageId(payload, config, track),
      party_id: partyId,
      parental_warning_type: track.explicit ? 'explicit' : 'not_explicit',
      label: rightsholder,
      producer: trackProducerRightsholder(payload, track),
      lyrics: firstString(track.metadata?.lyrics, track.metadata?.lyric, (track as any).lyrics),
    };
  }

  private buildCompositionPayload(payload: DspReleasePayload, track: DspReleasePayload['tracks'][number]) {
    const contributors = [
      ...collectBromaAuthors(track.metadata?.contributors),
      ...collectBromaAuthors(track.contributors),
      ...collectBromaAuthors(track.metadata?.composers, ['C']),
      ...collectBromaAuthors((track as any).composers, ['C']),
      ...collectBromaAuthors(track.metadata?.lyricists, ['A']),
      ...collectBromaAuthors((track as any).lyricists, ['A']),
      ...collectBromaAuthors(track.metadata?.writers, ['CA']),
      ...collectBromaAuthors((track as any).writers, ['CA']),
    ];

    const normalizedContributors = normalizeBromaCompositionContributors(contributors);
    const fallbackContributors = normalizedContributors.length
      ? normalizedContributors
      : normalizeBromaCompositionContributors(
          collectBromaAuthors(firstString(track.artistName, payload.primaryArtist), ['CA'])
        );

    return {
      title: track.title,
      contributors: fallbackContributors,
    };
  }
}
