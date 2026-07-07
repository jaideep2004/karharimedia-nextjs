import mongoose from 'mongoose';
import { MongoServerError } from 'mongodb';

const AUDIO_COUNTRY_CODE = 'IN';
const AUDIO_REGISTRANT_CODE = '9SN';
const AUDIO_PREFIX = `${AUDIO_COUNTRY_CODE}${AUDIO_REGISTRANT_CODE}`;
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const MAX_DESIGNATION = 99999;

interface TrackIsrcContext {
  trackTitle?: string;
  releaseTitle?: string;
}

const getDb = () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection is not ready');
  return db;
};

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

async function ensureIndexes() {
  const db = getDb();
  await Promise.all([
    db.collection<any>('isrcAllocations').createIndex({ isrc: 1 }, { unique: true }),
    db.collection<any>('isrcCounters').createIndex({ prefix: 1, year: 1 }, { unique: true }),
  ]);
}

async function isAlreadyUsed(isrc: string) {
  const db = getDb();
  const [allocation, release, track] = await Promise.all([
    db.collection<any>('isrcAllocations').findOne({ isrc }, { projection: { _id: 1 } }),
    db.collection<any>('releases').findOne({ 'tracks.isrc': isrc }, { projection: { _id: 1 } }),
    db.collection<any>('tracks').findOne({ isrc }, { projection: { _id: 1 } }),
  ]);

  return Boolean(allocation || release || track);
}

async function reserveManualIsrc(isrc: string, context: TrackIsrcContext) {
  const db = getDb();

  if (await isAlreadyUsed(isrc)) {
    throw new Error(`ISRC ${formatIsrcForDisplay(isrc)} is already used.`);
  }

  try {
    await db.collection<any>('isrcAllocations').insertOne({
      _id: isrc,
      isrc,
      prefix: isrc.slice(0, 5),
      year: isrc.slice(5, 7),
      designation: Number(isrc.slice(7)),
      source: 'manual',
      status: 'reserved',
      trackTitle: context.trackTitle,
      releaseTitle: context.releaseTitle,
      createdAt: new Date(),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error(`ISRC ${formatIsrcForDisplay(isrc)} is already used.`);
    }
    throw error;
  }

  return isrc;
}

async function reserveGeneratedIsrc(context: TrackIsrcContext) {
  const db = getDb();
  const year = String(new Date().getFullYear()).slice(-2);

  for (let attempts = 0; attempts < MAX_DESIGNATION; attempts += 1) {
    const counter = await db.collection<any>('isrcCounters').findOneAndUpdate(
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
    if (await isAlreadyUsed(isrc)) continue;

    try {
      await db.collection<any>('isrcAllocations').insertOne({
        _id: isrc,
        isrc,
        prefix: AUDIO_PREFIX,
        year,
        designation: sequence,
        source: 'generated',
        status: 'reserved',
        trackTitle: context.trackTitle,
        releaseTitle: context.releaseTitle,
        createdAt: new Date(),
      });
      return isrc;
    } catch (error) {
      if (isDuplicateKeyError(error)) continue;
      throw error;
    }
  }

  throw new Error(`No unused ISRC designation remains for ${AUDIO_COUNTRY_CODE}-${AUDIO_REGISTRANT_CODE}-${year}.`);
}

export async function assignTrackIsrc(providedIsrc: string | undefined, context: TrackIsrcContext = {}) {
  await ensureIndexes();

  const normalized = providedIsrc?.trim() ? normalizeIsrc(providedIsrc) : '';
  return normalized ? reserveManualIsrc(normalized, context) : reserveGeneratedIsrc(context);
}

export async function markTrackIsrcAssigned(isrc: string, trackId: string) {
  const db = getDb();
  await db.collection<any>('isrcAllocations').updateOne(
    { isrc },
    {
      $set: {
        status: 'assigned',
        trackId,
        assignedAt: new Date(),
      },
    }
  );
}
