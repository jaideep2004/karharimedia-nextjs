import { Db, ObjectId, type AnyBulkWriteOperation, type Filter } from 'mongodb';

export type TrackFingerprintDocument = {
  _id?: ObjectId;
  trackId: ObjectId;
  releaseId?: ObjectId;
  provider: 'acrcloud';
  fileId?: string;
  scanState?: string;
  aiDetection?: unknown[];
  fingerprintMatches?: unknown[];
  rawResult?: unknown;
  checkedAt?: Date | string;
  createdAt: Date;
  updatedAt: Date;
};

let indexesReady: Promise<void> | null = null;

export function trackFingerprintsCollection(db: Db) {
  return db.collection<TrackFingerprintDocument>('trackFingerprints');
}

export async function ensureTrackFingerprintIndexes(db: Db) {
  if (!indexesReady) {
    const collection = trackFingerprintsCollection(db);
    indexesReady = Promise.all([
      collection.createIndex({ trackId: 1, provider: 1, fileId: 1 }),
      collection.createIndex({ fileId: 1 }, { sparse: true }),
      collection.createIndex({ releaseId: 1 }),
      collection.createIndex({ scanState: 1 }),
    ]).then(() => undefined);
  }

  await indexesReady;
}

export function buildFingerprintDocumentFromTrack(track: Record<string, any>): TrackFingerprintDocument | null {
  const trackId = track._id instanceof ObjectId ? track._id : null;
  const acrCloud = track.legacyMetadata?.acrCloud || track.acrCloud;
  if (!trackId || !acrCloud) return null;

  const now = new Date();
  const fingerprint: TrackFingerprintDocument = {
    trackId,
    provider: 'acrcloud' as const,
    fileId: acrCloud.fileId,
    scanState: acrCloud.scanState || acrCloud.state,
    aiDetection: Array.isArray(acrCloud.aiDetection) ? acrCloud.aiDetection : [],
    fingerprintMatches: Array.isArray(acrCloud.fingerprintMatches) ? acrCloud.fingerprintMatches : [],
    rawResult: acrCloud.rawResult,
    checkedAt: acrCloud.checkedAt,
    createdAt: now,
    updatedAt: now,
  };

  if (track.releaseId instanceof ObjectId) {
    fingerprint.releaseId = track.releaseId;
  }

  return fingerprint;
}

export async function upsertTrackFingerprintsFromTracks(
  db: Db,
  tracks: Array<Record<string, any>>,
  options: { dryRun?: boolean } = {}
) {
  await ensureTrackFingerprintIndexes(db);

  const fingerprints: TrackFingerprintDocument[] = [];
  tracks.forEach((track) => {
    const fingerprint = buildFingerprintDocumentFromTrack(track);
    if (fingerprint) fingerprints.push(fingerprint);
  });

  const operations: AnyBulkWriteOperation<TrackFingerprintDocument>[] = fingerprints.map((fingerprint) => {
    const { createdAt, ...setFields } = fingerprint;
    const filter: Filter<TrackFingerprintDocument> = {
      trackId: fingerprint.trackId,
      provider: fingerprint.provider,
      ...(fingerprint.fileId ? { fileId: fingerprint.fileId } : { fileId: { $exists: false } }),
    };

    return {
      updateOne: {
        filter,
        update: {
          $set: setFields,
          $setOnInsert: { createdAt },
        },
        upsert: true,
      },
    };
  });

  if (!operations.length || options.dryRun) {
    return { planned: operations.length, matched: 0, modified: 0, upserted: 0 };
  }

  const result = await trackFingerprintsCollection(db).bulkWrite(operations, { ordered: false });
  return {
    planned: operations.length,
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: result.upsertedCount,
  };
}

export async function listTrackFingerprintsForTrackIds(db: Db, trackIds: ObjectId[]) {
  if (!trackIds.length) return new Map<string, TrackFingerprintDocument[]>();
  const fingerprints = await trackFingerprintsCollection(db)
    .find({ trackId: { $in: trackIds } })
    .toArray();
  const byTrack = new Map<string, TrackFingerprintDocument[]>();
  fingerprints.forEach((fingerprint) => {
    const key = fingerprint.trackId.toHexString();
    const list = byTrack.get(key) || [];
    list.push(fingerprint);
    byTrack.set(key, list);
  });
  return byTrack;
}
