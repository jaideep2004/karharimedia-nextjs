const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
(async () => {
  const mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  const db = mongo.db('test');

  // Check one failed job for bromaOutletIds
  const job = await db.collection('deliveryjobs').findOne({
    providerKey: 'broma', state: 'failed',
    errorMessage: /Missing Broma outlet ids/i,
  }, { projection: { 'metadata.bromaOutletIds': 1, 'metadata.bromaReleaseTypeId': 1, 'metadata.expandToAllOutlets': 1 } });
  console.log('Sample failed job metadata:');
  console.log('  bromaOutletIds:', JSON.stringify(job?.metadata?.bromaOutletIds));
  console.log('  bromaReleaseTypeId:', job?.metadata?.bromaReleaseTypeId);
  console.log('  expandToAllOutlets:', job?.metadata?.expandToAllOutlets);

  // Check provider config for expandToAllOutlets
  const provider = await db.collection('dspproviders').findOne({ key: 'broma' });
  console.log('\nProvider config has expandToAllOutlets:', provider?.config?.expandToAllOutlets);
  console.log('Provider config has distributeToAllOutlets:', provider?.config?.distributeToAllOutlets);

  // Check the release readiness for a sample unsuccessful release
  const job2 = await db.collection('deliveryjobs').findOne({
    providerKey: 'broma', state: 'failed',
    errorMessage: /Missing Broma outlet ids/i,
  }, { projection: { releaseId: 1 } });
  if (job2?.releaseId) {
    const release = await db.collection('releases').findOne(
      { _id: job2.releaseId },
      { projection: { 'bromaReadiness.outletIds': 1, 'bromaReadiness': 1 } }
    );
    if (release) {
      console.log('\nRelease bromaReadiness:');
      console.log('  outletIds:', JSON.stringify(release.bromaReadiness?.outletIds));
      console.log('  full:', JSON.stringify(release.bromaReadiness).slice(0, 500));
    }
  }

  await mongo.close();
})();
