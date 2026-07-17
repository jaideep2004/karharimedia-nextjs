import { Db, ObjectId } from 'mongodb';

export type ReleaseDraftDocument = {
  _id?: ObjectId;
  ownerUserId: string;
  draftId: string;
  draft: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
};

export function releaseDraftsCollection(db: Db) {
  return db.collection<ReleaseDraftDocument>('releaseDrafts');
}

const draftIndexPromises = new WeakMap<Db, Promise<string[]>>();

export async function ensureReleaseDraftIndexes(db: Db) {
  let pending = draftIndexPromises.get(db);
  if (!pending) {
    pending = releaseDraftsCollection(db).createIndexes([
      {
        key: { ownerUserId: 1, draftId: 1 },
        name: 'release_drafts_owner_draft_unique',
        unique: true,
        partialFilterExpression: { draftId: { $type: 'string' } },
      },
      {
        key: { ownerUserId: 1, updatedAt: -1 },
        name: 'release_drafts_owner_updated',
      },
    ]);
    draftIndexPromises.set(db, pending);
  }
  await pending;
}

const draftIdentityQuery = (ownerUserId: string, draftId: string) => ({
  ownerUserId,
  $or: [
    { draftId },
    ...(ObjectId.isValid(draftId) ? [{ _id: new ObjectId(draftId) }] : []),
  ],
});

export async function listReleaseDraftsForUser(db: Db, ownerUserId: string) {
  return releaseDraftsCollection(db)
    .find({ ownerUserId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();
}

export async function getReleaseDraftForUser(
  db: Db,
  ownerUserId: string,
  draftId?: string
) {
  if (!draftId) {
    return releaseDraftsCollection(db).findOne(
      { ownerUserId },
      { sort: { updatedAt: -1, createdAt: -1 } }
    );
  }
  return releaseDraftsCollection(db).findOne(draftIdentityQuery(ownerUserId, draftId));
}

export async function upsertReleaseDraftForUser(
  db: Db,
  ownerUserId: string,
  draftId: string,
  draft: Record<string, any>
) {
  const now = new Date();
  return releaseDraftsCollection(db).findOneAndUpdate(
    draftIdentityQuery(ownerUserId, draftId),
    {
      $set: {
        ownerUserId,
        draftId,
        draft,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );
}

export async function deleteReleaseDraftForUser(
  db: Db,
  ownerUserId: string,
  draftId: string
) {
  return releaseDraftsCollection(db).deleteOne(draftIdentityQuery(ownerUserId, draftId));
}

export async function listAllReleaseDrafts(db: Db) {
  return releaseDraftsCollection(db)
    .aggregate<ReleaseDraftDocument & { ownerEmail?: string; ownerName?: string }>([
      {
        $addFields: {
          ownerUserIdObj: { $convert: { input: '$ownerUserId', to: 'objectId', onError: null, onNull: null } },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'ownerUserIdObj',
          foreignField: '_id',
          as: 'owner',
        },
      },
      { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          ownerEmail: '$owner.email',
          ownerName: { $ifNull: ['$owner.name', '$owner.artistName', 'Unknown'] },
        },
      },
      { $project: { owner: 0, ownerUserIdObj: 0 } },
      { $sort: { updatedAt: -1, createdAt: -1 } },
    ])
    .toArray();
}

export async function deleteReleaseDraftById(db: Db, draftId: string) {
  const _id = ObjectId.isValid(draftId) ? new ObjectId(draftId) : undefined;
  if (!_id) return null;
  return releaseDraftsCollection(db).deleteOne({ _id });
}
