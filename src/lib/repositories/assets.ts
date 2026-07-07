import { Db, ObjectId, type AnyBulkWriteOperation } from 'mongodb';
import { asString } from '@/lib/musicPublishing';

export type TrackAssetType = 'audio' | 'artwork' | 'metadata_zip';

export type TrackAssetDocument = {
  _id?: ObjectId;
  trackId: ObjectId;
  releaseId?: ObjectId;
  ownerUserId?: string | ObjectId;
  organizationId?: ObjectId;
  type: TrackAssetType;
  storageProvider: 'local' | 'external' | 'unknown';
  path?: string;
  url?: string;
  checksum?: string;
  size?: number;
  createdAt: Date;
  updatedAt: Date;
};

let indexesReady: Promise<void> | null = null;

export function trackAssetsCollection(db: Db) {
  return db.collection<TrackAssetDocument>('trackAssets');
}

export async function ensureTrackAssetIndexes(db: Db) {
  if (!indexesReady) {
    const collection = trackAssetsCollection(db);
    indexesReady = Promise.all([
      collection.createIndex({ trackId: 1, type: 1 }),
      collection.createIndex({ releaseId: 1 }),
      collection.createIndex({ ownerUserId: 1 }),
      collection.createIndex({ organizationId: 1 }),
    ]).then(() => undefined);
  }

  await indexesReady;
}

function getStorageProvider(value: string): 'local' | 'external' | 'unknown' {
  if (!value) return 'unknown';
  if (/^https?:\/\//i.test(value)) return 'external';
  return 'local';
}

export function buildAssetDocumentsFromTrack(track: Record<string, any>) {
  const trackId = track._id instanceof ObjectId ? track._id : null;
  if (!trackId) return [];

  const now = new Date();
  const releaseId = track.releaseId instanceof ObjectId ? track.releaseId : undefined;
  const ownerUserId = track.ownerUserId;
  const organizationId = track.organizationId instanceof ObjectId ? track.organizationId : undefined;
  const legacy = track.legacyMetadata || {};
  const audio = asString(track.audioFile || legacy.audioFile || legacy.audioUrl || legacy.audio);
  const artwork = asString(track.artwork || legacy.artwork || legacy.artworkUrl || legacy.coverArt);

  const assets: TrackAssetDocument[] = [];
  if (audio) {
    assets.push({
      trackId,
      releaseId,
      ownerUserId,
      organizationId,
      type: 'audio',
      storageProvider: getStorageProvider(audio),
      path: /^https?:\/\//i.test(audio) ? undefined : audio,
      url: /^https?:\/\//i.test(audio) ? audio : asString(legacy.audioUrl) || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (artwork) {
    assets.push({
      trackId,
      releaseId,
      ownerUserId,
      organizationId,
      type: 'artwork',
      storageProvider: getStorageProvider(artwork),
      path: /^https?:\/\//i.test(artwork) ? undefined : artwork,
      url: /^https?:\/\//i.test(artwork) ? artwork : asString(legacy.artworkUrl) || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  return assets;
}

export async function upsertTrackAssetsFromTracks(
  db: Db,
  tracks: Array<Record<string, any>>,
  options: { dryRun?: boolean } = {}
) {
  await ensureTrackAssetIndexes(db);

  const operations: AnyBulkWriteOperation<TrackAssetDocument>[] = [];
  tracks.flatMap(buildAssetDocumentsFromTrack).forEach((asset) => {
    const { createdAt, ...setFields } = asset;
    operations.push({
      updateOne: {
        filter: { trackId: asset.trackId, type: asset.type },
        update: {
          $set: setFields,
          $setOnInsert: { createdAt },
        },
        upsert: true,
      },
    });
  });

  if (!operations.length || options.dryRun) {
    return { planned: operations.length, matched: 0, modified: 0, upserted: 0 };
  }

  const result = await trackAssetsCollection(db).bulkWrite(operations, { ordered: false });
  return {
    planned: operations.length,
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: result.upsertedCount,
  };
}

export async function listTrackAssetsForTrackIds(db: Db, trackIds: ObjectId[]) {
  if (!trackIds.length) return new Map<string, TrackAssetDocument[]>();
  const assets = await trackAssetsCollection(db).find({ trackId: { $in: trackIds } }).toArray();
  const byTrack = new Map<string, TrackAssetDocument[]>();
  assets.forEach((asset) => {
    const key = asset.trackId.toHexString();
    const list = byTrack.get(key) || [];
    list.push(asset);
    byTrack.set(key, list);
  });
  return byTrack;
}
