import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { MongoClient, ObjectId } from 'mongodb';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length))) : 0;

function loadServerEnv() {
  const envPath = path.resolve(process.cwd(), 'server/.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function asString(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(asString).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
      return value.toString();
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function trackKey(releaseId, track, index) {
  return asString(track?._id || track?.id || track?.isrc || `${releaseId}-${index}`);
}

function ownerUserId(release) {
  return release.ownerUserId || release.userId || release.artistId || release.ownerId || release.createdBy;
}

function canonicalFromReleaseTrack(release, track, index, now) {
  const releaseId = release._id instanceof ObjectId ? release._id : new ObjectId(release._id);
  const releaseIdString = releaseId.toHexString();
  return {
    releaseId,
    ownerUserId: ownerUserId(release),
    organizationId: ObjectId.isValid(release.organizationId || '')
      ? new ObjectId(release.organizationId)
      : undefined,
    title: asString(track?.title || track?.name) || undefined,
    isrc: asString(track?.isrc || track?.ISRC) || undefined,
    genre: asString(track?.genre) || undefined,
    audioFile: asString(track?.audioFile || track?.audioUrl) || undefined,
    artwork: asString(track?.artwork || release.artworkUrl) || undefined,
    status: asString(track?.status || release.status) || undefined,
    publishingStatus: ['approved', 'completed'].includes(track?.publishingStatus)
      ? track.publishingStatus
      : 'pending',
    releaseTrackIndex: index,
    legacyTrackKey: trackKey(releaseIdString, track, index),
    source: 'release_embed',
    legacyMetadata: { ...(track || {}) },
    createdAt: now,
    updatedAt: now,
  };
}

async function ensureIndexes(db) {
  const tracks = db.collection('tracks');
  await Promise.all([
    tracks.createIndex({ releaseId: 1, releaseTrackIndex: 1 }),
    tracks.createIndex(
      { releaseId: 1, legacyTrackKey: 1, source: 1 },
      { sparse: true, name: 'tracks_release_legacy_source_lookup' }
    ),
    tracks.createIndex({ isrc: 1 }, { sparse: true }),
    tracks.createIndex({ ownerUserId: 1 }),
    tracks.createIndex({ publishingStatus: 1 }),
    tracks.createIndex({ deletedAt: 1 }, { sparse: true }),
  ]);
}

async function main() {
  loadServerEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  if (write) await ensureIndexes(db);

  const query = { tracks: { $type: 'array', $ne: [] } };
  const cursor = db.collection('releases').find(query).sort({ createdAt: 1 });
  if (limit) cursor.limit(limit);

  const report = {
    mode: write ? 'write' : 'dry-run',
    releasesScanned: 0,
    embeddedTracks: 0,
    plannedUpserts: 0,
    matched: 0,
    modified: 0,
    upserted: 0,
    skipped: 0,
    conflicts: [],
  };

  for await (const release of cursor) {
    report.releasesScanned += 1;
    const tracks = Array.isArray(release.tracks) ? release.tracks : [];
    report.embeddedTracks += tracks.length;

    const now = new Date();
    const operations = tracks.map((track, index) => {
      const canonical = canonicalFromReleaseTrack(release, track, index, now);
      const { createdAt, ...setFields } = canonical;
      return {
        updateOne: {
          filter: {
            releaseId: canonical.releaseId,
            legacyTrackKey: canonical.legacyTrackKey,
            source: 'release_embed',
          },
          update: {
            $set: setFields,
            $setOnInsert: { createdAt },
            $unset: { deletedAt: '' },
          },
          upsert: true,
        },
      };
    });

    report.plannedUpserts += operations.length;
    if (!write || !operations.length) continue;

    try {
      const result = await db.collection('tracks').bulkWrite(operations, { ordered: false });
      report.matched += result.matchedCount;
      report.modified += result.modifiedCount;
      report.upserted += result.upsertedCount;
    } catch (error) {
      report.conflicts.push({
        releaseId: asString(release._id),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await client.close();

  if (report.conflicts.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
