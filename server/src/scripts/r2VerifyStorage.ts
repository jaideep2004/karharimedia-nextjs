/**
 * Deep verification: R2 bucket structure vs DB references.
 *
 * Usage:
 *   npm run r2:verify-storage
 *   npm run r2:verify-storage -- --list-only
 *   npm run r2:verify-storage -- --prefix=tracks/
 *
 * Checks:
 *   1. R2 bucket object listing — folder structure (tracks/, artwork/, etc.)
 *   2. Every DB track audioFile exists in R2 as tracks/<file>
 *   3. Every DB track/release artwork exists in R2 as artwork/<file>
 *   4. R2 public URL resolves for a sample
 *   5. Orphan analysis — R2 objects with no DB reference (informational)
 */
import 'dotenv/config';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';

const R2_ENDPOINT = process.env.R2_ENDPOINT || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const R2_PUBLIC_DOMAIN = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');

let passed = 0;
let failed = 0;

function assert(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  \x1b[32m\u2713\x1b[0m ${label}`); }
  else { failed++; console.log(`  \x1b[31m\u2717\x1b[0m ${label}${detail ? ` \u2014 ${detail}` : ''}`); }
}

async function listAllObjects(client: S3Client, prefix = ''): Promise<Array<{ key: string; size: number }>> {
  const out: Array<{ key: string; size: number }> = [];
  let token: string | undefined;
  do {
    const cmd = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: token,
      MaxKeys: 1000,
    });
    const res = await client.send(cmd);
    for (const obj of res.Contents || []) {
      if (obj.Key) out.push({ key: obj.Key, size: obj.Size || 0 });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list-only');
  const prefixArg = args.find(a => a.startsWith('--prefix='))?.split('=')[1] || '';

  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    console.error('R2 env vars not configured (R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME)');
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  console.log('=== R2 STORAGE DEEP VERIFICATION ===\n');
  console.log(`Bucket: ${R2_BUCKET_NAME}`);
  console.log(`Public domain: ${R2_PUBLIC_DOMAIN || '(not set)'}\n`);

  // ── 1. List bucket ──
  console.log('[1/4] Listing bucket objects...');
  const all = await listAllObjects(client, prefixArg);
  console.log(`  Total objects: ${all.length}${prefixArg ? ` (prefix "${prefixArg}")` : ''}`);
  if (all.length === 0) {
    assert('bucket has objects', false, 'empty bucket or wrong credentials');
    console.log('\nNOTE: if the bucket appears empty, verify R2_ENDPOINT includes the account id: https://<accountid>.r2.cloudflarestorage.com');
    process.exit(failed > 0 ? 1 : 0);
  }

  // Folder structure
  const prefixes = new Set<string>();
  for (const obj of all) {
    const parts = obj.key.split('/');
    if (parts.length > 1) prefixes.add(parts[0]);
    else prefixes.add('(root)');
  }
  console.log(`  Top-level folders: ${Array.from(prefixes).sort().join(', ')}`);

  const tracksObjs = all.filter(o => o.key.startsWith('tracks/'));
  const artworkObjs = all.filter(o => o.key.startsWith('artwork/'));
  const otherObjs = all.filter(o => !o.key.startsWith('tracks/') && !o.key.startsWith('artwork/'));
  console.log(`  tracks/  : ${tracksObjs.length} objects`);
  console.log(`  artwork/ : ${artworkObjs.length} objects`);
  console.log(`  other    : ${otherObjs.length} objects`);
  if (otherObjs.length > 0) {
    const byPrefix = new Map<string, number>();
    for (const o of otherObjs) {
      const p = o.key.split('/')[0];
      byPrefix.set(p, (byPrefix.get(p) || 0) + 1);
    }
    console.log(`  other breakdown: ${Array.from(byPrefix.entries()).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  }
  assert('tracks/ folder exists', tracksObjs.length > 0, 'no tracks/ objects');
  assert('artwork/ folder exists', artworkObjs.length > 0, 'no artwork/ objects');

  if (listOnly) {
    const sample = all.slice(0, 20);
    console.log('\n  Sample keys:');
    for (const s of sample) console.log(`    ${s.key} (${s.size} bytes)`);
    if (all.length > 20) console.log(`    ... and ${all.length - 20} more`);
  }

  // ── 2. Public URL resolution ──
  console.log('\n[2/4] Public URL resolution');
  if (R2_PUBLIC_DOMAIN) {
    const sampleTrack = tracksObjs[0];
    const sampleArt = artworkObjs[0];
    assert('public URL for track', !!sampleTrack, 'no track objects');
    if (sampleTrack) {
      const url = `https://${R2_PUBLIC_DOMAIN}/${sampleTrack.key}`;
      console.log(`    ${url}`);
      try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
        assert(`public HEAD ${res.status}`, res.ok, res.statusText);
      } catch (e) {
        assert('public HEAD reachable', false, e instanceof Error ? e.message : 'fetch failed');
      }
    }
    if (sampleArt) {
      const url = `https://${R2_PUBLIC_DOMAIN}/${sampleArt.key}`;
      try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
        assert(`artwork public HEAD ${res.status}`, res.ok, res.statusText);
      } catch (e) {
        assert('artwork public HEAD reachable', false, e instanceof Error ? e.message : 'fetch failed');
      }
    }
  } else {
    assert('R2_PUBLIC_DOMAIN set', false, 'set R2_PUBLIC_DOMAIN to enable public URLs');
  }

  // ── 3. DB cross-check ──
  console.log('\n[3/4] DB references vs R2 objects');
  await connectDB();
  const db = mongoose.connection.db!;
  const r2TrackKeys = new Set(tracksObjs.map(o => o.key));
  const r2ArtKeys = new Set(artworkObjs.map(o => o.key));

  // Tracks collection
  const tracks = await db.collection('tracks').find(
    { $or: [{ audioFile: { $exists: true, $ne: '' } }, { artwork: { $exists: true, $ne: '' } }] },
    { projection: { audioFile: 1, artwork: 1, _id: 1 } }
  ).toArray();
  let trackAudioMissing = 0, trackArtMissing = 0;
  const trackAudioMissingSamples: string[] = [];
  for (const t of tracks) {
    if (t.audioFile) {
      const key = `tracks/${t.audioFile}`;
      if (!r2TrackKeys.has(key)) {
        trackAudioMissing++;
        if (trackAudioMissingSamples.length < 5) trackAudioMissingSamples.push(`${t.audioFile}`);
      }
    }
    if (t.artwork) {
      const key = `artwork/${t.artwork}`;
      if (!r2ArtKeys.has(key)) {
        trackArtMissing++;
      }
    }
  }
  assert(`tracks: audio present in R2 (${tracks.length - trackAudioMissing}/${tracks.length})`, trackAudioMissing === 0,
    trackAudioMissingSamples.length ? `missing e.g. ${trackAudioMissingSamples.join(', ')}` : `${trackAudioMissing} missing`);
  assert(`tracks: artwork present in R2 (${tracks.length - trackArtMissing}/${tracks.length})`, trackArtMissing === 0, `${trackArtMissing} missing`);

  // Releases (artwork + embedded tracks)
  const releases = await db.collection('releases').find(
    { $or: [{ artwork: { $exists: true, $ne: '' } }, { 'tracks.audioFile': { $exists: true, $ne: '' } }] },
    { projection: { artwork: 1, 'tracks.audioFile': 1, _id: 1 } }
  ).toArray();
  let relArtMissing = 0, relAudioMissing = 0;
  for (const r of releases) {
    if (r.artwork) {
      const key = `artwork/${r.artwork}`;
      if (!r2ArtKeys.has(key)) relArtMissing++;
    }
    if (Array.isArray(r.tracks)) {
      for (const tr of r.tracks) {
        if (tr.audioFile) {
          const key = `tracks/${tr.audioFile}`;
          if (!r2TrackKeys.has(key)) relAudioMissing++;
        }
      }
    }
  }
  assert(`releases: artwork present in R2 (${releases.length - relArtMissing}/${releases.length})`, relArtMissing === 0, `${relArtMissing} missing`);
  assert(`releases: embedded track audio present in R2`, relAudioMissing === 0, `${relAudioMissing} missing`);

  // ── 4. Orphan scan (informational) ──
  console.log('\n[4/4] Orphan analysis (informational — not a failure)');
  const usedTrackKeys = new Set<string>();
  for (const t of tracks) { if (t.audioFile) usedTrackKeys.add(`tracks/${t.audioFile}`); }
  for (const r of releases) {
    if (Array.isArray(r.tracks)) for (const tr of r.tracks) { if (tr.audioFile) usedTrackKeys.add(`tracks/${tr.audioFile}`); }
  }
  const usedArtKeys = new Set<string>();
  for (const t of tracks) { if (t.artwork) usedArtKeys.add(`artwork/${t.artwork}`); }
  for (const r of releases) { if (r.artwork) usedArtKeys.add(`artwork/${r.artwork}`); }
  const orphanTracks = tracksObjs.filter(o => !usedTrackKeys.has(o.key));
  const orphanArt = artworkObjs.filter(o => !usedArtKeys.has(o.key));
  console.log(`  tracks/ objects not referenced in DB: ${orphanTracks.length}`);
  console.log(`  artwork/ objects not referenced in DB: ${orphanArt.length}`);
  for (const o of orphanTracks.slice(0, 10)) console.log(`    ${o.key}`);
  for (const o of orphanArt.slice(0, 10)) console.log(`    ${o.key}`);

  // Summary
  const total = passed + failed;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed}/${total} failed`);
  console.log(failed === 0 ? 'ALL STORAGE CHECKS PASSED' : 'SOME CHECKS FAILED');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('Verification failed:', e instanceof Error ? e.message : e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
