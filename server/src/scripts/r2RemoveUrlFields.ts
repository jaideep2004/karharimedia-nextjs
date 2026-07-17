import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/db';

dotenv.config();

const args = process.argv.slice(2);
const isScan = args.includes('--scan');
const isWrite = args.includes('--write');
const isDryRun = !isScan && !isWrite;

// Top-level URL fields → canonical filename fields
const TOP_FIELDS: Record<string, string[]> = {
  artworkUrl: ['artwork', 'artworkFile'],
  audioUrl: ['audioFile'],
  coverUrl: ['artwork', 'artworkFile'],
  coverArt: ['artwork', 'artworkFile'],
  fileUrl: ['audioFile'],
  profilePicture: ['profilePictureFile'],
  artworkUploadedUrl: ['artworkUploadedFilename'],
  legacyArtworkUrl: ['artwork', 'artworkFile'],
  legacyCoverUrl: ['artwork', 'artworkFile'],
};

// Nested URL fields inside arrays → canonical fields on same nested object
const NESTED_FIELDS: Record<string, Record<string, string[]>> = {
  releases: {
    'tracks.audioUrl': ['tracks.audioFile'],
    'tracks.artworkUrl': ['tracks.artwork', 'tracks.artworkFile'],
    'tracks.fileUrl': ['tracks.audioFile'],
  },
  supportmessages: {
    'attachments.url': ['attachments.key'],
  },
};

function extractFilename(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  try {
    return decodeURIComponent(s.split('/').pop() || s);
  } catch {
    return s.split('/').pop() || s;
  }
}

async function scan() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');

  const collections = await db.listCollections().toArray();
  console.log('\n=== SCAN: URL fields (top-level + nested) ===\n');

  for (const { name } of collections) {
    const coll = db.collection(name);

    // Top-level fields
    for (const [field, canonical] of Object.entries(TOP_FIELDS)) {
      const count = await coll.countDocuments({ [field]: { $exists: true, $ne: '' } });
      if (count === 0) continue;
      const sample = await coll.findOne({ [field]: { $exists: true, $ne: '' } }, { projection: { [field]: 1, ...Object.fromEntries(canonical.map(c => [c, 1])), _id: 1 } });
      const hasCanonical = sample && canonical.some(c => sample[c] && String(sample[c]).trim());
      console.log(`  [top]  ${name}.${field}: ${count} docs${hasCanonical ? ' ✅ canonical found' : ' ⚠️ NO canonical field'}`);
    }

    // Nested fields
    const nested = NESTED_FIELDS[name];
    if (nested) {
      for (const [fieldPath, canonicalPaths] of Object.entries(nested)) {
        const [arrayName, fieldName] = fieldPath.split('.');
        const count = await coll.countDocuments({ [fieldPath]: { $exists: true, $ne: '' } });
        if (count === 0) continue;
        const sample = await coll.findOne({ [fieldPath]: { $exists: true, $ne: '' } }, { projection: { _id: 1, [`${arrayName}.$`]: 1 } });
        const firstTrack = sample?.[arrayName]?.[0];
        const hasCanonical = firstTrack && canonicalPaths.some(cp => {
          const fn = cp.split('.')[1];
          return firstTrack[fn] && String(firstTrack[fn]).trim();
        });
        console.log(`  [nest] ${name}.${fieldPath}: ${count} docs${hasCanonical ? ' ✅ canonical found' : ' ⚠️ NO canonical field'}`);
      }
    }
  }

  console.log('\n=== Scan complete ===');
}

async function removeUrlFields() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');

  const collections = await db.listCollections().toArray();
  let totalRemoved = 0;

  console.log('\n=== REMOVING URL fields (only where canonical field exists) ===\n');

  for (const { name } of collections) {
    const coll = db.collection(name);

    // --- Remove top-level fields ---
    for (const [field, canonical] of Object.entries(TOP_FIELDS)) {
      const filter = {
        [field]: { $exists: true, $ne: '' },
        $or: canonical.map(c => ({ [c]: { $exists: true, $ne: '' } })),
      };
      const count = await coll.countDocuments(filter);
      if (count === 0) continue;
      if (isWrite) {
        await coll.updateMany(filter, { $unset: { [field]: '' } });
      }
      console.log(`  [top]  ${name}.${field}: ${count} unset${isWrite ? ' ✅' : ' (dry-run)'}`);
      totalRemoved += count;
    }

    // --- Remove nested fields ---
    const nested = NESTED_FIELDS[name];
    if (nested) {
      for (const [fieldPath, canonicalPaths] of Object.entries(nested)) {
        const [arrayName] = fieldPath.split('.');
        const docs = await coll.find({ [fieldPath]: { $exists: true, $ne: '' } }).toArray();
        if (docs.length === 0) continue;

        let removedCount = 0;
        for (const doc of docs) {
          const tracks = doc[arrayName];
          if (!Array.isArray(tracks) || tracks.length === 0) continue;

          let modified = false;
          const updatedTracks = tracks.map((t: Record<string, unknown>) => {
            for (const cp of canonicalPaths) {
              const fn = cp.split('.')[1];
              if (t[fn] && String(t[fn]).trim()) {
                // canonical field exists → safe to unset the URL field
                const urlField = fieldPath.split('.')[1];
                if (t[urlField] && String(t[urlField]).trim()) {
                  modified = true;
                  const copy = { ...t };
                  delete copy[urlField];
                  return copy;
                }
              }
            }
            return t;
          });

          if (modified) {
            if (isWrite) {
              await coll.updateOne({ _id: doc._id }, { $set: { [arrayName]: updatedTracks } });
            }
            removedCount++;
          }
        }

        if (removedCount > 0) {
          console.log(`  [nest] ${name}.${fieldPath}: ${removedCount} docs updated${isWrite ? ' ✅' : ' (dry-run)'}`);
          totalRemoved += removedCount;
        }
      }
    }
  }

  console.log(`\nTotal: ${totalRemoved} URL field groups removed${isWrite ? '' : ' (dry-run — run with --write to apply)'}`);
}

async function verify() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');

  const collections = await db.listCollections().toArray();
  let remaining = 0;

  console.log('\n=== VERIFY: Remaining URL fields ===\n');

  for (const { name } of collections) {
    const coll = db.collection(name);

    for (const [field] of Object.entries(TOP_FIELDS)) {
      const count = await coll.countDocuments({ [field]: { $exists: true, $ne: '' } });
      if (count > 0) {
        console.log(`  [top]  ${name}.${field}: ${count} ⚠️`);
        remaining++;
      }
    }

    const nested = NESTED_FIELDS[name];
    if (nested) {
      for (const [fieldPath] of Object.entries(nested)) {
        const count = await coll.countDocuments({ [fieldPath]: { $exists: true, $ne: '' } });
        if (count > 0) {
          console.log(`  [nest] ${name}.${fieldPath}: ${count} ⚠️`);
          remaining++;
        }
      }
    }
  }

  if (remaining === 0) {
    console.log('  ✅ No remaining URL fields.');
  } else {
    console.log(`\nTotal remaining: ${remaining} field types.`);
  }
}

(async () => {
  try {
    await connectDB();
    console.log(`Mode: ${isScan ? 'SCAN' : isWrite ? 'WRITE' : 'DRY-RUN'}`);

    if (isScan) {
      await scan();
    } else {
      await removeUrlFields();
      if (!isDryRun) await verify();
    }

    process.exit(0);
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
})();
