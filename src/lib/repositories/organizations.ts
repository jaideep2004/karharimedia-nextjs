import { Db, ObjectId } from 'mongodb';
import { toObjectId } from '@/lib/repositories/tracks';

export type OrganizationRole = 'owner' | 'admin' | 'content_manager' | 'finance' | 'viewer';

export type OrganizationDocument = {
  _id?: ObjectId;
  name: string;
  slug: string;
  type: 'personal' | 'label';
  ownerUserId: ObjectId | string;
  featureEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type OrganizationMemberDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  userId: ObjectId | string;
  role: OrganizationRole;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
};

let indexesReady: Promise<void> | null = null;

export function organizationsEnabled() {
  return process.env.ENABLE_ORGANIZATIONS === 'true';
}

export function organizationsCollection(db: Db) {
  return db.collection<OrganizationDocument>('organizations');
}

export function organizationMembersCollection(db: Db) {
  return db.collection<OrganizationMemberDocument>('organizationMembers');
}

export function artistProfilesCollection(db: Db) {
  return db.collection('artistProfiles');
}

export async function ensureOrganizationIndexes(db: Db) {
  if (!indexesReady) {
    indexesReady = Promise.all([
      organizationsCollection(db).createIndex({ slug: 1 }, { unique: true }),
      organizationsCollection(db).createIndex({ ownerUserId: 1 }),
      organizationMembersCollection(db).createIndex(
        { organizationId: 1, userId: 1 },
        { unique: true }
      ),
      organizationMembersCollection(db).createIndex({ userId: 1, status: 1 }),
      artistProfilesCollection(db).createIndex({ organizationId: 1 }),
    ]).then(() => undefined);
  }

  await indexesReady;
}

export function slugifyOrganization(value: unknown, fallback = 'organization') {
  const slug = String(value || fallback)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 72);

  return slug || fallback;
}

export async function ensurePersonalOrganizationForUser(
  db: Db,
  user: { _id: string | ObjectId; name?: string; artistName?: string; email?: string }
) {
  await ensureOrganizationIndexes(db);

  const now = new Date();
  const userId = toObjectId(user._id) || String(user._id);
  const userKey = userId instanceof ObjectId ? userId.toHexString() : String(userId);
  const baseName = user.artistName || user.name || user.email || `User ${userKey.slice(-6)}`;
  const slug = `personal-${userKey}`;

  const result = await organizationsCollection(db).findOneAndUpdate(
    { slug },
    {
      $set: {
        name: baseName,
        ownerUserId: userId,
        type: 'personal',
        featureEnabled: organizationsEnabled(),
        updatedAt: now,
      },
      $setOnInsert: {
        slug,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  const organization = result.value;
  if (!organization?._id) {
    throw new Error('Failed to ensure personal organization');
  }

  await organizationMembersCollection(db).updateOne(
    { organizationId: organization._id, userId },
    {
      $set: {
        role: 'owner',
        status: 'active',
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  return organization;
}

export async function getDefaultOrganizationIdForUser(
  db: Db,
  user: { _id: string | ObjectId; name?: string; artistName?: string; email?: string }
) {
  const organization = await ensurePersonalOrganizationForUser(db, user);
  return organization._id;
}
