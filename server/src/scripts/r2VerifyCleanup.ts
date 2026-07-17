import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/db';

dotenv.config();

interface Check { label: string; count: number; ok: boolean }

async function main() {
  await connectDB();
  const db = mongoose.connection.db!;
  const errors: string[] = [];
  const results: Check[] = [];

  const check = async (label: string, fn: () => Promise<number>) => {
    const count = await fn();
    const ok = count === 0;
    results.push({ label, count, ok });
    if (!ok) errors.push(`${label}: ${count} remaining`);
  };

  // Critical: no URL data anywhere
  await check('tracks.artwork (URLs)', () =>
    db.collection('tracks').countDocuments({ artwork: /^https?:\/\//i }));

  await check('trackAssets.url (exists)', () =>
    db.collection('trackAssets').countDocuments({ url: { $exists: true, $ne: '' } }));

  await check('trackAssets.artwork missing path', () =>
    db.collection('trackAssets').countDocuments({
      type: 'artwork',
      url: { $exists: true, $ne: '' },
      $or: [{ path: null }, { path: '' }, { path: { $exists: false } }],
    }));

  await check('releases.artworkUrl', () =>
    db.collection('releases').countDocuments({ artworkUrl: { $exists: true, $ne: '' } }));

  await check('releases.tracks[].audioUrl', () =>
    db.collection('releases').countDocuments({ 'tracks.audioUrl': { $exists: true, $ne: '' } }));

  await check('releases.deliveryAssetReadiness.checks.value', () =>
    db.collection('releases').countDocuments({
      'deliveryAssetReadiness.checks': { $exists: true, $ne: [] },
      'deliveryAssetReadiness.checks.value': { $exists: true },
    }));

  await check('releases.bromaReadiness.assetReadiness.checks.value', () =>
    db.collection('releases').countDocuments({
      'bromaReadiness.assetReadiness.checks': { $exists: true, $ne: [] },
      'bromaReadiness.assetReadiness.checks.value': { $exists: true },
    }));

  await check('releaseDrafts.artworkUploadedUrl', () =>
    db.collection('releaseDrafts').countDocuments({ 'draft.artworkUploadedUrl': { $exists: true, $ne: '' } }));

  await check('releaseDrafts.audioUploadedUrls', () =>
    db.collection('releaseDrafts').countDocuments({ 'draft.audioUploadedUrls': { $exists: true, $ne: [] } }));

  await check('users (profilePicture+profilePictureFile both)', () =>
    db.collection('users').countDocuments({
      profilePicture: { $exists: true, $ne: '' },
      profilePictureFile: { $exists: true, $ne: '' },
    }));

  // Positive: tracks should have filename-based artwork
  const tracksTotal = await db.collection('tracks').countDocuments({});
  const tracksWithFilename = await db.collection('tracks').countDocuments({ artwork: { $regex: /^[^/]+$/ } });
  const tracksWithUrl = await db.collection('tracks').countDocuments({ artwork: /^https?:\/\//i });

  // Sample spot-checks
  const sampleTrack = await db.collection('tracks').findOne({}, { projection: { artwork: 1, _id: 1 } });
  if (sampleTrack && /^https?:\/\//i.test(String(sampleTrack.artwork))) {
    errors.push(`Sample track ${sampleTrack._id} artwork is still a URL: ${sampleTrack.artwork}`);
  }

  const sampleAsset = await db.collection('trackAssets').findOne({}, { projection: { path: 1, url: 1, _id: 1 } });
  if (sampleAsset) {
    if (sampleAsset.url) errors.push(`Sample asset ${sampleAsset._id} still has url`);
    if (!sampleAsset.path) errors.push(`Sample asset ${sampleAsset._id} missing path`);
  }

  // Report
  console.log('\n=== R2 CLEANUP VERIFICATION ===\n');
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.label}: ${r.count}`);
  }
  console.log(`\n  tracks: ${tracksTotal} total, ${tracksWithFilename} filename-artwork (${((tracksWithFilename / tracksTotal) * 100).toFixed(1)}%), ${tracksWithUrl} URL-artwork`);

  if (errors.length === 0) {
    console.log('\n✓ ALL CHECKS PASSED — no URL data in DB');
    process.exit(0);
  } else {
    console.log(`\n✗ ${errors.length} FAILURES:`);
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
