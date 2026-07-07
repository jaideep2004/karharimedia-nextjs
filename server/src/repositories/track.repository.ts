import Track, { ITrack } from '../models/track.model';
import { AcrCloudScanSummary } from '../types/acrCloud';

export function createStandaloneTrack(payload: Record<string, unknown>) {
  return Track.create({
    ...payload,
    source: 'standalone_upload',
  });
}

export function listStandaloneTracks(query: Record<string, unknown>) {
  return Track.find({ ...query, source: { $ne: 'release_embed' } }).sort({ createdAt: -1 });
}

export function findTrackById(id: string) {
  return Track.findById(id);
}

export async function saveTrack(track: ITrack) {
  return track.save();
}

export async function deleteTrackDocument(track: ITrack) {
  return track.deleteOne();
}

export function findTrackByAcrCloudFileId(fileId: string) {
  return Track.findOne({ 'acrCloud.fileId': fileId });
}

export function updateTrackAcrCloudById(trackId: string, update: Record<string, unknown>) {
  return Track.findByIdAndUpdate(trackId, update);
}

export function updateStandaloneTrackAcrCloudByFileId(
  fileId: string,
  scan: AcrCloudScanSummary
) {
  return Track.findOneAndUpdate(
    { 'acrCloud.fileId': fileId },
    {
      'acrCloud.scanState': scan.state,
      'acrCloud.aiDetection': scan.aiDetection,
      'acrCloud.fingerprintMatches': scan.fingerprintMatches,
      'acrCloud.rawResult': scan.rawResult,
      'acrCloud.lastError': undefined,
      'acrCloud.checkedAt': new Date(),
    }
  );
}

export function updateCanonicalTrackLegacyAcrCloudByFileId(
  fileId: string,
  scan: AcrCloudScanSummary
) {
  return Track.collection.updateMany(
    { source: 'release_embed', 'legacyMetadata.acrCloud.fileId': fileId },
    {
      $set: {
        'legacyMetadata.acrCloud.scanState': scan.state,
        'legacyMetadata.acrCloud.state': scan.state,
        'legacyMetadata.acrCloud.aiDetection': scan.aiDetection,
        'legacyMetadata.acrCloud.fingerprintMatches': scan.fingerprintMatches,
        'legacyMetadata.acrCloud.rawResult': scan.rawResult,
        'legacyMetadata.acrCloud.checkedAt': new Date().toISOString(),
        updatedAt: new Date(),
      },
      $unset: {
        'legacyMetadata.acrCloud.lastError': '',
      },
    }
  );
}

export function findCanonicalTracksByAcrCloudFileId(fileId: string) {
  return Track.collection
    .find({ source: 'release_embed', 'legacyMetadata.acrCloud.fileId': fileId })
    .project({ _id: 1, releaseId: 1, ownerUserId: 1, artistId: 1, title: 1 })
    .toArray();
}
