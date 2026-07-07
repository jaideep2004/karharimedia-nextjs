import crypto from 'crypto';
import ReleaseVersion from '../../models/releaseVersion.model';
import { DspTrackPayload } from '../../types/dsp';

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return JSON.stringify(value, keys);
};

class ReleaseVersionService {
  async createVersion(input: {
    trackId: string;
    providerKey: string;
    payload: DspTrackPayload;
    createdBy?: string;
  }) {
    const last = await ReleaseVersion.findOne({
      trackId: input.trackId,
      providerKey: input.providerKey,
    }).sort({ versionNumber: -1 });

    const versionNumber = (last?.versionNumber || 0) + 1;
    const versionLabel = `v${versionNumber}`;
    const metadataHash = crypto.createHash('sha256').update(stableStringify(input.payload)).digest('hex');

    return ReleaseVersion.create({
      trackId: input.trackId,
      providerKey: input.providerKey,
      versionNumber,
      versionLabel,
      ddexProfile: input.payload.ddexProfile || 'ERN-4',
      metadataHash,
      createdBy: input.createdBy,
    });
  }
}

export const releaseVersionService = new ReleaseVersionService();
