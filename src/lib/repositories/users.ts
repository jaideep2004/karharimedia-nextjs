import { Db, ObjectId } from 'mongodb';
import { toObjectId } from '@/lib/repositories/tracks';

export type UserSnapshot = {
  _id: ObjectId;
  name?: string;
  email?: string;
  artistName?: string;
  role?: string;
};

export function usersCollection(db: Db) {
  return db.collection<UserSnapshot>('users');
}

export async function findUserById(db: Db, id: string | ObjectId) {
  const _id = toObjectId(id);
  if (!_id) return null;
  return usersCollection(db).findOne({ _id }, { projection: { password: 0 } });
}

export async function findUsersByIds(db: Db, ids: Array<string | ObjectId>) {
  const objectIds = ids
    .map(toObjectId)
    .filter((value): value is ObjectId => Boolean(value));

  if (!objectIds.length) return [];
  return usersCollection(db)
    .find({ _id: { $in: objectIds } }, { projection: { password: 0 } })
    .toArray();
}
