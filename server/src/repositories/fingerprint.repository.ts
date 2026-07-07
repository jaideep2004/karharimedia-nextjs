import mongoose from 'mongoose';
import { AcrCloudScanSummary } from '../types/acrCloud';

export function trackFingerprintsCollection() {
  const collection = mongoose.connection.db?.collection('trackFingerprints');
  if (!collection) {
    throw new Error('MongoDB trackFingerprints collection is not available');
  }
  return collection;
}

export async function upsertAcrCloudFingerprintsForTracks(
  tracks: Array<{ _id: unknown; releaseId?: unknown }>,
  fileId: string,
  scan: AcrCloudScanSummary
) {
  if (!tracks.length) return null;

  const now = new Date();
  return trackFingerprintsCollection().bulkWrite(
    tracks.map((track) => ({
      updateOne: {
        filter: { trackId: track._id, provider: 'acrcloud', fileId },
        update: {
          $set: {
            trackId: track._id,
            releaseId: track.releaseId,
            provider: 'acrcloud',
            fileId,
            scanState: scan.state,
            aiDetection: scan.aiDetection,
            fingerprintMatches: scan.fingerprintMatches,
            rawResult: scan.rawResult,
            checkedAt: now,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}
