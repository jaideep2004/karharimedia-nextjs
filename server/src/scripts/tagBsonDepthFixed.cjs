/**
 * Follow-up migration: tag BSON-depth-fixed jobs with metadata.bsonDepthFixed: true
 * so the DSP deliveries UI can display them in the "BSON Failed" tab.
 *
 * Run AFTER fixBsonDepth.cjs has been executed.
 *
 * Run: node server/src/scripts/tagBsonDepthFixed.cjs
 */
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb+srv://jai2004bgmi:bgmi2004@singleaudio-nextjs.hamfzjb.mongodb.net/?retryWrites=true&w=majority&appName=singleaudio-nextjs';

async function main() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db('test');

  // Identify BSON-fixed jobs by the fingerprint left by fixBsonDepth.cjs:
  //   state: 'failed', deadLettered: false, errorMessage unset, locked* unset
  const filter = {
    providerKey: 'broma',
    state: 'failed',
    deadLettered: false,
    errorMessage: { $exists: false },
    lockedAt: { $exists: false },
    lockedBy: { $exists: false },
    lockExpiresAt: { $exists: false },
  };

  const before = await db.collection('deliveryjobs').countDocuments(filter);
  console.log(`Found ${before} BSON-depth-fixed jobs to tag.`);

  if (before === 0) {
    console.log('Nothing to tag. Exiting.');
    await client.close();
    return;
  }

  const result = await db.collection('deliveryjobs').updateMany(
    filter,
    { $set: { 'metadata.bsonDepthFixed': true } }
  );

  console.log(`Tagged ${result.modifiedCount} jobs with metadata.bsonDepthFixed: true`);
  await client.close();
}

main().catch(console.error);
