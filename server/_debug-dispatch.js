const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Find the track that would be dispatched
  const release = await mongoose.connection.collection('releases').findOne(
    {},
    { sort: { _id: -1 }, projection: { tracks: 1, title: 1 } }
  );
  if (!release || !release.tracks || !release.tracks[0]) {
    console.log('No release with tracks');
    await mongoose.disconnect();
    return;
  }
  const embeddedTrack = release.tracks[0];
  console.log('Release:', release.title);
  console.log('Embedded track isrc:', embeddedTrack.isrc);
  console.log('Embedded track title:', embeddedTrack.title);

  // Look up the track in the tracks collection by ISRC
  const trackDoc = await mongoose.connection.collection('tracks').findOne({ isrc: embeddedTrack.isrc });
  console.log('Track in tracks collection:', trackDoc ? trackDoc._id.toString() : 'NOT FOUND');

  // Check YouTube provider
  const ytProvider = await mongoose.connection.collection('dspproviders').findOne({ key: 'youtube' });
  console.log('YouTube provider:', ytProvider ? 'found' : 'NOT FOUND');
  console.log('YouTube enabled:', ytProvider?.enabled);
  console.log('YouTube has accessToken:', !!(ytProvider?.credentials?.accessToken));

  // Try calling the API with auth
  console.log('\n--- Test self-call to Express backend ---');
  const http = require('http');
  const body = JSON.stringify({
    trackId: trackDoc ? trackDoc._id.toString() : '',
    isrc: embeddedTrack.isrc,
    providerKey: 'youtube',
    operation: 'deliver',
    config: { title: 'Test Video', description: 'Test', visibility: 'public', preset: 'bars' }
  });

  const opts = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/dsp/deliveries/dispatch',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': 'Bearer test'  // will fail, but shows if endpoint responds
    }
  };
  const req = http.request(opts, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Body:', data.substring(0, 500));
      mongoose.disconnect();
    });
  });
  req.write(body);
  req.end();
}
main().catch(e => { console.error(e); process.exit(1); });
