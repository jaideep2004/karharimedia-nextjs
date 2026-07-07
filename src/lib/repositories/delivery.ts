import { Db, ObjectId } from 'mongodb';

export function deliveryJobsCollection(db: Db) {
  return db.collection('deliveryjobs');
}

export function deliverySnapshotsCollection(db: Db) {
  return db.collection('releaseDeliverySnapshots');
}

export async function findDeliveryJobsForRelease(db: Db, releaseId: string | ObjectId) {
  const _id = typeof releaseId === 'string' && ObjectId.isValid(releaseId)
    ? new ObjectId(releaseId)
    : releaseId;

  return deliveryJobsCollection(db)
    .find({ releaseId: _id })
    .sort({ createdAt: -1 })
    .toArray();
}
