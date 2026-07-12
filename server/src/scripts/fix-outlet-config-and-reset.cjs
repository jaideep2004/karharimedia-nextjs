/**
 * 1. Add expandToAllOutlets: true to Broma provider config
 * 2. Reset all failed "Missing Broma outlet ids" jobs to 'queued' so the connector resumes
 *
 * Usage:
 *   node server/src/scripts/fix-outlet-config-and-reset.cjs --dry-run
 *   node server/src/scripts/fix-outlet-config-and-reset.cjs
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');
const fs = require('fs');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const LOG_DIR = path.join(__dirname, 'status-logs');
const DRY_RUN = process.argv.includes('--dry-run');

function timestamp() { return new Date().toISOString(); }

async function main() {
  const startedAt = timestamp();
  const logName = `fix-outlet-config-${startedAt.replace(/[:.]/g, '-')}`;
  const logLines = [];
  function log(msg) { console.log(msg); logLines.push(`[${timestamp()}] ${msg}`); }
  function save() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOG_DIR, `${logName}.log`), logLines.join('\n') + '\n', 'utf8');
  }

  if (DRY_RUN) log('=== DRY RUN — no changes ===');
  log('=== Fix Outlet Config + Reset Failed Jobs ===');
  log('Started: ' + startedAt);

  const mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  const db = mongo.db('test');

  // 1. Update provider config
  log('\n1: Updating Broma provider config...');
  const provider = await db.collection('dspproviders').findOne({ key: 'broma' });
  if (!provider) { log('FATAL: No Broma provider found'); process.exit(1); }

  const hasExpand = provider.config?.expandToAllOutlets;
  log('   Current expandToAllOutlets: ' + hasExpand);

  if (!DRY_RUN) {
    await db.collection('dspproviders').updateOne(
      { key: 'broma' },
      { $set: { 'config.expandToAllOutlets': true } }
    );
    log('   ✅ Set expandToAllOutlets: true');
  } else {
    log('   Would set expandToAllOutlets: true');
  }

  // 2. Count failed jobs
  const failedCount = await db.collection('deliveryjobs').countDocuments({
    providerKey: 'broma', state: 'failed',
    errorMessage: /Missing Broma outlet ids/i,
    'metadata.bromaReleaseId': { $exists: true, $ne: '' },
  });
  log('\n2: Failed "Missing outlet ids" jobs to reset: ' + failedCount);

  if (failedCount === 0) {
    log('   Nothing to reset.');
    await mongo.close();
    save();
    return;
  }

  // 3. Reset jobs
  log('\n3: ' + (DRY_RUN ? 'Would reset' : 'Resetting') + ' jobs to queued...');

  if (!DRY_RUN) {
    const result = await db.collection('deliveryjobs').updateMany(
      {
        providerKey: 'broma', state: 'failed',
        errorMessage: /Missing Broma outlet ids/i,
        'metadata.bromaReleaseId': { $exists: true, $ne: '' },
      },
      {
        $set: {
          state: 'queued',
          retryCount: 0,
          deadLettered: false,
          updatedAt: new Date(),
          'metadata.retryReason': 'reset-after-outlet-fix',
          'metadata.retriedAt': new Date().toISOString(),
        },
        $unset: {
          errorMessage: '',
          lockedAt: '',
          lockedBy: '',
          lockExpiresAt: '',
          lastAttemptAt: '',
          nextRetryAt: '',
        },
        $push: {
          events: {
            state: 'queued',
            message: 'Reset to queued after outlet config fix (expandToAllOutlets: true)',
            source: 'system',
            createdAt: new Date(),
          },
        },
      },
    );
    log('   Matched: ' + result.matchedCount + ', Modified: ' + result.modifiedCount);
  } else {
    log('   (DRY RUN)');
  }

  log('\n=== Done ===');
  save();
  await mongo.close();
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
