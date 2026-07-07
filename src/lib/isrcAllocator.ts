import { Db, MongoServerError, ObjectId } from 'mongodb';
import { releasesCollection } from '@/lib/repositories/releases';
import { tracksCollection } from '@/lib/repositories/tracks';

const AUDIO_COUNTRY_CODE = 'IN';
const AUDIO_REGISTRANT_CODE = '9SN';
const AUDIO_PREFIX = `${AUDIO_COUNTRY_CODE}${AUDIO_REGISTRANT_CODE}`;
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const MAX_DESIGNATION = 99999;

type TrackLike = Record<string, unknown> & {
  title?: string;
  isrc?: string;
};

interface AllocationContext {
  releaseTitle?: string;
  source?: 'release' | 'track';
  releaseId?: string;
}

interface IsrcAllocation {
  _id: string;
  isrc: string;
  prefix: string;
  year: string;
  designation: number;
  source: 'generated' | 'manual';
  status: 'reserved' | 'assigned';
  trackTitle?: string;
  releaseTitle?: string;
  releaseId?: string;
  createdAt: Date;
  assignedAt?: Date;
}

const isDuplicateKeyError = (error: unknown) =>
  error instanceof MongoServerError && error.code === 11000;

export function normalizeIsrc(value: string): string {
  const normalized = value
    .toUpperCase()
    .replace(/^ISRC\s*/i, '')
    .replace(/[^A-Z0-9]/g, '');

  if (!ISRC_PATTERN.test(normalized)) {
    throw new Error('ISRC must be 12 characters: country, registrant, year, and 5 digit designation.');
  }

  return normalized;
}

export function formatIsrcForDisplay(isrc: string): string {
  const normalized = normalizeIsrc(isrc);
  return `${normalized.slice(0, 2)}-${normalized.slice(2, 5)}-${normalized.slice(5, 7)}-${normalized.slice(7)}`;
}

async function ensureIsrcIndexes(db: Db) {
  await Promise.all([
    db.collection<IsrcAllocation>('isrcAllocations').createIndex({ isrc: 1 }, { unique: true }),
    db.collection('isrcCounters').createIndex({ prefix: 1, year: 1 }, { unique: true }),
  ]);
}

async function isAlreadyUsed(db: Db, isrc: string, context: AllocationContext = {}) {
  const releaseQuery: Record<string, unknown> = { 'tracks.isrc': isrc };
  const trackQuery: Record<string, unknown> = { isrc, deletedAt: { $exists: false } };
  const allocationQuery: Record<string, unknown> = { isrc };
  if (context.releaseId) {
    const releaseObjectId = ObjectId.isValid(context.releaseId) ? new ObjectId(context.releaseId) : context.releaseId;
    releaseQuery._id = { $ne: releaseObjectId };
    trackQuery.releaseId = { $ne: releaseObjectId };
    allocationQuery.$or = [{ releaseId: { $exists: false } }, { releaseId: { $ne: context.releaseId } }];
  }

  const [allocation, release, track] = await Promise.all([
    db.collection('isrcAllocations').findOne(allocationQuery, { projection: { _id: 1 } }),
    releasesCollection(db).findOne(releaseQuery, { projection: { _id: 1 } }),
    tracksCollection(db).findOne(trackQuery, { projection: { _id: 1 } }),
  ]);

  return Boolean(allocation || release || track);
}

async function reserveManualIsrc(db: Db, isrc: string, track: TrackLike, context: AllocationContext) {
  if (context.releaseId) {
    const existing = await db.collection<IsrcAllocation>('isrcAllocations').findOne({ isrc, releaseId: context.releaseId });
    if (existing) return isrc;
  }

  if (await isAlreadyUsed(db, isrc, context)) {
    throw new Error(`ISRC ${formatIsrcForDisplay(isrc)} is already used.`);
  }

  const allocation: IsrcAllocation = {
    _id: isrc,
    isrc,
    prefix: isrc.slice(0, 5),
    year: isrc.slice(5, 7),
    designation: Number(isrc.slice(7)),
    source: 'manual',
    status: 'reserved',
    trackTitle: track.title,
    releaseTitle: context.releaseTitle,
    createdAt: new Date(),
  };

  try {
    await db.collection<IsrcAllocation>('isrcAllocations').insertOne(allocation);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error(`ISRC ${formatIsrcForDisplay(isrc)} is already used.`);
    }
    throw error;
  }

  return isrc;
}

async function reserveGeneratedIsrc(db: Db, track: TrackLike, context: AllocationContext) {
  const year = String(new Date().getFullYear()).slice(-2);

  for (let attempts = 0; attempts < MAX_DESIGNATION; attempts += 1) {
    const counter = await db.collection('isrcCounters').findOneAndUpdate(
      { _id: `${AUDIO_PREFIX}:${year}` },
      {
        $setOnInsert: {
          _id: `${AUDIO_PREFIX}:${year}`,
          prefix: AUDIO_PREFIX,
          year,
          createdAt: new Date(),
        },
        $inc: { lastSequence: 1 },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' }
    );

    const sequence = Number(counter.value?.lastSequence ?? 0);
    if (sequence < 1 || sequence > MAX_DESIGNATION) {
      throw new Error(`ISRC sequence exhausted for ${AUDIO_COUNTRY_CODE}-${AUDIO_REGISTRANT_CODE}-${year}.`);
    }

    const isrc = `${AUDIO_PREFIX}${year}${String(sequence).padStart(5, '0')}`;

    if (await isAlreadyUsed(db, isrc, context)) continue;

    const allocation: IsrcAllocation = {
      _id: isrc,
      isrc,
      prefix: AUDIO_PREFIX,
      year,
      designation: sequence,
      source: 'generated',
      status: 'reserved',
      trackTitle: track.title,
      releaseTitle: context.releaseTitle,
      createdAt: new Date(),
    };

    try {
      await db.collection<IsrcAllocation>('isrcAllocations').insertOne(allocation);
      return isrc;
    } catch (error) {
      if (isDuplicateKeyError(error)) continue;
      throw error;
    }
  }

  throw new Error(`No unused ISRC designation remains for ${AUDIO_COUNTRY_CODE}-${AUDIO_REGISTRANT_CODE}-${year}.`);
}

export async function assignIsrcsToTracks<T extends TrackLike>(
  db: Db,
  tracks: T[],
  context: AllocationContext = {}
): Promise<T[]> {
  await ensureIsrcIndexes(db);

  const assignedTracks: T[] = [];
  const seenInRequest = new Set<string>();

  for (const track of tracks) {
    const rawIsrc = typeof track.isrc === 'string' ? track.isrc.trim() : '';
    const isrc = rawIsrc
      ? await reserveManualIsrc(db, normalizeIsrc(rawIsrc), track, context)
      : await reserveGeneratedIsrc(db, track, context);

    if (seenInRequest.has(isrc)) {
      throw new Error(`Duplicate ISRC ${formatIsrcForDisplay(isrc)} in release payload.`);
    }
    seenInRequest.add(isrc);

    assignedTracks.push({ ...track, isrc });
  }

  return assignedTracks;
}

export async function markIsrcsAssigned(db: Db, isrcs: string[], releaseId: string) {
  if (!isrcs.length) return;

  await db.collection<IsrcAllocation>('isrcAllocations').updateMany(
    { isrc: { $in: isrcs } },
    {
      $set: {
        status: 'assigned',
        releaseId,
        assignedAt: new Date(),
      },
    }
  );
}

export const AUDIO_ISRC_PREFIX = AUDIO_PREFIX;
