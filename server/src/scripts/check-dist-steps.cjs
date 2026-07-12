const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');
const axios = require('axios');
const BASE = (process.env.BROMA_BASE_URL || 'https://api-rod.broma16.com/api').replace(/\/+$/, '');
(async () => {
  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  const mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  const db = mongo.db('test');
  const jobs = await db.collection('deliveryjobs').find({
    providerKey: 'broma', state: 'failed',
    errorMessage: /Missing Broma outlet ids/i,
    'metadata.bromaReleaseId': { $exists: true, $ne: '' },
  }).project({ 'metadata.bromaReleaseId': 1, releaseName: 1 }).toArray();
  await mongo.close();

  const lr = await axios.post(BASE + '/auth/login', { email: process.env.BROMA_EMAIL, password: process.env.BROMA_PASSWORD }, { timeout: 20000 });
  const token = (lr.data?.data || lr.data).access_token || lr.data?.data?.accessToken;
  const headers = { 'X-Access-Token': token, 'Content-Language': 'en' };

  const stepCounts = {};
  let success = 0, fail = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const bid = String(j.metadata.bromaReleaseId);
    process.stdout.write('\r' + (i+1) + '/' + jobs.length + ' bid=' + bid + '    ');
    try {
      const r = await axios.get(BASE + '/repertoire/release/' + bid + '/data', { headers, timeout: 10000 });
      const d = r.data?.data || r.data;
      const step = d.step || 'none';
      stepCounts[step] = (stepCounts[step] || 0) + 1;
      success++;
    } catch(e) {
      fail++;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('\nStep distribution across ' + success + ' releases (' + fail + ' failed to fetch):');
  for (const [s, c] of Object.entries(stepCounts).sort((a,b) => b[1]-a[1])) {
    console.log('  ' + s + ': ' + c);
  }
})();
