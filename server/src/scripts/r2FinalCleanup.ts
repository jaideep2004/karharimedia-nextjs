import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/db';

dotenv.config();

const BATCH_SIZE = 500;

const args = process.argv.slice(2);
const isWrite = args.includes('--write');
const isDryRun = !isWrite;

function extractFilename(url: unknown): string | null {
  if (!url) return null;
  const s = String(url).trim();
  if (!s) return null;
  try {
    return decodeURIComponent(s.split('/').pop() || s);
  } catch {
    return s.split('/').pop() || s;
  }
}

async function bulkWrite(coll: any, ops: any[]) {
  if (ops.length === 0) return;
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    await coll.bulkWrite(ops.slice(i, i + BATCH_SIZE), { ordered: false });
  }
}

async function cleanup() {
  const db = mongoose.connection.db!;
  let totalOps = 0;

  // ── 1. tracks.artwork: transform URL → filename ──
  const tracksColl = db.collection('tracks');
  const trackDocs = await tracksColl.find({ artwork: /^https?:\/\//i }).toArray();
  console.log(`\n[1/6] tracks.artwork: ${trackDocs.length} docs with URL value`);
  const ops1: any[] = [];
  for (const doc of trackDocs) {
    const filename = extractFilename(doc.artwork);
    if (!filename) continue;
    ops1.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { artwork: filename } } } });
    totalOps++;
  }
  if (ops1.length > 0) {
    if (isWrite) await bulkWrite(tracksColl, ops1);
    console.log(`  ${ops1.length} artwork fields ${isWrite ? 'updated' : 'would be updated'}${isDryRun ? ' (dry-run)' : ''}`);
  }

  // ── 2. trackAssets: backfill artwork path from url, remove url where path exists ──
  const assetColl = db.collection('trackAssets');

  // 2a: Backfill path for artwork assets
  const artNoPath = await assetColl.find({
    type: 'artwork',
    url: { $exists: true, $ne: '' },
    $or: [{ path: null }, { path: '' }, { path: { $exists: false } }],
  }).toArray();
  console.log(`\n[2a/6] trackAssets artwork: ${artNoPath.length} docs missing path`);
  const ops2a: any[] = [];
  for (const doc of artNoPath) {
    const filename = extractFilename(doc.url);
    if (!filename) continue;
    ops2a.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { path: filename, storageProvider: 'r2' } } } });
    totalOps++;
  }
  if (ops2a.length > 0) {
    if (isWrite) await bulkWrite(assetColl, ops2a);
    console.log(`  ${ops2a.length} artwork paths ${isWrite ? 'backfilled' : 'would be backfilled'}${isDryRun ? ' (dry-run)' : ''}`);
  }

  // 2b: Remove url where path exists
  const hasPath = await assetColl.find({
    path: { $ne: null, $exists: true },
    url: { $exists: true, $ne: '' },
  }).toArray();
  console.log(`\n[2b/6] trackAssets.url: ${hasPath.length} docs with both path+url`);
  const ops2b: any[] = [];
  for (const doc of hasPath) {
    ops2b.push({ updateOne: { filter: { _id: doc._id }, update: { $unset: { url: '' } } } });
    totalOps++;
  }
  if (ops2b.length > 0) {
    if (isWrite) await bulkWrite(assetColl, ops2b);
    console.log(`  ${ops2b.length} url fields ${isWrite ? 'removed' : 'would be removed'}${isDryRun ? ' (dry-run)' : ''}`);
  }

  // ── 3. releases.deliveryAssetReadiness.checks[].value ──
  const releasesColl = db.collection('releases');
  const relWithChecks = await releasesColl.find({
    'deliveryAssetReadiness.checks': { $exists: true, $ne: [] },
  }).project({ 'deliveryAssetReadiness.checks': 1 }).toArray();
  console.log(`\n[3/6] releases.deliveryAssetReadiness.checks[].value: ${relWithChecks.length} docs`);
  const ops3: any[] = [];
  for (const doc of relWithChecks) {
    const checks = (doc.deliveryAssetReadiness as any)?.checks;
    if (!Array.isArray(checks)) continue;
    const clean = checks.map((c: Record<string, unknown>) => {
      const { value, ...rest } = c;
      return rest;
    });
    ops3.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { 'deliveryAssetReadiness.checks': clean } } } });
    totalOps++;
  }
  if (ops3.length > 0) {
    if (isWrite) await bulkWrite(releasesColl, ops3);
    console.log(`  ${ops3.length} release delivery checks ${isWrite ? 'cleaned' : 'would be cleaned'}${isDryRun ? ' (dry-run)' : ''}`);
  }

  // ── 4. releases.bromaReadiness.assetReadiness.checks[].value ──
  const relWithBroma = await releasesColl.find({
    'bromaReadiness.assetReadiness.checks': { $exists: true, $ne: [] },
  }).project({ 'bromaReadiness.assetReadiness.checks': 1 }).toArray();
  console.log(`\n[4/6] releases.bromaReadiness.assetReadiness.checks[].value: ${relWithBroma.length} docs`);
  const ops4: any[] = [];
  for (const doc of relWithBroma) {
    const checks = (doc as any).bromaReadiness?.assetReadiness?.checks;
    if (!Array.isArray(checks)) continue;
    const clean = checks.map((c: Record<string, unknown>) => {
      const { value, ...rest } = c;
      return rest;
    });
    ops4.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { 'bromaReadiness.assetReadiness.checks': clean } } } });
    totalOps++;
  }
  if (ops4.length > 0) {
    if (isWrite) await bulkWrite(releasesColl, ops4);
    console.log(`  ${ops4.length} release broma checks ${isWrite ? 'cleaned' : 'would be cleaned'}${isDryRun ? ' (dry-run)' : ''}`);
  }

  // ── 5. releaseDrafts.draft.artworkUploadedUrl / audioUploadedUrls ──
  const draftColl = db.collection('releaseDrafts');
  const draftDocs = await draftColl.find({ draft: { $exists: true } }).toArray();
  let draftUpdated = 0;
  console.log(`\n[5/6] releaseDrafts.draft.*Url fields: ${draftDocs.length} drafts`);
  const ops5: any[] = [];
  for (const doc of draftDocs) {
    const d = doc.draft || {};
    const unsetFields: Record<string, string> = {};
    if (d.artworkUploadedUrl && d.artworkUploadedFilename) {
      unsetFields['draft.artworkUploadedUrl'] = '';
    }
    if (Array.isArray(d.audioUploadedUrls) && Array.isArray(d.audioUploadedFilenames)) {
      unsetFields['draft.audioUploadedUrls'] = '';
    }
    if (Object.keys(unsetFields).length > 0) {
      ops5.push({ updateOne: { filter: { _id: doc._id }, update: { $unset: unsetFields } } });
      draftUpdated++;
      totalOps++;
    }
  }
  if (ops5.length > 0) {
    if (isWrite) await bulkWrite(draftColl, ops5);
    console.log(`  ${draftUpdated} drafts ${isWrite ? 'cleaned' : 'would be cleaned'}${isDryRun ? ' (dry-run)' : ''}`);
  }

  // ── 6. users.profilePicture (only if profilePictureFile exists) ──
  const usersColl = db.collection('users');
  const userDocs = await usersColl.find({
    profilePicture: { $exists: true, $ne: '' },
    profilePictureFile: { $exists: true, $ne: '' },
  }).toArray();
  console.log(`\n[6/6] users.profilePicture: ${userDocs.length} docs with both fields`);
  const ops6: any[] = [];
  for (const doc of userDocs) {
    ops6.push({ updateOne: { filter: { _id: doc._id }, update: { $unset: { profilePicture: '' } } } });
    totalOps++;
  }
  if (ops6.length > 0) {
    if (isWrite) await bulkWrite(usersColl, ops6);
    console.log(`  ${ops6.length} profilePicture fields ${isWrite ? 'removed' : 'would be removed'}${isDryRun ? ' (dry-run)' : ''}`);
  }

  // ── Summary ──
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Total operations: ${totalOps}`);
  console.log(`${isDryRun ? '⚠️  DRY-RUN — run with --write to apply' : '✅ All changes written'}`);
  console.log(`Note: users with profilePicture but no profilePictureFile (3 docs) NOT cleaned.`);
  console.log(`      releaseDeliverySnapshots (1995 docs) NOT cleaned (historical records).`);
}

(async () => {
  try {
    await connectDB();
    console.log(`Mode: ${isWrite ? 'WRITE' : 'DRY-RUN'}`);
    await cleanup();
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
})();
