const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const release = await mongoose.connection.collection('releases').findOne({}, { sort: { _id: -1 }, projection: { tracks: 1, title: 1 } });
  if (release && release.tracks && release.tracks.length > 0) {
    const t = release.tracks[0];
    console.log('Release title:', release.title);
    console.log('Track keys:', Object.keys(t));
    console.log('Track _id:', t._id);
    console.log('Track title:', t.title);
  } else {
    console.log('No release with tracks');
  }
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
