import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/db';
import { resolveAssetUrl, extractFilenameFromUrl, getStorageProvider } from '../config/urlResolver';

dotenv.config();

let passed = 0;
let failed = 0;

function assert(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  \x1b[32m\u2713\x1b[0m ${label}`); }
  else { failed++; console.log(`  \x1b[31m\u2717\x1b[0m ${label}${detail ? ` \u2014 ${detail}` : ''}`); }
}

async function main() {
  await connectDB();
  const db = mongoose.connection.db!;

  console.log('=== R2 LOGIC VERIFICATION ===\n');

  // ── 1. extractFilenameFromUrl ──
  console.log('[1/5] extractFilenameFromUrl()');
  assert('URL returns filename', extractFilenameFromUrl('https://r2.dev/artwork/file.jpg') === 'file.jpg');
  assert('URL with subdirectories', extractFilenameFromUrl('https://r2.dev/tracks/sub/file.wav') === 'file.wav');
  assert('plain filename passes through', extractFilenameFromUrl('file.jpg') === 'file.jpg');
  assert('null returns empty string', extractFilenameFromUrl(null) === '');
  assert('decodes URL encoding', extractFilenameFromUrl('https://r2.dev/artwork/file%20name.jpg') === 'file name.jpg');
  assert('empty string returns empty', extractFilenameFromUrl('') === '');

  // ── 2. resolveAssetUrl ──
  console.log('\n[2/5] resolveAssetUrl()');
  const savedDomain = process.env.R2_PUBLIC_DOMAIN;

  delete process.env.R2_PUBLIC_DOMAIN;
  const localUrl = resolveAssetUrl('file.jpg', 'image');
  assert('no R2_PUBLIC_DOMAIN => empty or local URL', !localUrl || localUrl.includes('/uploads/artwork/file.jpg'));

  process.env.R2_PUBLIC_DOMAIN = 'cdn.example.com';
  assert('R2 URL format', resolveAssetUrl('file.jpg', 'image') === 'https://cdn.example.com/artwork/file.jpg');
  assert('audio dir = tracks', resolveAssetUrl('t.wav', 'audio') === 'https://cdn.example.com/tracks/t.wav');
  assert('support dir', resolveAssetUrl('a.pdf', 'support') === 'https://cdn.example.com/support/a.pdf');
  assert('knowledge-base dir', resolveAssetUrl('d.pdf', 'knowledge-base') === 'https://cdn.example.com/knowledge-base/d.pdf');
  assert('empty filename returns empty', resolveAssetUrl('', 'image') === '');

  if (savedDomain) process.env.R2_PUBLIC_DOMAIN = savedDomain;
  else delete process.env.R2_PUBLIC_DOMAIN;

  // ── 3. getStorageProvider fallback ──
  console.log('\n[3/5] getStorageProvider()');
  assert('doc.storageProvider=r2', getStorageProvider({ storageProvider: 'r2' }) === 'r2');
  assert('doc.storageProvider=local', getStorageProvider({ storageProvider: 'local' }) === 'local');
  // Without env vars, fallback depends on R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY
  const hasR2Env = !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
  const fallback = getStorageProvider({});
  if (hasR2Env) assert('fallback = r2 (R2 env vars set)', fallback === 'r2');
  else assert('fallback = local (no R2 env vars)', fallback === 'local');

  // ── 4. DB: no URL fields ──
  console.log('\n[4/5] DB schema — no URL fields');
  const checks: [string, number][] = [
    ['tracks.artwork URL', await db.collection('tracks').countDocuments({ artwork: /^https?:\/\//i })],
    ['tracks.audioUrl', await db.collection('tracks').countDocuments({ audioUrl: { $exists: true, $ne: '' } })],
    ['trackAssets.url', await db.collection('trackAssets').countDocuments({ url: { $exists: true, $ne: '' } })],
    ['releases.artworkUrl', await db.collection('releases').countDocuments({ artworkUrl: { $exists: true, $ne: '' } })],
    ['releases.tracks[].audioUrl', await db.collection('releases').countDocuments({ 'tracks.audioUrl': { $exists: true, $ne: '' } })],
    ['releases.*Readiness.checks[].value', await db.collection('releases').countDocuments({
      $or: [
        { 'deliveryAssetReadiness.checks.value': { $exists: true } },
        { 'bromaReadiness.assetReadiness.checks.value': { $exists: true } },
      ],
    })],
    ['releaseDrafts.artworkUploadedUrl', await db.collection('releaseDrafts').countDocuments({ 'draft.artworkUploadedUrl': { $exists: true, $ne: '' } })],
    ['releaseDrafts.audioUploadedUrls', await db.collection('releaseDrafts').countDocuments({ 'draft.audioUploadedUrls': { $exists: true, $ne: [] } })],
  ];
  for (const [label, count] of checks) {
    assert(`${label}: ${count}`, count === 0, `found ${count}`);
  }

  // ── 5. DSP delivery fallback resolution ──
  console.log('\n[5/5] DSP delivery asset resolution');
  const trackSamples = await db.collection('tracks').find({}, {
    projection: { audioFile: 1, audioUrl: 1, fileUrl: 1, artwork: 1, artworkUrl: 1, coverArt: 1, deletedAt: 1, _id: 1 },
  }).limit(100).toArray();

  let audioOk = 0; let artOk = 0; let softDeleted = 0;
  for (const t of trackSamples) {
    if (t.deletedAt) { softDeleted++; continue; }
    // Fallback chain: audioFile || audioUrl || fileUrl
    if (t.audioFile || t.audioUrl || t.fileUrl) audioOk++;
    // Fallback chain: artwork || artworkUrl || coverArt
    if (t.artwork || t.artworkUrl || t.coverArt) artOk++;
  }
  const activeCount = trackSamples.length - softDeleted;
  assert(`tracks sample (${trackSamples.length}, ${softDeleted} deleted): audio resolves for ${audioOk}/${activeCount} active`,
    audioOk >= activeCount * 0.95, `${activeCount - audioOk} active tracks missing audio`);
  assert(`tracks sample: artwork resolves for ${artOk}/${activeCount} active`,
    artOk >= activeCount * 0.9, `${activeCount - artOk} active tracks missing artwork`);

  const relSamples = await db.collection('releases').find({}, {
    projection: { artwork: 1, artworkFile: 1, coverArt: 1, artworkUrl: 1, _id: 1 },
  }).limit(50).toArray();
  let relArtOk = 0;
  for (const r of relSamples) {
    if (r.artwork || r.artworkFile || r.coverArt || r.artworkUrl) relArtOk++;
  }
  assert(`releases sample (${relSamples.length}): artwork resolves for ${relArtOk}`,
    relArtOk >= relSamples.length * 0.8, `${relSamples.length - relArtOk} releases missing artwork`);

  // Summary
  const total = passed + failed;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed}/${total} failed`);
  console.log(failed === 0 ? 'ALL LOGIC CHECKS PASSED' : 'SOME CHECKS FAILED');
  console.log('\nNote: storageProvider field is optional — getStorageProvider() falls back to env vars.');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
