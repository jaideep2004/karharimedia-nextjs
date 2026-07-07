import mongoose from 'mongoose';
import { AcrCloudScanSummary } from '../types/acrCloud';

export function releasesCollection() {
  const collection = mongoose.connection.db?.collection('releases');
  if (!collection) {
    throw new Error('MongoDB releases collection is not available');
  }
  return collection;
}

export async function updateReleaseTrackAcrCloudByFileId(
  fileId: string,
  scan: AcrCloudScanSummary
) {
  return releasesCollection().updateMany(
    { 'tracks.acrCloud.fileId': fileId },
    {
      $set: {
        'tracks.$[track].acrCloud.scanState': scan.state,
        'tracks.$[track].acrCloud.state': scan.state,
        'tracks.$[track].acrCloud.aiDetection': scan.aiDetection,
        'tracks.$[track].acrCloud.fingerprintMatches': scan.fingerprintMatches,
        'tracks.$[track].acrCloud.rawResult': scan.rawResult,
        'tracks.$[track].acrCloud.checkedAt': new Date().toISOString(),
        updatedAt: new Date(),
      },
      $unset: {
        'tracks.$[track].acrCloud.lastError': '',
      },
    },
    {
      arrayFilters: [{ 'track.acrCloud.fileId': fileId }],
    }
  );
}
