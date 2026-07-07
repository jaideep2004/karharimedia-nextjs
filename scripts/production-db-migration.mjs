import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { MongoClient, ObjectId } from 'mongodb';

const args = process.argv.slice(2);
const mode = args[0] || 'preflight';
const write = args.includes('--write');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length))) : 0;
const batchSize = Math.max(50, Number(process.env.DB_MIGRATION_BATCH_SIZE || 250));

function loadServerEnv() {
  const envPath = path.resolve(process.cwd(), 'server/.env');
  if (!fs.existsSync(envPath)) return;

  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

function asString(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(asString).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) return value.toString();
    return JSON.stringify(value);
  }
  return String(value);
}

function toObjectId(value) {
  if (value instanceof ObjectId) return value;
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value);
  return null;
}

function ownerUserId(doc) {
  return doc.ownerUserId || doc.userId || doc.artistId || doc.ownerId || doc.createdBy;
}

function trackKey(releaseId, track, index) {
  return asString(track?._id || track?.id || track?.isrc || `${releaseId}-${index}`);
}

function slugForUser(user) {
  return `personal-${asString(user._id)}`;
}

function orgName(user) {
  return user.artistName || user.name || user.email || `User ${asString(user._id).slice(-6)}`;
}

function storageProvider(value) {
  if (!value) return 'unknown';
  return /^https?:\/\//i.test(value) ? 'external' : 'local';
}

function canonicalTrack(release, track, index) {
  const releaseId = release._id instanceof ObjectId ? release._id : new ObjectId(release._id);
  const now = new Date();
  const releaseIdString = releaseId.toHexString();
  return {
    releaseId,
    ownerUserId: ownerUserId(release),
    organizationId: toObjectId(release.organizationId) || undefined,
    title: asString(track?.title || track?.name) || undefined,
    isrc: asString(track?.isrc || track?.ISRC) || undefined,
    genre: asString(track?.genre) || undefined,
    audioFile: asString(track?.audioFile || track?.audioUrl) || undefined,
    artwork: asString(track?.artwork || release.artworkUrl) || undefined,
    status: asString(track?.status || release.status) || undefined,
    publishingStatus: ['approved', 'completed'].includes(track?.publishingStatus) ? track.publishingStatus : 'pending',
    releaseTrackIndex: index,
    legacyTrackKey: trackKey(releaseIdString, track, index),
    source: 'release_embed',
    legacyMetadata: { ...(track || {}) },
    createdAt: now,
    updatedAt: now,
  };
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('tracks').createIndex({ releaseId: 1, releaseTrackIndex: 1 }),
    db.collection('tracks').createIndex(
      { releaseId: 1, legacyTrackKey: 1, source: 1 },
      { sparse: true, name: 'tracks_release_legacy_source_lookup' }
    ),
    db.collection('tracks').createIndex({ isrc: 1 }, { sparse: true }),
    db.collection('tracks').createIndex({ ownerUserId: 1 }),
    db.collection('tracks').createIndex({ organizationId: 1 }),
    db.collection('trackAssets').createIndex({ trackId: 1, type: 1 }),
    db.collection('trackFingerprints').createIndex({ trackId: 1, provider: 1, fileId: 1 }),
    db.collection('organizations').createIndex({ slug: 1 }, { unique: true }),
    db.collection('organizationMembers').createIndex({ organizationId: 1, userId: 1 }, { unique: true }),
  ]);
}

async function createUniqueIndexes(db) {
  return {
    mode: 'indexes-create',
    write,
    indexes: write
      ? await Promise.all([
          db.collection('tracks').createIndex({ releaseId: 1, legacyTrackKey: 1 }, { unique: true, sparse: true, name: 'tracks_release_legacy_key_unique' }),
          db.collection('organizations').createIndex({ slug: 1 }, { unique: true }),
          db.collection('organizationMembers').createIndex({ organizationId: 1, userId: 1 }, { unique: true }),
        ])
      : [
          'tracks.releaseId_legacyTrackKey unique sparse',
          'organizations.slug unique',
          'organizationMembers.organizationId_userId unique',
        ],
  };
}

