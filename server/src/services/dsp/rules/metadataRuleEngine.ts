import { DspTrackPayload, MetadataRuleResult } from '../../../types/dsp';
import { validateDdexPayload } from '../validation/ddexValidator';

type RuleFn = (payload: DspTrackPayload) => { errors?: string[]; warnings?: string[]; mutate?: Partial<DspTrackPayload> };

const baseRules: RuleFn[] = [
  (payload) => ({
    errors: payload.title?.trim() ? [] : ['Metadata: title required'],
  }),
  (payload) => ({
    errors: payload.artistName?.trim() ? [] : ['Metadata: artistName required'],
  }),
  (payload) => {
    const warnings: string[] = [];
    if (!payload.contentRating) warnings.push('Metadata: contentRating missing; defaulting to not_applicable');
    return { warnings, mutate: { contentRating: payload.contentRating || 'not_applicable' } };
  },
];

const perProviderRules: Record<string, RuleFn[]> = {
  spotify: [
    (payload) => ({
      warnings: payload.genre ? [] : ['Spotify: genre strongly recommended'],
    }),
  ],
  apple_music: [
    (payload) => ({
      errors: payload.upc ? [] : ['Apple Music: UPC required'],
    }),
  ],
  amazon_music: [
    (payload) => ({
      errors: payload.language ? [] : ['Amazon Music: language required'],
    }),
  ],
  youtube_music: [
    (payload) => ({
      warnings: payload.territories?.length ? [] : ['YouTube Music: territories should be set'],
    }),
  ],
  youtube_content_id: [
    (payload) => ({
      errors: payload.isrc ? [] : ['YouTube Content ID: ISRC required'],
    }),
  ],
  tiktok: [
    (payload) => ({
      warnings: payload.explicit ? ['TikTok: explicit content can have delivery restrictions'] : [],
    }),
  ],
};

export const applyMetadataRules = (providerKey: string, input: DspTrackPayload): MetadataRuleResult => {
  let normalized: DspTrackPayload = {
    ...input,
    metadata: { ...(input.metadata || {}) },
    title: input.title?.trim(),
    artistName: input.artistName?.trim(),
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of baseRules) {
    const result = rule(normalized);
    if (result.errors?.length) errors.push(...result.errors);
    if (result.warnings?.length) warnings.push(...result.warnings);
    if (result.mutate) normalized = { ...normalized, ...result.mutate };
  }

  for (const rule of perProviderRules[providerKey] || []) {
    const result = rule(normalized);
    if (result.errors?.length) errors.push(...result.errors);
    if (result.warnings?.length) warnings.push(...result.warnings);
    if (result.mutate) normalized = { ...normalized, ...result.mutate };
  }

  const ddex = validateDdexPayload(normalized, normalized.ddexProfile || 'ERN-4');
  errors.push(...ddex.errors);
  warnings.push(...ddex.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized,
  };
};
