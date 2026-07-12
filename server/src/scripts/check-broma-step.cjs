const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
(async () => {
  const mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  const db = mongo.db('test');

  const jobs = await db.collection('deliveryjobs').find({
    providerKey: 'broma', state: 'failed',
    errorMessage: /Missing Broma outlet ids/i,
  }).project({
    'metadata.bromaStep': 1,
    'metadata.bromaReleaseId': 1,
    releaseName: 1,
  }).toArray();

  const stepCounts = {};
  for (const j of jobs) {
    const step = j.metadata?.bromaStep || '(none)';
    stepCounts[step] = (stepCounts[step] || 0) + 1;
  }
  console.log('bromaStep distribution across ' + jobs.length + ' failed jobs:');
  for (const [s, c] of Object.entries(stepCounts).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + s + ': ' + c);
  }

  // Show bromaReleaseId presence
  const withBid = jobs.filter(j => j.metadata?.bromaReleaseId).length;
  console.log('\nWith bromaReleaseId: ' + withBid + '/' + jobs.length);

  await mongo.close();
})();
