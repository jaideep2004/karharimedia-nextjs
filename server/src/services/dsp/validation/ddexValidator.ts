import { DspTrackPayload } from '../../../types/dsp';

const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const UPC_REGEX = /^\d{12,14}$/;

export type DdexValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export const validateDdexPayload = (
  payload: DspTrackPayload,
  profile: 'ERN-3' | 'ERN-4' = 'ERN-4'
): DdexValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload.title?.trim()) errors.push('DDEX: title required');
  if (!payload.artistName?.trim()) errors.push('DDEX: artistName required');
  if (!payload.audioFile?.trim()) errors.push('DDEX: audioFile required');
  if (!payload.artwork?.trim()) errors.push('DDEX: artwork required');

  if (!payload.isrc || !ISRC_REGEX.test(payload.isrc.replace(/-/g, '').toUpperCase())) {
    errors.push('DDEX: valid ISRC required');
  }

  if (!payload.upc || !UPC_REGEX.test(String(payload.upc))) {
    warnings.push('DDEX: UPC missing or invalid (12-14 digits expected)');
  }

  if (!payload.releaseDate) errors.push('DDEX: releaseDate required');
  if (!payload.genre) warnings.push('DDEX: genre recommended');
  if (!payload.language) warnings.push('DDEX: language recommended');
  if (!payload.contributors?.length) warnings.push('DDEX: contributor list recommended');

  if (profile === 'ERN-4' && !payload.territories?.length) {
    warnings.push('DDEX ERN-4: territories recommended');
  }

  return { valid: errors.length === 0, errors, warnings };
};
