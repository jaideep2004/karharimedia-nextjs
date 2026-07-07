import { Db, ObjectId } from 'mongodb';

export function royaltiesCollection(db: Db) {
  return db.collection('royalties');
}

export function payoutsCollection(db: Db) {
  return db.collection('payouts');
}

export async function findRoyaltiesForTrack(db: Db, trackId: string | ObjectId) {
  const normalizedTrackId = typeof trackId === 'string' && ObjectId.isValid(trackId)
    ? new ObjectId(trackId)
    : trackId;

  return royaltiesCollection(db)
    .find({ trackId: normalizedTrackId })
    .sort({ reportingDate: -1 })
    .toArray();
}
