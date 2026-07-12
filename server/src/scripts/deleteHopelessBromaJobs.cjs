/**
 * Comprehensive cleanup script for hopeless Broma delivery jobs.
 *
 * Usage:
 *   node server/src/scripts/deleteHopelessBromaJobs.cjs          # delete (with confirm prompt)
 *   node server/src/scripts/deleteHopelessBromaJobs.cjs --dry-run # preview only, no changes
 *
 * What it does:
 *   1. Cross-references MongoDB DeliveryJobs against live Broma API
 *   2. Classifies hopeless records (same logic as bromaStatus.js)
 *   3. Filters to SAFE categories only:
 *      - "Deleted from Broma"      (bid not found in Broma API)
 *      - "File missing from disk"  (ENOENT error)
 *      - "Repeated timeout"        (timeout + retryCount > 3)
 *      - "404 — deleted from Broma" (404/not found in error)
 *   4. Excludes "No outlet IDs"    (potentially fixable with config)
 *   5. For each candidate:
 *      a. Deletes corresponding Broma draft via API (if still in draft state)
 *      b. Deletes the delivery job from MongoDB
 *      c. Logs all results to a timestamped file
 *   6. Writes a detailed log file to server/src/scripts/cleanup-logs/
 *
 * Requires env vars: BROMA_EMAIL, BROMA_PASSWORD, BROMA_BASE_URL, BROMA_ACCOUNT_ID
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { MongoClient } = require('mongodb');
const axios = require('axios');
const fs = require('fs');

// ─── Config ──────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jai2004bgmi:bgmi2004@singleaudio-nextjs.hamfzjb.mongodb.net/?retryWrites=true&w=majority&appName=singleaudio-nextjs';
const BROMA_EMAIL = process.env.BROMA_EMAIL;
const BROMA_PASSWORD = process.env.BROMA_PASSWORD;
const BROMA_BASE_URL = (process.env.BROMA_BASE_URL || 'https://api-rod.broma16.com/api').replace(/\/+$/, '');
const BROMA_ACCOUNT_ID = process.env.BROMA_ACCOUNT_ID;
const LOG_DIR = path.join(__dirname, 'cleanup-logs');
const IS_DRY_RUN = process.argv.includes('--dry-run');

const SAFE_CATEGORIES = new Set([
  'Deleted from Broma',
  'File missing from disk',
  'Repeated timeout',
  '404 \u2014 deleted from Broma',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timestamp() {
  return new Date().toISOString();
}

function sanitize(s) {
  return String(s || '').replace(/[\n\r]/g, ' ').slice(0, 200);
}

function logToFile(logPath, lines) {
  fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
}

function appendToFile(logPath, line) {
  fs.appendFileSync(logPath, line + '\n', 'utf8');
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = timestamp();
  const logFileName = `cleanup-${startedAt.replace(/[:.]/g, '-')}.log`;
  const csvFileName = `cleanup-${startedAt.replace(/[:.]/g, '-')}.csv`;
  const logLines = [];
  const csvLines = [['relName', 'bid', 'releaseId', 'trackId', 'reason', 'bromaAction', 'mongoAction', 'details'].join(',')];

  function log(msg) {
    console.log(msg);
    logLines.push(`[${timestamp()}] ${msg}`);
  }

  log(`=== Broma Hopeless Job Cleanup ===`);
  log(`Started at: ${startedAt}`);
  log(`Mode: ${IS_DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will delete)'}`);
  log('');

  // 1. Connect MongoDB
  log('1: Connecting to MongoDB...');
  let mongo;
  try {
    mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    await mongo.connect();
    log('2: Connected');
  } catch (e) {
    log(`FATAL: MongoDB connection failed: ${e.message}`);
    process.exit(1);
  }
  const db = mongo.db('test');

  // 2. Fetch delivery jobs
  log('3: Fetching delivery jobs...');
  let allJobs;
  try {
    allJobs = await db.collection('deliveryjobs').find(
      { providerKey: 'broma' },
      {
        projection: {
          _id: 1,
          state: 1,
          releaseName: 1,
          releaseId: 1,
          trackId: 1,
          errorMessage: 1,
          retryCount: 1,
          createdAt: 1,
          'metadata.bromaReleaseId': 1,
          'metadata.releaseName': 1,
          'metadata.releaseTitle': 1,
          'metadata.bsonDepthFixed': 1,
          'metadata.releaseId': 1,
          'metadata.trackId': 1,
          'metadata.title': 1,
        },
      },
    ).sort({ createdAt: -1 }).toArray();
    log(`4: Got ${allJobs.length} jobs`);
  } catch (e) {
    log(`FATAL: Failed to fetch jobs: ${e.message}`);
    await mongo.close();
    process.exit(1);
  }

  // 3. Fetch Broma releases
  const bromaById = {};
  let bromaToken = null;
  if (BROMA_EMAIL && BROMA_ACCOUNT_ID) {
    try {
      log('5: Logging into Broma...');
      const lr = await axios.post(`${BROMA_BASE_URL}/auth/login`, {
        email: BROMA_EMAIL,
        password: BROMA_PASSWORD,
      }, { timeout: 20000 });
      bromaToken = (lr.data?.data || lr.data).access_token || lr.data?.data?.accessToken;
      log('6: Login OK');

      const headers = { 'X-Access-Token': bromaToken, 'Content-Language': 'en' };
      let page = 1;
      const releases = [];

      while (page <= 20) {
        const rr = await axios.get(`${BROMA_BASE_URL}/accounts/${BROMA_ACCOUNT_ID}/assets/releases`, {
          headers,
          timeout: 15000,
          params: { page, limit: 200 },
        });
        const items = Array.isArray(rr.data?.data) ? rr.data.data : (Array.isArray(rr.data?.items) ? rr.data.items : []);
        if (items.length === 0) break;
        releases.push(...items);
        const total = rr.data?.total || 0;
        if (page === 1) log(`7: Broma total: ${total}`);
        page++;
        if (releases.length >= total) break;
      }
      log(`8: Fetched ${releases.length} releases`);

      for (const r of releases) {
        if (r.id) bromaById[String(r.id)] = r;
      }
    } catch (e) {
      log(`8: Broma API error: ${e.message}`);
      log('   Only "File missing" and "Repeated timeout" (without API check) can be cleaned.');
    }
  } else {
    log('5: No Broma credentials — Broma API deletion disabled');
  }

  // 4. Classify
  log('9: Classifying jobs...');
  const candidates = [];
  const deletionIds = [];

  for (const j of allJobs) {
    if (j.state !== 'failed') continue;

    const bid = j.metadata?.bromaReleaseId || '';
    const err = j.errorMessage || '';
    const relName = j.metadata?.releaseTitle || j.metadata?.releaseName || j.releaseName || j.metadata?.title || '?';
    const retryCount = j.retryCount || 0;
    const releaseId = j.releaseId || j.metadata?.releaseId || '';
    const trackId = j.trackId || j.metadata?.trackId || '';

    // Determine Broma status
    let bromaStatus = '-';
    let bromaAsset = null;
    if (bid && Object.keys(bromaById).length > 0) {
      bromaAsset = bromaById[bid] || null;
      if (bromaAsset) {
        bromaStatus = bromaAsset.moderation_status || bromaAsset.status || 'live';
      } else {
        bromaStatus = 'NOT_IN_BROMA';
      }
    }

    // Classify — order matters: check specific error patterns BEFORE generic NOT_IN_BROMA
    let reason = '';
    if (err.includes('ENOENT') || err.includes('no such file')) {
      reason = 'File missing from disk';
    } else if ((err.includes('timeout') || err.includes('ETIMEDOUT')) && retryCount > 3) {
      reason = 'Repeated timeout';
    } else if (err.includes('Missing Broma outlet')) {
      reason = 'No outlet IDs';
    } else if (err.includes('404') || err.toLowerCase().includes('not found')) {
      reason = '404 \u2014 deleted from Broma';
    } else if (bid && bromaStatus === 'NOT_IN_BROMA') {
      reason = 'Deleted from Broma';
    }

    if (reason && SAFE_CATEGORIES.has(reason)) {
      candidates.push({
        _id: j._id,
        relName,
        bid,
        releaseId,
        trackId,
        reason,
        err: err.slice(0, 120),
        bromaAsset,
        bromaStatus,
      });
      deletionIds.push(j._id);
    }
  }

  // 5. Summary
  log('');
  log('10: === CLASSIFICATION ===');
  const byReason = {};
  for (const c of candidates) byReason[c.reason] = (byReason[c.reason] || 0) + 1;
  for (const [reason, count] of Object.entries(byReason)) {
    log(`  ${reason}: ${count}`);
  }
  log(`  Total safe candidates: ${candidates.length}`);

  if (candidates.length === 0) {
    log('\nNothing to clean up. Exiting.');
    await mongo.close();
    return;
  }

  // 6. Print candidates
  log('');
  log('11: === CLEANUP CANDIDATES ===');
  for (const c of candidates) {
    const bromaState = c.bromaAsset
      ? (c.bromaAsset.moderation_status || c.bromaAsset.status || '?')
      : (c.bid && Object.keys(bromaById).length > 0 ? 'NOT_IN_BROMA' : 'unknown');
    log(`  [${c.reason}] ${c.relName}`);
    log(`    _id=${c._id} bid=${c.bid} releaseId=${c.releaseId} trackId=${c.trackId}`);
    log(`    Broma status: ${bromaState} | Error: ${sanitize(c.err)}`);
  }

  // 7. Dry-run exit
  if (IS_DRY_RUN) {
    log('\n12: === DRY RUN — no changes made ===');
    log(`Would delete ${candidates.length} delivery jobs from MongoDB`);
    log(`Would attempt Broma API draft deletion for ${candidates.filter(c => c.bid && c.bromaAsset).length} records`);
    log(`Log file: ${logFileName}`);
    log(`CSV file: ${csvFileName}`);
    fs.mkdirSync(LOG_DIR, { recursive: true });
    logToFile(path.join(LOG_DIR, logFileName), logLines);
    logToFile(path.join(LOG_DIR, csvFileName), csvLines);
    await mongo.close();
    console.log(`\nDry-run complete. Preview in cleanup-logs/${logFileName}`);
    return;
  }

  // 8. Confirm
  log('\n12: === CONFIRMATION REQUIRED ===');
  log(`This will DELETE ${candidates.length} delivery jobs from MongoDB.`);
  const bromaDraftCandidates = candidates.filter(c => c.bid && c.bromaAsset);
  if (bromaDraftCandidates.length > 0) {
    log(`And will attempt to DELETE ${bromaDraftCandidates.length} drafts from Broma API.`);
  }
  log('This is irreversible. Type the EXACT number of candidates to confirm:');
  log(`  (Enter "${candidates.length}" to confirm, anything else to cancel)`);
  log('');

  const confirm = await new Promise((resolve) => {
    process.stdin.once('data', (data) => resolve(data.toString().trim()));
  });

  if (confirm !== String(candidates.length)) {
    log('\nCancelled. No records were deleted.');
    fs.mkdirSync(LOG_DIR, { recursive: true });
    logToFile(path.join(LOG_DIR, logFileName), logLines);
    await mongo.close();
    console.log('Cleanup cancelled. Log saved.');
    return;
  }

  // 9. Execute deletions
  log(`\n13: === EXECUTING CLEANUP ===`);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  logToFile(path.join(LOG_DIR, logFileName), logLines);

  let deletedFromMongo = 0;
  let deletedFromBroma = 0;
  let bromaErrors = 0;

  for (const c of candidates) {
    const result = { relName: c.relName, bid: c.bid, _id: c._id, reason: c.reason, bromaAction: 'skipped', mongoAction: 'skipped', details: '' };

    // 9a. Delete from Broma API (only if asset exists and is in draft/check state)
    if (c.bid && c.bromaAsset) {
      const bStatus = (c.bromaAsset.moderation_status || c.bromaAsset.status || '').toLowerCase();
      const isDraftState = !['live', 'approved', 'rejected', 'removed'].includes(bStatus);
      if (isDraftState) {
        try {
          const headers = { 'X-Access-Token': bromaToken, 'Content-Language': 'en' };
          await axios({
            method: 'DELETE',
            url: `${BROMA_BASE_URL}/assets/draft/release/${c.bid}/remove`,
            headers,
            timeout: 15000,
          });
          deletedFromBroma++;
          result.bromaAction = 'deleted';
          result.details += `Broma draft deleted (was: ${bStatus}); `;
          log(`  [BROMA OK] ${c.relName} (bid=${c.bid}) — draft deleted`);
        } catch (e) {
          const code = e.response?.status || e.code || '?';
          const msg = sanitize(e.response?.data?.message || e.message);
          bromaErrors++;
          result.bromaAction = 'failed';
          result.details += `Broma delete failed (${code}: ${msg}); `;
          log(`  [BROMA FAIL] ${c.relName} (bid=${c.bid}) — ${code} ${msg}`);
        }
      } else {
        result.bromaAction = 'skipped_live';
        result.details += `Broma status is ${bStatus} — not deletable as draft; `;
        log(`  [BROMA SKIP] ${c.relName} (bid=${c.bid}) — status=${bStatus}, cannot delete`);
      }
    } else if (c.bid && !c.bromaAsset && Object.keys(bromaById).length > 0) {
      result.bromaAction = 'already_gone';
      result.details += 'Already deleted from Broma; ';
    } else if (!c.bid) {
      result.bromaAction = 'no_bid';
      result.details += 'No bromaReleaseId; ';
    } else {
      result.bromaAction = 'no_api';
      result.details += 'Broma API unavailable; ';
    }

    // 9b. Delete from MongoDB
    try {
      const delResult = await db.collection('deliveryjobs').deleteOne({ _id: c._id });
      if (delResult.deletedCount > 0) {
        deletedFromMongo++;
        result.mongoAction = 'deleted';
        result.details += 'MongoDB deleted';
        log(`  [MONGO OK] ${c.relName} (_id=${c._id}) — deleted`);
      } else {
        result.mongoAction = 'not_found';
        result.details += 'MongoDB not found (already deleted?)';
        log(`  [MONGO MISS] ${c.relName} (_id=${c._id}) — not found`);
      }
    } catch (e) {
      result.mongoAction = 'error';
      result.details += `MongoDB error: ${sanitize(e.message)}`;
      log(`  [MONGO ERR] ${c.relName} (_id=${c._id}) — ${e.message}`);
    }

    // Append to CSV
    csvLines.push([
      `"${c.relName.replace(/"/g, '""')}"`,
      c.bid,
      c.releaseId,
      c.trackId,
      c.reason,
      result.bromaAction,
      result.mongoAction,
      `"${result.details.replace(/"/g, '""')}"`,
    ].join(','));
  }

  // 10. Final report
  const finishedAt = timestamp();
  log('');
  log('14: === CLEANUP COMPLETE ===');
  log(`  Finished at: ${finishedAt}`);
  log(`  Duration: ${(new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000}s`);
  log(`  Candidates processed: ${candidates.length}`);
  log(`  MongoDB deleted: ${deletedFromMongo}`);
  log(`  Broma API deleted: ${deletedFromBroma}`);
  log(`  Broma API errors: ${bromaErrors}`);
  log(`  Broma skips (live/approved): ${candidates.filter(c => c.bid && c.bromaAsset).length - deletedFromBroma - bromaErrors}`);

  // Save logs
  const logPath = path.join(LOG_DIR, logFileName);
  const csvPath = path.join(LOG_DIR, csvFileName);
  logToFile(logPath, logLines);
  logToFile(csvPath, csvLines);
  log(`\nLog file: ${logPath}`);
  log(`CSV file: ${csvPath}`);

  await mongo.close();
  console.log(`\nDone. ${candidates.length} processed, ${deletedFromMongo} MongoDB deleted, ${deletedFromBroma} Broma deleted.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
