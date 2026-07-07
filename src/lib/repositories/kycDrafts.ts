import { Db, ObjectId } from 'mongodb';

export type KycDraftDocument = {
  _id?: ObjectId;
  ownerUserId: string;
  draft: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
};

export function kycDraftsCollection(db: Db) {
  return db.collection<KycDraftDocument>('kycDrafts');
}

export async function getKycDraftForUser(db: Db, ownerUserId: string) {
  return kycDraftsCollection(db).findOne({ ownerUserId });
}

export async function upsertKycDraftForUser(
  db: Db,
  ownerUserId: string,
  draft: Record<string, any>
) {
  const now = new Date();
  return kycDraftsCollection(db).findOneAndUpdate(
    { ownerUserId },
    {
      $set: {
        ownerUserId,
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

export async function deleteKycDraftForUser(db: Db, ownerUserId: string) {
  return kycDraftsCollection(db).deleteOne({ ownerUserId });
}
