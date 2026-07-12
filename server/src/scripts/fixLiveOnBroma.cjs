/**
 * Fix delivery jobs that are LIVE/APPROVED on Broma but still marked 'failed' in our DB.
 *
 * 1. Log into Broma, fetch ALL releases (approved/live moderation_status)
 * 2. Find matching deliveryjobs where state = 'failed' but bromaReleaseId is approved on Broma
 * 3. Update them to 'delivered' with an audit event
 *
 * Usage:
 *   node server/src/scripts/fixLiveOnBroma.cjs
 *   node server/src/scripts/fixLiveOnBroma.cjs --dry-run   # preview only
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { MongoClient } = require('mongodb');
const axios = require('axios');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jai2004bgmi:bgmi2004@singleaudio-nextjs.hamfzjb.mongodb.net/?retryWrites=true&w=majority&appName=singleaudio-nextjs';
const BROMA_EMAIL = process.env.BROMA_EMAIL;
const BROMA_PASSWORD = process.env.BROMA_PASSWORD;
const BROMA_BASE_URL = (process.env.BROMA_BASE_URL || 'https://api-rod.broma16.com/api').replace(/\/+$/, '');
const BROMA_ACCOUNT_ID = process.env.BROMA_ACCOUNT_ID;
const LOG_DIR = path.join(__dirname, 'status-logs');
const DRY_RUN = process.argv.includes('--dry-run');

function timestamp() { return new Date().toISOString(); }
function sanitize(s) { return String(s || '').replace(/[\n\r]/g, ' ').slice(0, 200); }

async function fetchAllPages(url, headers, params) {
  const all = [];
  let page = 1;
  while (page <= 50) {
    const rr = await axios.get(url, { headers, timeout: 15000, params: { ...params, page, limit: 200 } });
    const root = rr.data || {};
    let items = [];
    if (root.status === 'ok') {
      if (Array.isArray(root.data)) items = root.data;
      else if (Array.isArray(root.items)) items = root.items;
      else if (root.data && Array.isArray(root.data.releases)) items = root.data.releases;
      else if (root.data && Array.isArray(root.data.items)) items = root.data.items;
    } else {
      if (Array.isArray(root.data)) items = root.data;
      else if (Array.isArray(root.items)) items = root.items;
      else if (Array.isArray(root.releases)) items = root.releases;
    }
    if (items.length === 0) break;
    all.push(...items);
    const total = root.total || 0;
    page++;
    if (all.length >= total && total > 0) break;
  }
  return all;
}

async function main() {
  const startedAt = timestamp();
  const logName = `fix-live-on-broma-${startedAt.replace(/[:.]/g, '-')}`;
  const logLines = [];
  function log(msg) { console.log(msg); logLines.push(`[${timestamp()}] ${msg}`); }
  function save() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOG_DIR, `${logName}.log`), logLines.join('\n') + '\n', 'utf8');
  }

  if (DRY_RUN) log('=== DRY RUN MODE — no changes will be made ===');
  log(`=== Fix LIVE on Broma but FAILED in DB ===`);
  log(`Started: ${startedAt}`);

  // 1. Connect to MongoDB
  log('\n1: Connecting to MongoDB...');
  let mongo;
  try {
    mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    await mongo.connect();
  } catch (e) { log(`FATAL: ${e.message}`); process.exit(1); }
  const db = mongo.db('test');
  log('   Connected');

  // 2. Broma login
  log('\n2: Logging into Broma...');
  let token;
  try {
    const lr = await axios.post(`${BROMA_BASE_URL}/auth/login`, {
      email: BROMA_EMAIL, password: BROMA_PASSWORD,
    }, { timeout: 20000 });
    token = (lr.data?.data || lr.data).access_token || lr.data?.data?.accessToken;
    log('   Login OK');
  } catch (e) {
    const respBody = e.response?.data ? JSON.stringify(e.response.data).slice(0, 300) : '';
    log(`   Login FAILED: ${e.message} | status=${e.response?.status} | body=${respBody}`);
    log('   Retrying once...');
    try {
      await new Promise(r => setTimeout(r, 2000));
      const lr2 = await axios.post(`${BROMA_BASE_URL}/auth/login`, {
        email: BROMA_EMAIL, password: BROMA_PASSWORD,
      }, { timeout: 20000 });
      token = (lr2.data?.data || lr2.data).access_token || lr2.data?.data?.accessToken;
      if (token) log('   Login OK (retry)');
    } catch (e2) {
      log(`   Login FAILED (retry): ${e2.message}`);
      save(); process.exit(1);
    }
  }

  const headers = { 'X-Access-Token': token, 'Content-Language': 'en' };

  // 3. Fetch Broma releases
  log('\n3: Fetching Broma RELEASES...');
  const releases = await fetchAllPages(
    `${BROMA_BASE_URL}/accounts/${BROMA_ACCOUNT_ID}/assets/releases`,
    headers,
    {},
  );
  log(`   Total: ${releases.length}`);

  // 4. Find approved releases
  const approvedReleases = releases.filter(r =>
    ['approved', 'live'].includes((r.moderation_status || r.status || '').toLowerCase())
  );
  log(`   Approved/Live releases: ${approvedReleases.length}`);

  // Build bid -> release info map
  const approvedBids = new Set();
  const releaseInfo = {};
  for (const r of approvedReleases) {
    const bid = String(r.id);
    approvedBids.add(bid);
    releaseInfo[bid] = {
      title: r.title || r.name || '',
      step: Array.isArray(r.statuses) ? r.statuses.join(',') : r.step || '',
      moderationStatus: r.moderation_status || r.status || '',
    };
  }

  log(`\n4: Finding delivery jobs with state='failed' and matching bromaReleaseId...`);

  // Find failed jobs with a bromaReleaseId that is approved on Broma
  const failedJobs = await db.collection('deliveryjobs').find({
    providerKey: 'broma',
    state: 'failed',
    'metadata.bromaReleaseId': { $exists: true, $ne: '' },
  }).project({
    _id: 1,
    state: 1,
    releaseName: 1,
    'metadata.bromaReleaseId': 1,
    'metadata.releaseTitle': 1,
    'metadata.bsonDepthFixed': 1,
    errorMessage: 1,
  }).toArray();

  log(`   Total failed jobs with bromaReleaseId: ${failedJobs.length}`);

  const toFix = [];
  for (const j of failedJobs) {
    const bid = String(j.metadata?.bromaReleaseId || '');
    if (approvedBids.has(bid)) {
      toFix.push({
        _id: j._id,
        bid,
        name: j.releaseName || j.metadata?.releaseTitle || '?',
        bsonFixed: !!j.metadata?.bsonDepthFixed,
        error: sanitize(j.errorMessage || ''),
        bromaTitle: releaseInfo[bid]?.title || '',
        bromaStep: releaseInfo[bid]?.step || '',
      });
    }
  }

  log(`\n   Jobs to fix (failed in DB but LIVE on Broma): ${toFix.length}`);
  for (const f of toFix) {
    log(`   -> ${f.name} | bid=${f.bid}${f.bsonFixed ? ' | BSON_FIXED' : ''} | err=${f.error.slice(0, 60)}`);
  }

  if (toFix.length === 0) {
    log('\n   Nothing to fix. Exiting.');
    await mongo.close();
    save();
    return;
  }

  // 5. Perform the update
  log(`\n5: ${DRY_RUN ? 'WOULD UPDATE' : 'UPDATING'} ${toFix.length} jobs to delivered...`);

  if (!DRY_RUN) {
    const ids = toFix.map(f => f._id);
    const now = new Date();

    const result = await db.collection('deliveryjobs').updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          state: 'delivered',
          updatedAt: now,
          'metadata.bromaModerationStatus': 'approved',
          'metadata.fixedBy': 'fixLiveOnBromaScript',
          'metadata.fixedAt': now.toISOString(),
        },
        $unset: {
          errorMessage: '',
          lockedAt: '',
          lockedBy: '',
          lockExpiresAt: '',
        },
        $push: {
          events: {
            state: 'delivered',
            message: 'Marked delivered — found live/approved on Broma during audit',
            source: 'system',
            createdAt: now,
          },
        },
      },
    );

    log(`   Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    if (result.modifiedCount !== toFix.length) {
      log(`   WARNING: Expected ${toFix.length} but modified ${result.modifiedCount}`);
    }
  } else {
    log('   (DRY RUN — no changes made)');
  }

  // 6. Summary
  log('\n6: === SUMMARY ===');
  log(`   Total approved on Broma: ${approvedReleases.length}`);
  log(`   Found failed in our DB: ${failedJobs.length}`);
  log(`   Matching (live-on-Broma + failed-in-DB): ${toFix.length}`);
  log(`   ${DRY_RUN ? 'Would have fixed' : 'Fixed'}: ${toFix.length}`);

  // Save log
  save();
  log(`\n   Log -> ${path.join(LOG_DIR, `${logName}.log`)}`);

  await mongo.close();
  console.log('\n=== Done ===');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
