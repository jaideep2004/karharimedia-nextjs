/**
 * TEMP diagnostic: check canonical tracks collection artwork field population.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';

async function main() {
  await connectDB();
  const db = mongoose.connection.db!;

  const sample = await db.collection('tracks').find(
    {},
    { projection: { title: 1, audioFile: 1, artwork: 1, artworkFile: 1, artworkUrl: 1, releaseId: 1, source: 1 } }
  ).limit(6).toArray();
  console.log('--- canonical tracks sample ---');
  for (const t of sample) console.log(JSON.stringify({ id: String(t._id), title: t.title, audioFile: t.audioFile, artwork: t.artwork, artworkFile: t.artworkFile, artworkUrl: t.artworkUrl, releaseId: String(t.releaseId || ''), source: t.source }));

  const stats = await db.collection('tracks').aggregate([
    { $group: {
        _id: null,
        total: { $sum: 1 },
        withArtwork: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$artwork', ''] }, ''] }, 1, 0] } },
        withArtworkFile: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$artworkFile', ''] }, ''] }, 1, 0] } },
        withAudioFile: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$audioFile', ''] }, ''] }, 1, 0] } },
    } },
  ]).toArray();
  console.log('\n--- canonical tracks stats ---');
  console.log(JSON.stringify(stats[0]));

  const rel = await db.collection('releases').findOne({}, { projection: { artwork: 1, artworkFile: 1, artworkUrl: 1, coverArt: 1 } });
  console.log('\n--- one release artwork fields ---');
  console.log(JSON.stringify(rel));

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
