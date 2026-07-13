const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { MongoClient } = require('mongodb');
const axios = require('axios');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const BASE = (process.env.BROMA_BASE_URL || 'https://api-rod.broma16.com/api').replace(/\/+$/, '');

const NAMES = [
  'Tujhe Maanga Tha', 'Tujhko Mirchi', 'Tujhko Mirch',
  'Dil Ne Tujhko Pukara Female', 'Humnava', 'Ishq Ki Gali',
  'Dil ke taar bajayein', 'Ek Ladka Hai Ek', 'Eka Karelb', 'Eka Karelpopi',
  'Gawah Haichand', 'Ghar Se Nikal Pada', 'Do Ghoont Mujhe Bhi Pila De Sharabi',
  'Aaj RuswaTari Galiyon', 'Atariya Pe Lotan Kabootar Re', 'Aapke Pyaar Mein Hum',
  'Leto Ayeho Hame Sapnoki Gaon Mein', 'Aati Hai To Ch', 'Aayega Maza Ab',
  'Aayegi Har Pal Tujhe Meri', 'Aayegi Har Pal Tujhe', 'Aayegi Har Pal',
  'Ek Pardesi Mera Dil Le Gaya', 'Aap ka aana dil mein', 'Yeh Reshmi Zulfein',
  'Aap Ka Aana Dil',
];

(async () => {
  const mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await mongo.connect();
  const db = mongo.db('test');

  // Find in our DB
  const jobs = await db.collection('deliveryjobs').find({
    providerKey: 'broma',
    releaseName: { $in: NAMES },
  }).project({
    releaseName: 1, state: 1, errorMessage: 1,
    'metadata.bromaReleaseId': 1, 'metadata.bromaStep': 1,
  }).toArray();

  console.log('Found ' + jobs.length + ' matching jobs:\n');

  // Login to Broma
  const lr = await axios.post(BASE + '/auth/login', {
    email: process.env.BROMA_EMAIL, password: process.env.BROMA_PASSWORD,
  }, { timeout: 20000 });
  const token = (lr.data?.data || lr.data).access_token || lr.data?.data?.accessToken;
  const headers = { 'X-Access-Token': token, 'Content-Language': 'en' };

  for (const j of jobs) {
    const bid = String(j.metadata?.bromaReleaseId || '');
    const name = j.releaseName || '?';

    if (!bid) { console.log(name + ': NO BROMA ID'); continue; }

    try {
      const r = await axios.get(BASE + '/repertoire/release/' + bid + '/data', { headers, timeout: 10000 });
      const d = r.data?.data || r.data;
      const step = d.step || '-';
      const modStatus = d.moderation_status || '-';
      const relStatus = d.release_status || '-';
      const statuses = Array.isArray(d.statuses) ? d.statuses.join(',') : '-';

      console.log(name);
      console.log('  bid=' + bid + ' | bromaStep=' + step + ' | mod=' + modStatus + ' | rel=' + relStatus + ' | statuses=' + statuses);
      console.log('  ourState=' + j.state + ' | ourError=' + (j.errorMessage || '').slice(0, 60));
      console.log('');
    } catch (e) {
      const status = e.response?.status || 'error';
      const body = e.response?.data ? JSON.stringify(e.response.data).slice(0, 100) : e.message;
      console.log(name + ' (' + bid + '): FETCH ERROR ' + status + ' | ' + body + '\n');
    }
    await new Promise(r => setTimeout(r, 300));
  }

  await mongo.close();
})();
