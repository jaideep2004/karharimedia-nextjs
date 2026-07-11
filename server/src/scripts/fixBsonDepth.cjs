/**
 * One-time migration: clear deeply nested connectorMetadata from BSON-depth-failed jobs.
 *
 * Run: node server/src/scripts/fixBsonDepth.cjs
 *
 * This script:
 * 1. Finds all failed/needs_attention Broma jobs with connectorMetadata deeper than 2 levels
 * 2. Replaces connectorMetadata with a flat copy (strips recursive nesting)
 * 3. Clears deadLettered=false, errorMessage so they can be retried
 *
 * Run AFTER deploying the code fix (so new polling cycles don't re-create the nesting).
 */
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb+srv://jai2004bgmi:bgmi2004@singleaudio-nextjs.hamfzjb.mongodb.net/?retryWrites=true&w=majority&appName=singleaudio-nextjs';

async function main() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db('test');

  // Find jobs where connectorMetadata has recursive nesting
  const cursor = db.collection('deliveryjobs').aggregate([
    {
      $match: {
        state: { $in: ['failed', 'needs_attention'] },
        providerKey: 'broma',
      }
    },
    {
      $addFields: {
        cmType: { $type: '$metadata.connectorMetadata' },
        cmDepth2: { $type: '$metadata.connectorMetadata.connectorMetadata' },
      }
    },
    {
      $match: {
        cmType: 'object',
        cmDepth2: { $in: ['object', 'array'] },
      }
    },
    {
      $project: {
        title: '$metadata.releaseTitle',
        state: 1,
        errorMessage: 1,
      }
    }
  ]);

  let count = 0;
  const BATCH_SIZE = 50;
  let batch = [];

  for await (const job of cursor) {
    batch.push(job._id);
    count++;

    if (batch.length >= BATCH_SIZE) {
      await fixBatch(db, batch);
      batch = [];
    }
    console.log(`  [${count}] ${job.title || job._id} — connectorMetadata has nesting, state=${job.state}`);
  }

  if (batch.length > 0) {
    await fixBatch(db, batch);
  }

  console.log(`\nDone. Fixed ${count} jobs.`);
  await client.close();
}

async function fixBatch(db, ids) {
  const bulk = db.collection('deliveryjobs').initializeUnorderedBulkOp();

  for (const id of ids) {
    const job = await db.collection('deliveryjobs').findOne(
      { _id: id },
      { projection: { metadata: 1 } }
    );

    if (!job || !job.metadata) continue;

    const meta = job.metadata;
    const cm = meta.connectorMetadata;

    if (!cm || typeof cm !== 'object') continue;

    // Flatten: strip any nested connectorMetadata inside connectorMetadata
    const { connectorMetadata: _nested, ...flatCm } = cm;

    bulk.find({ _id: id }).updateOne({
      $set: {
        'metadata.connectorMetadata': flatCm,
        'metadata.bsonDepthFixed': true,
        state: 'failed',
        deadLettered: false,
      },
      $unset: {
        errorMessage: '',
        lockedAt: '',
        lockedBy: '',
        lockExpiresAt: '',
      },
    });
  }

  if (bulk.length > 0) {
    await bulk.execute();
  }
}

main().catch(console.error);
