/**
 * Comprehensive Broma delivery status audit.
 *
 * Fetches from THREE sources and cross-references:
 *   1. Our MongoDB DeliveryJobs
 *   2. Broma drafts endpoint  (/accounts/{id}/assets/drafts/all)  — matches Broma dashboard
 *   3. Broma releases endpoint (/accounts/{id}/assets/releases)   — full picture (live, approved, rejected)
 *
 * Usage:
 *   node server/src/scripts/bromaDeepStatus.cjs
 *
 * Outputs:
 *   - Summary to console
 *   - Detailed CSV to server/src/scripts/status-logs/
 *   - Full report log
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
  const logName = `broma-status-${startedAt.replace(/[:.]/g, '-')}`;
  const logLines = [];
  function log(msg) { console.log(msg); logLines.push(`[${timestamp()}] ${msg}`); }
  function save() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOG_DIR, `${logName}.log`), logLines.join('\n') + '\n', 'utf8');
  }

  log(`=== Broma Deep Status Audit ===`);
  log(`Started: ${startedAt}`);

  // 1. MongoDB
  log('\n1: Connecting to MongoDB...');
  let mongo;
  try {
    mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    await mongo.connect();
  } catch (e) { log(`FATAL: ${e.message}`); process.exit(1); }
  const db = mongo.db('test');

  log('2: Fetching remaining Broma delivery jobs...');
  const allJobs = await db.collection('deliveryjobs').find(
    { providerKey: 'broma' },
    {
      projection: {
        _id: 1, state: 1, releaseName: 1, releaseId: 1, trackId: 1,
        errorMessage: 1, retryCount: 1, createdAt: 1,
        'metadata.bromaReleaseId': 1, 'metadata.releaseTitle': 1,
        'metadata.releaseName': 1, 'metadata.releaseId': 1,
        'metadata.trackId': 1, 'metadata.title': 1,
        'metadata.bsonDepthFixed': 1, 'metadata.bromaStep': 1,
        'metadata.bromaModerationStatus': 1,
      },
    },
  ).sort({ createdAt: -1 }).toArray();
  log(`   Total jobs: ${allJobs.length}`);

  // State breakdown
  const stateCounts = {};
  for (const j of allJobs) stateCounts[j.state] = (stateCounts[j.state] || 0) + 1;
  for (const [s, c] of Object.entries(stateCounts)) log(`   ${s}: ${c}`);

  // BSON fixed breakdown
  const bsonFixed = allJobs.filter(j => j.metadata?.bsonDepthFixed).length;
  const bsonFailed = allJobs.filter(j => j.state === 'failed' && j.metadata?.bsonDepthFixed).length;
  log(`   BSON depth fixed: ${bsonFixed} (${bsonFailed} still failed)`);

  // 2. Broma login
  log('\n3: Logging into Broma...');
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
      const respBody2 = e2.response?.data ? JSON.stringify(e2.response.data).slice(0, 300) : '';
      log(`   Login FAILED (retry): ${e2.message} | status=${e2.response?.status} | body=${respBody2}`);
      save(); process.exit(1);
    }
  }

  const headers = { 'X-Access-Token': token, 'Content-Language': 'en' };

  // 3. Fetch Broma DRAFTS (matches Broma dashboard)
  log('\n4: Fetching Broma DRAFTS...');
  const drafts = await fetchAllPages(
    `${BROMA_BASE_URL}/accounts/${BROMA_ACCOUNT_ID}/assets/drafts/all`,
    headers,
    {},
  );
  log(`   Broma drafts total: ${drafts.length}`);

  // 4. Fetch Broma RELEASES (full picture)
  log('\n5: Fetching Broma RELEASES...');
  const releases = await fetchAllPages(
    `${BROMA_BASE_URL}/accounts/${BROMA_ACCOUNT_ID}/assets/releases`,
    headers,
    {},
  );
  log(`   Broma releases total: ${releases.length}`);

  // Build lookup maps
  const draftById = {};
  for (const d of drafts) if (d.id) draftById[String(d.id)] = d;

  const releaseById = {};
  for (const r of releases) if (r.id) releaseById[String(r.id)] = r;

  // Moderation status breakdown of Broma releases (matches dashboard)
  log('\n6: Broma RELEASES moderation status breakdown:');
  const msBreakdown = {};
  for (const r of releases) {
    const ms = r.moderation_status || '(none)';
    msBreakdown[ms] = (msBreakdown[ms] || 0) + 1;
  }
  for (const [ms, count] of Object.entries(msBreakdown).sort((a, b) => b[1] - a[1])) {
    log(`   ${ms}: ${count}`);
  }

  // The Broma dashboard's "110 drafts" = items with moderation_status='pending'
  const pendingReleases = releases.filter(r => r.moderation_status === 'pending' && !r.deleted_at);
  log(`\n   → "Pending" (matches dashboard ~110): ${pendingReleases.length}`);

  // Also check what "step" the drafts have
  log('\n   Broma DRAFTS breakdown (step/status):');
  const draftStepBreakdown = {};
  for (const d of drafts) {
    const step = d.step || d.status || Array.isArray(d.statuses) ? (d.statuses || []).join(',') : 'unknown';
    draftStepBreakdown[step] = (draftStepBreakdown[step] || 0) + 1;
  }
  for (const [step, count] of Object.entries(draftStepBreakdown).sort((a, b) => b[1] - a[1])) {
    log(`   step=${step}: ${count}`);
  }

  // 7. Cross-reference each job
  log('\n8: Cross-referencing...');
  const csvRows = [];
  const rows = [];

  for (const j of allJobs) {
    const bid = j.metadata?.bromaReleaseId || '';
    const relName = j.metadata?.releaseTitle || j.metadata?.releaseName || j.releaseName || j.metadata?.title || '?';
    const err = j.errorMessage || '';
    const state = j.state;
    const bsonFixed = !!j.metadata?.bsonDepthFixed;
    const releaseId = j.releaseId || j.metadata?.releaseId || '';
    const trackId = j.trackId || j.metadata?.trackId || '';

    const inDrafts = !!(bid && draftById[bid]);
    const inReleases = !!(bid && releaseById[bid]);

    let bromaModStatus = '-';
    let bromaStep = '-';
    let bromaTitle = '-';

    if (inReleases) {
      const r = releaseById[bid];
      bromaModStatus = r.moderation_status || r.status || 'live';
      bromaStep = Array.isArray(r.statuses) ? r.statuses.join(',') : r.step || '';
      bromaTitle = r.title || r.name || '';
    } else if (inDrafts) {
      const d = draftById[bid];
      bromaModStatus = d.moderation_status || d.status || 'draft';
      bromaStep = d.step || Array.isArray(d.statuses) ? (d.statuses || []).join(',') : '';
      bromaTitle = d.title || d.name || '';
    }

    // Categorize
    let category;
    if (!bid) {
      category = 'NO_BROMA_ID';
    } else if (inReleases && ['approved', 'live'].includes(bromaModStatus.toLowerCase())) {
      category = 'LIVE_ON_BROMA';
    } else if (inReleases && bromaModStatus.toLowerCase() === 'rejected') {
      category = 'REJECTED_ON_BROMA';
    } else if (inDrafts) {
      category = 'IN_BROMA_DRAFTS';
    } else if (inReleases) {
      category = `RELEASE_${bromaModStatus.toUpperCase()}`;
    } else {
      category = 'NOT_IN_BROMA';
    }

    const bsonTag = bsonFixed ? 'BSON_FIXED' : '';

    rows.push({
      relName, bid, state, releaseId, trackId, err: sanitize(err).slice(0, 100),
      bsonTag, category,
      bromaModStatus, bromaStep, bromaTitle,
      inDrafts, inReleases, _id: j._id,
    });
  }

  // 9. Summarize
  log('\n9: === CATEGORY BREAKDOWN ===');
  const catCounts = {};
  for (const r of rows) {
    catCounts[r.category] = (catCounts[r.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(catCounts)) {
    log(`   ${cat}: ${count}`);
  }

  // Detailed breakdowns
  log('\n8: === DETAILED BREAKDOWNS ===');

  // a) Jobs that are LIVE on Broma
  const liveRows = rows.filter(r => r.category === 'LIVE_ON_BROMA');
  log(`\n--- LIVE ON BROMA (${liveRows.length}) ---`);
  for (const r of liveRows) {
    log(`   ${r.relName} | bid=${r.bid} | ourState=${r.state}${r.bsonTag ? ' | ' + r.bsonTag : ''}`);
  }

  // b) Jobs that are in Broma drafts
  const draftRows = rows.filter(r => r.category === 'IN_BROMA_DRAFTS');
  log(`\n--- IN BROMA DRAFTS (${draftRows.length}) ---`);
  for (const r of draftRows) {
    log(`   ${r.relName} | bid=${r.bid} | step=${r.bromaStep} | mod=${r.bromaModStatus} | ourState=${r.state}${r.bsonTag ? ' | ' + r.bsonTag : ''}`);
  }

  // c) Jobs that are NOT_IN_BROMA (no trace anywhere)
  const notFoundRows = rows.filter(r => r.category === 'NOT_IN_BROMA');
  log(`\n--- NOT IN BROMA (${notFoundRows.length}) ---`);
  for (const r of notFoundRows) {
    log(`   ${r.relName} | bid=${r.bid} | ourState=${r.state} | err=${sanitize(r.err).slice(0, 60)}${r.bsonTag ? ' | ' + r.bsonTag : ''}`);
  }

  // d) BSON fixed jobs that are still failed
  const bsonFailedRows = rows.filter(r => r.bsonTag === 'BSON_FIXED' && r.state === 'failed');
  log(`\n--- BSON FIXED + STILL FAILED (${bsonFailedRows.length}) ---`);
  for (const r of bsonFailedRows) {
    log(`   ${r.relName} | bid=${r.bid} | category=${r.category} | err=${sanitize(r.err).slice(0, 60)}`);
  }

  // e) BSON fixed jobs that are non-failed
  const bsonOkRows = rows.filter(r => r.bsonTag === 'BSON_FIXED' && r.state !== 'failed');
  log(`\n--- BSON FIXED + OK (${bsonOkRows.length}) ---`);
  for (const r of bsonOkRows) {
    log(`   ${r.relName} | bid=${r.bid} | state=${r.state} | category=${r.category}`);
  }

  // 10. Match against Broma dashboard
  log('\n10: === BROMA DASHBOARD MATCH ===');
  log(`   Broma dashboard shows: ${drafts.length} drafts`);
  const ourIdsInDrafts = rows.filter(r => r.bid && draftById[r.bid]).length;
  log(`   Our delivery jobs found in those drafts: ${ourIdsInDrafts}`);
  // How many drafts have NO matching delivery job?
  const allBids = new Set(rows.filter(r => r.bid).map(r => r.bid));
  const orphanDrafts = drafts.filter(d => !allBids.has(String(d.id)));
  log(`   Drafts with NO delivery job: ${orphanDrafts.length}`);
  log(`   -> These ${orphanDrafts.length} exist on Broma but have no job in our DB (might need new jobs created)`);

  // 11. Recommendations
  log('\n11: === RECOMMENDATIONS ===');

  // Jobs we could retry
  const retryable = rows.filter(r =>
    (r.category === 'IN_BROMA_DRAFTS' || r.category === 'NOT_IN_BROMA') &&
    (r.state === 'failed' || r.state === 'needs_attention')
  );
  log(`\n   RETRYABLE (failed + in drafts or not in broma): ${retryable.length}`);
  for (const r of retryable) {
    log(`   -> ${r.relName} | bid=${r.bid} | cat=${r.category} | state=${r.state}${r.bsonTag ? ' | ' + r.bsonTag : ''}`);
  }

  // Truly hopeless
  const rejected = rows.filter(r => r.category === 'REJECTED_ON_BROMA');
  if (rejected.length) {
    log(`\n   REJECTED BY BROMA (cannot retry): ${rejected.length}`);
    for (const r of rejected) log(`   -> ${r.relName} | bid=${r.bid}`);
  }

  // Live but still failed in our DB
  const liveButFailed = rows.filter(r => r.category === 'LIVE_ON_BROMA' && r.state === 'failed');
  if (liveButFailed.length) {
    log(`\n   LIVE ON BROMA but FAILED in our DB (should be marked delivered): ${liveButFailed.length}`);
    for (const r of liveButFailed) {
      log(`   -> ${r.relName} | bid=${r.bid}`);
    }
  }

  // 12. Write CSV
  const csvPath = path.join(LOG_DIR, `${logName}.csv`);
  const csvHeader = 'relName,bid,state,releaseId,trackId,error,bsonTag,category,bromaModStatus,bromaStep,inDrafts,inReleases';
  const csvLines = [csvHeader];
  for (const r of rows) {
    csvLines.push([
      `"${r.relName.replace(/"/g, '""')}"`,
      r.bid, r.state, r.releaseId, r.trackId,
      `"${r.err.replace(/"/g, '""')}"`,
      r.bsonTag, r.category, r.bromaModStatus, r.bromaStep,
      r.inDrafts, r.inReleases,
    ].join(','));
  }
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
  log(`\n11: CSV -> ${csvPath}`);

  // Save log
  const logPath = path.join(LOG_DIR, `${logName}.log`);
  fs.writeFileSync(logPath, logLines.join('\n') + '\n', 'utf8');
  log(`\n    Log -> ${logPath}`);

  await mongo.close();
  console.log('\n=== Done ===');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
