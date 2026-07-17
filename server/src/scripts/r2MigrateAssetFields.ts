import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/db';

dotenv.config();

const args = process.argv.slice(2);
const isWrite = args.includes('--write');
const isVerify = args.includes('--verify');
const isDryRun = !isWrite && !isVerify;

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

interface MigrationResult {
  releasesUpdated: number;
  tracksUpdated: number;
  usersUpdated: number;
}

async function migrate(): Promise<MigrationResult> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');

  const result: MigrationResult = { releasesUpdated: 0, tracksUpdated: 0, usersUpdated: 0 };

  // 1. Migrate releases — backfill artwork field from artworkUrl
  const releasesColl = db.collection('releases');
  const releaseDocs = await releasesColl.find({
    $or: [
      { artwork: { $exists: false } },
      { storageProvider: { $exists: false } },
    ],
  }).toArray();

  for (const doc of releaseDocs) {
    const setFields: Record<string, unknown> = {};

    if (!doc.artwork) {
      const filename = extractFilename(doc.artworkUrl) || extractFilename(doc.artworkFile)
        || extractFilename(doc.coverUrl) || extractFilename(doc.coverArt);
      if (filename) {
        setFields.artwork = filename;
        if (!doc.artworkFile) setFields.artworkFile = filename;
      }
    }

    if (!doc.storageProvider) {
      setFields.storageProvider = 'r2';
    }

    if (Object.keys(setFields).length > 0) {
      if (isWrite) {
        await releasesColl.updateOne(
          { _id: doc._id },
          { $set: setFields }
        );
      }
      console.log(`[releases] ${doc._id}: ${JSON.stringify(setFields)}`);
      result.releasesUpdated++;
    }
  }

  // 2. Migrate releases — backfill audioFile in embedded tracks
  const releasesWithTracks = await releasesColl.find({
    tracks: { $exists: true, $ne: [] },
  }).toArray();

  for (const doc of releasesWithTracks) {
    let trackUpdate = false;
    const updatedTracks = (doc.tracks || []).map((t: Record<string, unknown>) => {
      if (t.audioFile) return t;
      const filename = extractFilename(t.audioUrl);
      if (filename) {
        trackUpdate = true;
        return { ...t, audioFile: filename };
      }
      return t;
    });

    if (trackUpdate) {
      if (isWrite) {
        await releasesColl.updateOne(
          { _id: doc._id },
          { $set: { tracks: updatedTracks } }
        );
      }
      console.log(`[releases.tracks] ${doc._id}: backfilled audioFile`);
      result.releasesUpdated++;
    }
  }

  // 3. Migrate standalone tracks — backfill audioFile from audioUrl using raw DB
  const tracksColl = db.collection('tracks');
  const trackDocs = await tracksColl.find({
    $or: [
      { audioFile: { $exists: false } },
      { storageProvider: { $exists: false } },
    ],
  }).toArray();

  for (const doc of trackDocs) {
    const setFields: Record<string, unknown> = {};

    if (!doc.audioFile) {
      const filename = extractFilename(doc.audioUrl);
      if (filename) setFields.audioFile = filename;
    }

    if (!doc.storageProvider) {
      setFields.storageProvider = 'r2';
    }

    if (Object.keys(setFields).length > 0) {
      if (isWrite) {
        await tracksColl.updateOne({ _id: doc._id }, { $set: setFields });
      }
      console.log(`[tracks] ${doc._id}: ${JSON.stringify(setFields)}`);
      result.tracksUpdated++;
    }
  }

  // 4. Migrate users — backfill profilePictureFile from profilePicture
  const usersColl = db.collection('users');
  const userDocs = await usersColl.find({
    profilePicture: { $ne: '', $exists: true },
    profilePictureFile: { $exists: false },
  }).toArray();

  for (const doc of userDocs) {
    const filename = extractFilename(doc.profilePicture);
    if (filename) {
      if (isWrite) {
        await usersColl.updateOne(
          { _id: doc._id },
          { $set: { profilePictureFile: filename, storageProvider: doc.storageProvider || 'r2' } }
        );
      }
      console.log(`[users] ${doc._id}: profilePictureFile=${filename}`);
      result.usersUpdated++;
    }
  }

  return result;
}

async function verify(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');

  const releasesColl = db.collection('releases');
  const tracksColl = db.collection('tracks');
  const usersColl = db.collection('users');

  const releasesWithoutArtwork = await releasesColl.countDocuments({
    $or: [
      { artwork: { $in: ['', null] } },
      { artwork: { $exists: false } },
    ],
    artworkUrl: { $ne: '', $exists: true },
  });
  console.log(`Releases with artworkUrl but NO artwork field: ${releasesWithoutArtwork}`);

  const releasesWithoutProvider = await releasesColl.countDocuments({
    storageProvider: { $exists: false },
  });
  console.log(`Releases without storageProvider: ${releasesWithoutProvider}`);

  const tracksWithoutAudioFile = await tracksColl.countDocuments({
    audioFile: { $in: ['', null] },
    audioUrl: { $ne: '', $exists: true },
  });
  console.log(`Tracks with audioUrl but NO audioFile: ${tracksWithoutAudioFile}`);

  const usersMissingPictureFile = await usersColl.countDocuments({
    profilePicture: { $ne: '', $exists: true },
    profilePictureFile: { $exists: false },
  });
  console.log(`Users with profilePicture but NO profilePictureFile: ${usersMissingPictureFile}`);

  const allReleases = await releasesColl.countDocuments();
  const allTracks = await tracksColl.countDocuments();
  const allUsers = await usersColl.countDocuments();
  console.log(`\nTotal: releases=${allReleases}, tracks=${allTracks}, users=${allUsers}`);
}

(async () => {
  try {
    await connectDB();
    console.log(`Mode: ${isVerify ? 'VERIFY' : isWrite ? 'WRITE' : 'DRY-RUN'}\n`);

    if (isVerify) {
      await verify();
    } else {
      const result = await migrate();
      console.log(`\nSummary:`);
      console.log(`  Releases: ${result.releasesUpdated} updated`);
      console.log(`  Tracks:   ${result.tracksUpdated} updated`);
      console.log(`  Users:    ${result.usersUpdated} updated`);
      if (isDryRun) {
        console.log(`\n⚠️  DRY-RUN — no changes written. Run with --write to apply.`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
})();