async function preflight(db) {
  const [
    releasesWithTracks,
    embeddedCount,
    canonicalCount,
    duplicateTrackKeys,
    duplicateIsrcs,
    missingReleaseId,
    releasesMissingOwner,
    tracksMissingOwner,
    tracksMissingOrg,
  ] = await Promise.all([
    db.collection('releases').countDocuments({ tracks: { $type: 'array', $ne: [] } }),
    db.collection('releases').aggregate([
      { $project: { count: { $size: { $ifNull: ['$tracks', []] } } } },
      { $group: { _id: null, count: { $sum: '$count' } } },
    ]).next(),
    db.collection('tracks').countDocuments({ source: 'release_embed', deletedAt: { $exists: false } }),
    db.collection('tracks').aggregate([
      { $match: { source: 'release_embed', deletedAt: { $exists: false }, legacyTrackKey: { $exists: true } } },
      { $group: { _id: { releaseId: '$releaseId', legacyTrackKey: '$legacyTrackKey' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 25 },
    ]).toArray(),
    db.collection('tracks').aggregate([
      { $match: { deletedAt: { $exists: false }, isrc: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$isrc', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 25 },
    ]).toArray(),
    db.collection('tracks').countDocuments({ source: 'release_embed', releaseId: { $exists: false } }),
    db.collection('releases').countDocuments({ ownerUserId: { $exists: false } }),
    db.collection('tracks').countDocuments({ ownerUserId: { $exists: false } }),
    db.collection('tracks').countDocuments({ source: 'release_embed', organizationId: { $exists: false } }),
  ]);

  return {
    mode: 'preflight',
    releasesWithTracks,
    embeddedTracks: embeddedCount?.count || 0,
    canonicalReleaseTracks: canonicalCount,
    duplicateTrackKeys,
    duplicateIsrcs,
    missingReleaseId,
    releasesMissingOwner,
    tracksMissingOwner,
    tracksMissingOrg,
  };
}

async function backfillTracks(db) {
  if (write) await ensureIndexes(db);
  const report = { mode, write, releasesScanned: 0, embeddedTracks: 0, plannedUpserts: 0, matched: 0, modified: 0, upserted: 0, conflicts: [] };
  const cursor = db.collection('releases').find({ tracks: { $type: 'array', $ne: [] } }).sort({ createdAt: 1 }).batchSize(batchSize);
  if (limit) cursor.limit(limit);

  for await (const release of cursor) {
    report.releasesScanned += 1;
    const tracks = Array.isArray(release.tracks) ? release.tracks : [];
    report.embeddedTracks += tracks.length;
    const operations = tracks.map((track, index) => {
      const canonical = canonicalTrack(release, track, index);
      const { createdAt, ...setFields } = canonical;
      return {
        updateOne: {
          filter: { releaseId: canonical.releaseId, legacyTrackKey: canonical.legacyTrackKey, source: 'release_embed' },
          update: { $set: setFields, $setOnInsert: { createdAt }, $unset: { deletedAt: '' } },
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
      report.conflicts.push({ releaseId: asString(release._id), message: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

async function backfillOwnership(db) {
  const report = { mode, write, releasesScanned: 0, releasesPlanned: 0, tracksPlanned: 0, releasesUpdated: 0, tracksUpdated: 0 };
  const cursor = db.collection('releases').find({}).batchSize(batchSize);
  if (limit) cursor.limit(limit);

  for await (const release of cursor) {
    report.releasesScanned += 1;
    const owner = ownerUserId(release);
    if (!owner) continue;
    if (!release.ownerUserId) {
      report.releasesPlanned += 1;
      if (write) {
        const result = await db.collection('releases').updateOne({ _id: release._id }, { $set: { ownerUserId: owner, updatedAt: new Date() } });
        report.releasesUpdated += result.modifiedCount;
      }
    }
    report.tracksPlanned += 1;
    if (write) {
      const result = await db.collection('tracks').updateMany({ releaseId: release._id, ownerUserId: { $exists: false } }, { $set: { ownerUserId: owner, updatedAt: new Date() } });
      report.tracksUpdated += result.modifiedCount;
    }
  }
  return report;
}

async function backfillOrganizations(db) {
  if (write) await ensureIndexes(db);
  const report = { mode, write, usersScanned: 0, orgsPlanned: 0, orgsUpserted: 0, membersUpserted: 0, releasesUpdated: 0, tracksUpdated: 0 };
  const cursor = db.collection('users').find({}).batchSize(batchSize);
  if (limit) cursor.limit(limit);

  for await (const user of cursor) {
    report.usersScanned += 1;
    const slug = slugForUser(user);
    report.orgsPlanned += 1;
    if (!write) continue;
    const now = new Date();
    const orgResult = await db.collection('organizations').findOneAndUpdate(
      { slug },
      {
        $set: { name: orgName(user), ownerUserId: user._id, type: 'personal', featureEnabled: process.env.ENABLE_ORGANIZATIONS === 'true', updatedAt: now },
        $setOnInsert: { slug, createdAt: now },
      },
      { upsert: true, returnDocument: 'after' }
    );
    if (orgResult.lastErrorObject?.upserted) report.orgsUpserted += 1;
    const org = orgResult.value;
    if (!org?._id) continue;
    await db.collection('organizationMembers').updateOne(
      { organizationId: org._id, userId: user._id },
      { $set: { role: 'owner', status: 'active', updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    report.membersUpserted += 1;
    const ownerCandidates = [user._id, asString(user._id)];
    report.releasesUpdated += (await db.collection('releases').updateMany({ ownerUserId: { $in: ownerCandidates }, organizationId: { $exists: false } }, { $set: { organizationId: org._id, updatedAt: now } })).modifiedCount;
    report.tracksUpdated += (await db.collection('tracks').updateMany({ ownerUserId: { $in: ownerCandidates }, organizationId: { $exists: false } }, { $set: { organizationId: org._id, updatedAt: now } })).modifiedCount;
  }
  return report;
}

function assetOpsFromTrack(track) {
  const legacy = track.legacyMetadata || {};
  const sources = [
    ['audio', asString(track.audioFile || legacy.audioFile || legacy.audioUrl || legacy.audio)],
    ['artwork', asString(track.artwork || legacy.artwork || legacy.artworkUrl || legacy.coverArt)],
  ].filter(([, value]) => value);
  const now = new Date();
  return sources.map(([type, value]) => ({
    updateOne: {
      filter: { trackId: track._id, type },
      update: {
        $set: {
          trackId: track._id,
          releaseId: track.releaseId,
          ownerUserId: track.ownerUserId,
          organizationId: track.organizationId,
          type,
          storageProvider: storageProvider(value),
          path: /^https?:\/\//i.test(value) ? undefined : value,
          url: /^https?:\/\//i.test(value) ? value : undefined,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      upsert: true,
    },
  }));
}

async function backfillAssets(db) {
  if (write) await ensureIndexes(db);
  const report = { mode, write, tracksScanned: 0, plannedUpserts: 0, matched: 0, modified: 0, upserted: 0 };
  const cursor = db.collection('tracks').find({ source: 'release_embed', deletedAt: { $exists: false } }).batchSize(batchSize);
  if (limit) cursor.limit(limit);
  for await (const track of cursor) {
    report.tracksScanned += 1;
    const operations = assetOpsFromTrack(track);
    report.plannedUpserts += operations.length;
    if (!write || !operations.length) continue;
    const result = await db.collection('trackAssets').bulkWrite(operations, { ordered: false });
    report.matched += result.matchedCount;
    report.modified += result.modifiedCount;
    report.upserted += result.upsertedCount;
  }
  return report;
}

function fingerprintOpFromTrack(track) {
  const acrCloud = track.legacyMetadata?.acrCloud || track.acrCloud;
  if (!acrCloud) return null;
  const now = new Date();
  return {
    updateOne: {
      filter: { trackId: track._id, provider: 'acrcloud', fileId: acrCloud.fileId || null },
      update: {
        $set: {
          trackId: track._id,
          releaseId: track.releaseId,
          provider: 'acrcloud',
          fileId: acrCloud.fileId,
          scanState: acrCloud.scanState || acrCloud.state,
          aiDetection: Array.isArray(acrCloud.aiDetection) ? acrCloud.aiDetection : [],
          fingerprintMatches: Array.isArray(acrCloud.fingerprintMatches) ? acrCloud.fingerprintMatches : [],
          rawResult: acrCloud.rawResult,
          checkedAt: acrCloud.checkedAt,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      upsert: true,
    },
  };
}

async function backfillFingerprints(db) {
  if (write) await ensureIndexes(db);
  const report = { mode, write, tracksScanned: 0, plannedUpserts: 0, matched: 0, modified: 0, upserted: 0 };
  const cursor = db.collection('tracks').find({ source: 'release_embed', deletedAt: { $exists: false } }).batchSize(batchSize);
  if (limit) cursor.limit(limit);
  for await (const track of cursor) {
    report.tracksScanned += 1;
    const operation = fingerprintOpFromTrack(track);
    if (!operation) continue;
    report.plannedUpserts += 1;
    if (!write) continue;
    const result = await db.collection('trackFingerprints').bulkWrite([operation], { ordered: false });
    report.matched += result.matchedCount;
    report.modified += result.modifiedCount;
    report.upserted += result.upsertedCount;
  }
  return report;
}

async function parityTracks(db) {
  const mismatches = [];
  const cursor = db.collection('releases').find({ tracks: { $type: 'array', $ne: [] } }).batchSize(batchSize);
  if (limit) cursor.limit(limit);
  let releasesScanned = 0;
  let embeddedTracks = 0;
  let canonicalTracks = 0;
  for await (const release of cursor) {
    releasesScanned += 1;
    const embeddedCount = Array.isArray(release.tracks) ? release.tracks.length : 0;
    const canonicalCount = await db.collection('tracks').countDocuments({ releaseId: release._id, source: 'release_embed', deletedAt: { $exists: false } });
    embeddedTracks += embeddedCount;
    canonicalTracks += canonicalCount;
    if (embeddedCount !== canonicalCount && mismatches.length < 25) {
      mismatches.push({ releaseId: asString(release._id), embeddedCount, canonicalCount });
    }
  }
  return { mode: 'parity-tracks', releasesScanned, embeddedTracks, canonicalTracks, mismatches };
}

async function parityOwnership(db) {
  return {
    mode: 'parity-ownership',
    releasesMissingOwnerUserId: await db.collection('releases').countDocuments({ ownerUserId: { $exists: false } }),
    tracksMissingOwnerUserId: await db.collection('tracks').countDocuments({ ownerUserId: { $exists: false } }),
    releasesMissingOrganizationId: await db.collection('releases').countDocuments({ organizationId: { $exists: false } }),
    tracksMissingOrganizationId: await db.collection('tracks').countDocuments({ source: 'release_embed', organizationId: { $exists: false } }),
  };
}

async function cleanupLegacyReleaseTracks(db) {
  const parity = await parityTracks(db);
  const releasesWithLegacyTracks = await db.collection('releases').countDocuments({
    tracks: { $type: 'array' },
  });
  const releasesWithNonEmptyLegacyTracks = await db.collection('releases').countDocuments({
    tracks: { $type: 'array', $ne: [] },
  });
  const report = {
    mode: 'legacy-release-tracks-cleanup',
    write,
    releasesWithLegacyTracks,
    releasesWithNonEmptyLegacyTracks,
    embeddedTracks: parity.embeddedTracks,
    canonicalTracks: parity.canonicalTracks,
    parityMismatches: parity.mismatches,
    releasesModified: 0,
  };

  if (!write) return report;
  if (parity.mismatches.length || parity.embeddedTracks !== parity.canonicalTracks) {
    throw new Error('Refusing to unset releases.tracks: canonical track parity has not passed.');
  }

  const result = await db.collection('releases').updateMany(
    { tracks: { $type: 'array' } },
    { $unset: { tracks: '' }, $set: { tracksMigratedAt: new Date(), updatedAt: new Date() } }
  );
  report.releasesModified = result.modifiedCount;
  return report;
}

async function main() {
  loadServerEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const handlers = {
    preflight,
    'tracks-backfill': backfillTracks,
    'ownership-backfill': backfillOwnership,
    'orgs-backfill': backfillOrganizations,
    'track-assets-backfill': backfillAssets,
    'track-fingerprints-backfill': backfillFingerprints,
    'parity-tracks': parityTracks,
    'parity-ownership': parityOwnership,
    'indexes-create': createUniqueIndexes,
    'legacy-release-tracks-cleanup': cleanupLegacyReleaseTracks,
  };
  const handler = handlers[mode];
  if (!handler) throw new Error(`Unknown mode "${mode}"`);

  const report = await handler(db);
  console.log(JSON.stringify(report, null, 2));
  await client.close();
  if (report.conflicts?.length || report.mismatches?.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
