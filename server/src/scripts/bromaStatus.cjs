/**
 * Full inventory: every delivery job cross-referenced with Broma API.
 * Shows which failed releases are hopeless (safe to delete).
 *
 * Run: node server/src/scripts/bromaStatus.cjs
 *   (or set BROMA_EMAIL, BROMA_PASSWORD, BROMA_ACCOUNT_ID, BROMA_BASE_URL)
 *
 * Outputs:
 *   server/src/scripts/broma-status-all.csv       — all jobs
 *   server/src/scripts/broma-status-hopeless.txt  — failed jobs safe to delete
 */
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jai2004bgmi:bgmi2004@singleaudio-nextjs.hamfzjb.mongodb.net/?retryWrites=true&w=majority&appName=singleaudio-nextjs';
const OUT_DIR = __dirname;

async function main() {
  const mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  const db = mongo.db('test');

  // ── ALL delivery jobs ──
  const allJobs = await db.collection('deliveryjobs').find({
    providerKey: 'broma',
  }).sort({ createdAt: -1 }).toArray();
  console.log('Total Broma delivery jobs:', allJobs.length);

  // ── Fetch Broma releases (paged) ──
  let releases = [];
  const email = process.env.BROMA_EMAIL;
  const password = process.env.BROMA_PASSWORD;
  const baseUrl = (process.env.BROMA_BASE_URL || 'https://api-rod.broma16.com/api').replace(/\/+$/, '');
  const accountId = process.env.BROMA_ACCOUNT_ID;

  if (email && accountId) {
    const axios = require('axios');
    try {
      const lr = await axios.post(baseUrl + '/auth/login', { email, password }, { timeout: 20000 });
      const token = (lr.data?.data || lr.data).access_token || lr.data?.data?.accessToken;
      console.log('Broma login OK');

      const headers = { 'X-Access-Token': token, 'Content-Language': 'en' };
      let page = 1;
      const PER_PAGE = 200;

      while (page <= 20) {
        const rr = await axios.get(baseUrl + '/accounts/' + accountId + '/assets/releases', {
          headers, timeout: 15000,
          params: { page, limit: PER_PAGE },
        });
        const items = Array.isArray(rr.data?.data) ? rr.data.data : (Array.isArray(rr.data?.items) ? rr.data.items : []);
        if (items.length === 0) break;
        releases = releases.concat(items);
        const total = rr.data?.total || 0;
        if (page === 1) console.log('Broma total releases:', total);
        page++;
        if (releases.length >= total) break;
      }
      console.log('Fetched ' + releases.length + ' releases');
    } catch (e) {
      console.log('Broma API error:', e.message);
    }
  } else {
    console.log('Set BROMA_EMAIL, BROMA_PASSWORD, BROMA_ACCOUNT_ID to fetch Broma live status');
  }

  const bromaById = {};
  for (const r of releases) bromaById[String(r.id)] = r;

  // ── Classify every job ──
  const csvRows = [];
  const hopeless = [];

  for (const j of allJobs) {
    const relName = j.metadata?.releaseName || j.releaseName || j.metadata?.title || '?';
    const bid = j.metadata?.bromaReleaseId || '';
    const state = j.state;
    const err = (j.errorMessage || '').slice(0, 200);
    const bsonFixed = !!j.metadata?.bsonDepthFixed;
    const releaseId = j.releaseId || j.metadata?.releaseId || '';
    const trackId = j.trackId || j.metadata?.trackId || '';

    let bromaStatus = '-';

    if (bid) {
      const b = bromaById[bid];
      if (b) {
        const mod = b.moderation_status || '';
        const steps = Array.isArray(b.statuses) ? b.statuses.join(',') : b.status || '';
        bromaStatus = mod || steps || 'live';
      } else if (releases.length > 0) {
        bromaStatus = 'NOT_IN_BROMA';
      }
    }

    let isHopeless = false;
    let hopelessReason = '';

    if (state === 'failed') {
      if (err.includes('404') || err.toLowerCase().includes('not found')) {
        isHopeless = true; hopelessReason = '404 — deleted from Broma';
      } else if (err.includes('Missing Broma outlet')) {
        isHopeless = true; hopelessReason = 'No outlet IDs configured';
      } else if (err.includes('ENOENT') || err.includes('no such file')) {
        isHopeless = true; hopelessReason = 'Audio file deleted from disk';
      } else if ((err.includes('timeout') || err.includes('ETIMEDOUT')) && (j.retryCount || 0) > 3) {
        isHopeless = true; hopelessReason = 'Repeated timeout';
      } else if (bid && bromaStatus === 'NOT_IN_BROMA') {
        isHopeless = true; hopelessReason = 'Broma ID not found in Broma (deleted)';
      }
    }

    if (isHopeless) {
      hopeless.push({ relName, bid, state, err: err.slice(0, 120), reason: hopelessReason, releaseId, trackId });
    }

    csvRows.push({ relName, bid, state, err: err.slice(0, 100), bsonFixed, bromaStatus, releaseId, trackId, hopeless: isHopeless ? 'YES' : '' });
  }

  // ── Write CSV ──
  const csvPath = path.join(OUT_DIR, 'broma-status-all.csv');
  const header = 'releaseName,bromaReleaseId,dbState,releaseId,trackId,errorMessage,bsonFixed,bromaStatus,hopeless';
  const body = csvRows.map(r => [
    JSON.stringify(r.relName),
    JSON.stringify(r.bid),
    JSON.stringify(r.state),
    JSON.stringify(r.releaseId),
    JSON.stringify(r.trackId),
    JSON.stringify(r.err),
    JSON.stringify(r.bsonFixed),
    JSON.stringify(r.bromaStatus),
    JSON.stringify(r.hopeless),
  ].join(',')).join('\n');
  fs.writeFileSync(csvPath, header + '\n' + body, 'utf8');
  console.log('\nCSV: ' + csvPath);

  // ── Write hopeless ──
  const hopPath = path.join(OUT_DIR, 'broma-status-hopeless.txt');
  const hopLines = ['Total hopeless: ' + hopeless.length, '='.repeat(70)];
  for (const h of hopeless) {
    hopLines.push('\n' + h.relName);
    hopLines.push('  bid: ' + h.bid + ' | releaseId: ' + h.releaseId + ' | trackId: ' + h.trackId);
    hopLines.push('  Reason: ' + h.reason);
    if (h.err) hopLines.push('  Error: ' + h.err);
  }
  fs.writeFileSync(hopPath, hopLines.join('\n'), 'utf8');

  if (hopeless.length > 0) {
    console.log('\n=== HOPELESS (safe to delete) — ' + hopeless.length + ' ===');
    for (const h of hopeless) {
      console.log('  ' + h.relName + ' | bid: ' + h.bid + ' | ' + h.reason);
    }
  }

  // ── Summary ──
  console.log('\n=== SUMMARY ===');
  const byState = {};
  for (const r of csvRows) byState[r.state] = (byState[r.state] || 0) + 1;
  for (const [s, c] of Object.entries(byState)) console.log('  ' + s + ': ' + c);
  console.log('  hopeless: ' + hopeless.length);
  console.log('\n' + csvPath);
  console.log(hopPath);

  await mongo.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
