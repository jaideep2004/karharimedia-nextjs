/**
 * Submit Broma drafts to moderation/review.
 *
 * Reads failed delivery jobs with "Missing Broma outlet ids" error,
 * then calls POST /repertoire/release/{releaseId}/send-moderate
 * for each to move them from draft → moderation.
 *
 * Usage:
 *   node server/src/scripts/submitBromaDrafts.cjs
 *   node server/src/scripts/submitBromaDrafts.cjs --dry-run
 *   node server/src/scripts/submitBromaDrafts.cjs --bid 18296434,18296430
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

// Parse --bid flag for specific releases
const bidArg = process.argv.find(a => a.startsWith('--bid='));
const SPECIFIC_BIDS = bidArg ? bidArg.split('=')[1].split(',').map(b => b.trim()).filter(Boolean) : null;

function timestamp() { return new Date().toISOString(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const startedAt = timestamp();
  const logName = `submit-broma-drafts-${startedAt.replace(/[:.]/g, '-')}`;
  const logLines = [];
  function log(msg) { console.log(msg); logLines.push(`[${timestamp()}] ${msg}`); }
  function save() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOG_DIR, `${logName}.log`), logLines.join('\n') + '\n', 'utf8');
  }

  if (DRY_RUN) log('=== DRY RUN MODE — no moderation submission will be sent ===');
  log('=== Submit Broma Drafts to Moderation ===');
  log(`Started: ${startedAt}`);

  // 1. Connect to MongoDB
  log('\n1: Connecting to MongoDB...');
  let mongo;
  try {
    mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    await mongo.connect();
  } catch (e) { log(`FATAL: ${e.message}`); process.exit(1); }
  const db = mongo.db('test');

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
    try {
      await sleep(2000);
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

  // 3. Get the list of releases to submit
  let releases = [];

  if (SPECIFIC_BIDS) {
    log(`\n3: Using manually specified BIDs: ${SPECIFIC_BIDS.length}`);
    for (const bid of SPECIFIC_BIDS) {
      releases.push({ bid, name: `manual-${bid}`, error: '' });
    }
  } else {
    log('\n3: Fetching failed delivery jobs with Missing outlet IDs...');
    const failedJobs = await db.collection('deliveryjobs').find({
      providerKey: 'broma',
      state: 'failed',
      'metadata.bromaReleaseId': { $exists: true, $ne: '' },
      errorMessage: /Missing Broma outlet ids/i,
    }).project({
      _id: 1,
      releaseName: 1,
      'metadata.bromaReleaseId': 1,
      'metadata.releaseTitle': 1,
      'metadata.bsonDepthFixed': 1,
      errorMessage: 1,
    }).toArray();

    log(`   Found: ${failedJobs.length}`);

    for (const j of failedJobs) {
      const bid = String(j.metadata.bromaReleaseId);
      releases.push({
        bid,
        name: j.releaseName || j.metadata?.releaseTitle || '?',
        error: j.errorMessage || '',
        bsonFixed: !!j.metadata?.bsonDepthFixed,
      });
    }
  }

  if (releases.length === 0) {
    log('\n   Nothing to submit. Exiting.');
    await mongo.close();
    save();
    return;
  }

  log(`\n4: ${DRY_RUN ? 'WOULD SUBMIT' : 'SUBMITTING'} ${releases.length} releases to moderation...`);
  log(`   Endpoint: POST /repertoire/release/{releaseId}/send-moderate\n`);

  let successCount = 0;
  let failCount = 0;
  const results = [];

  for (let i = 0; i < releases.length; i++) {
    const r = releases[i];
    const label = `[${i + 1}/${releases.length}]`;

    if (DRY_RUN) {
      log(`   ${label} ${r.name} | bid=${r.bid} — WOULD SUBMIT`);
      results.push({ bid: r.bid, name: r.name, status: 'would_submit' });
      continue;
    }

    try {
      const resp = await axios.post(
        `${BROMA_BASE_URL}/repertoire/release/${r.bid}/send-moderate`,
        null,
        { headers, timeout: 15000 },
      );
      successCount++;
      const statusCode = resp.status;
      const respBody = resp.data?.message || resp.data?.status || 'OK';
      log(`   ${label} ✅ ${r.name} | bid=${r.bid} | ${statusCode} | ${respBody}`);
      results.push({ bid: r.bid, name: r.name, status: 'success', code: statusCode });
    } catch (e) {
      failCount++;
      const status = e.response?.status || 'error';
      const body = e.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : e.message;
      log(`   ${label} ❌ ${r.name} | bid=${r.bid} | ${status} | ${body}`);
      results.push({ bid: r.bid, name: r.name, status: 'failed', code: status, error: body });
    }

    // Rate limit: 1 req/sec
    if (i < releases.length - 1) await sleep(1000);
  }

  // 5. Update delivery jobs for successful submissions
  if (!DRY_RUN && successCount > 0) {
    const successBids = results.filter(r => r.status === 'success').map(r => r.bid);
    log(`\n5: Updating delivery jobs for ${successBids.length} successful submissions...`);

    const updateResult = await db.collection('deliveryjobs').updateMany(
      {
        providerKey: 'broma',
        'metadata.bromaReleaseId': { $in: successBids },
        state: 'failed',
      },
      {
        $set: {
          state: 'processing',
          'metadata.bromaStep': 'poll_status',
          'metadata.bromaModerationSentAt': new Date().toISOString(),
          'metadata.bromaModerationStatus': 'moderation_pending',
          'metadata.submittedByScript': true,
          'metadata.submittedAt': new Date().toISOString(),
        },
        $unset: { errorMessage: '', lockedAt: '', lockedBy: '', lockExpiresAt: '' },
        $push: {
          events: {
            state: 'processing',
            message: 'Submitted to moderation via submitBromaDrafts script',
            source: 'system',
            createdAt: new Date(),
          },
        },
      },
    );

    log(`   Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`);
  }

  // 6. Summary
  log('\n6: === SUMMARY ===');
  log(`   Total releases submitted: ${releases.length}`);
  log(`   Success: ${successCount}`);
  log(`   Failed: ${failCount}`);
  if (DRY_RUN) log(`   (DRY RUN — no changes made)`);

  save();
  log(`\n   Log -> ${path.join(LOG_DIR, `${logName}.log`)}`);

  await mongo.close();
  console.log('\n=== Done ===');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
