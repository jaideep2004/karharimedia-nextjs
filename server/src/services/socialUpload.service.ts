import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs/promises';
import { resolveMedia, generateVideo, generateAlbumVideo, sanitizeFilename } from './videoGeneration.service';
import { SOCIAL_VIDEO_DIR, TRACKS_DIR } from '../config/constants';
import { VisualizerPreset, VisualizerColor, SocialPlatform, SocialVideoConfig } from '../types/socialMedia';
import { dspRegistry } from './dsp/dspRegistry';
import { findTrackById } from '../repositories/track.repository';
import DspProvider from '../models/dspProvider.model';
import { decryptCredentialMap, encryptCredentialMap } from './dsp/dspCredentialVault';
import type { DspConnectorContext } from '../types/dsp';

interface TrackAsset {
  trackId: string;
  title: string;
  artist: string;
  isrc: string;
  audioPath?: string;
  artworkPath?: string;
  videoPath?: string;
  videoProgress?: number;
  uploadBytes?: number;
  uploadTotalBytes?: number;
  uploadPhase?: string;
  status: 'pending' | 'downloading' | 'downloaded' | 'generating' | 'generated' | 'uploading' | 'uploaded' | 'failed';
  error?: string;
  externalId?: string;
  duration?: number;
}

interface BatchProgress {
  sessionId: string;
  platform: SocialPlatform;
  releaseId: string;
  albumMode: boolean;
  preset: VisualizerPreset;
  color?: VisualizerColor;
  visibility: string;
  scheduleAt?: string;
  title: string;
  description: string;
  releaseDir: string;
  tracks: TrackAsset[];
  step: 'downloading' | 'generating' | 'uploading' | 'done' | 'failed';
  overallProgress: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
  targetPageId?: string;
}

const activeBatches = new Map<string, BatchProgress>();
const batchControllers = new Map<string, AbortController>();

export function getBatchProgress(sessionId: string): BatchProgress | undefined {
  const batch = activeBatches.get(sessionId);
  if (batch) batch.overallProgress = calcOverall(batch);
  return batch;
}

export function cancelBatch(sessionId: string): boolean {
  const batch = activeBatches.get(sessionId);
  if (!batch) return false;
  batch.step = 'failed';
  batch.error = 'Cancelled by admin';
  batch.tracks.forEach(t => {
    if (t.status === 'pending' || t.status === 'downloading' || t.status === 'generating' || t.status === 'uploading') {
      t.status = 'failed';
      t.error = 'Cancelled by admin';
    }
  });
  const ctrl = batchControllers.get(sessionId);
  if (ctrl) {
    ctrl.abort();
    batchControllers.delete(sessionId);
  }
  return true;
}

function updateProgress(sessionId: string, update: Partial<BatchProgress>) {
  const batch = activeBatches.get(sessionId);
  if (batch) {
    Object.assign(batch, update, { updatedAt: Date.now() });
    batch.overallProgress = calcOverall(batch);
  }
}

function calcOverall(batch: BatchProgress): number {
  const total = batch.tracks.length;
  if (total === 0) return 100;
  if (batch.step === 'done') return 100;
  if (batch.step === 'failed') {
    // Preserve last-known progress instead of jumping to 0 — avoids confusing UX
    return batch.overallProgress || 0;
  }

  const stepWeight: Record<string, [number, number]> = {
    downloading: [0, 25],
    generating: [25, 65],
    uploading: [65, 95],
  };

  const [lo, hi] = stepWeight[batch.step] || [0, 0];

  if (batch.step === 'generating') {
    let totalProgress = 0;
    for (const t of batch.tracks) {
      if (t.status === 'generated' || t.status === 'uploading' || t.status === 'uploaded' || t.status === 'failed') {
        totalProgress += 1;
      } else if (t.status === 'generating' && t.videoProgress != null) {
        totalProgress += t.videoProgress / 100;
      }
    }
    return Math.round(lo + (totalProgress / total) * (hi - lo));
  }

  if (batch.step === 'uploading') {
    let upProgress = 0;
    for (const t of batch.tracks) {
      if (t.status === 'uploaded' || t.status === 'failed') {
        upProgress += 1;
      } else if (t.status === 'uploading') {
        // Use actual upload byte progress from the connector if available
        upProgress += t.videoProgress != null ? t.videoProgress / 100 : 0.5;
      } else if (t.status === 'generated') {
        upProgress += 0.3;
      }
    }
    return Math.round(lo + (upProgress / total) * (hi - lo));
  }

  const done = batch.tracks.filter(t => {
    switch (batch.step) {
      case 'downloading': return t.status !== 'pending';
      default: return false;
    }
  }).length;

  const pct = total > 0 ? done / total : 0;
  return Math.round(lo + pct * (hi - lo));
}

export async function startSocialUpload(input: {
  releaseId: string;
  tracks: Array<{ trackId: string; title: string; artist: string; isrc: string; audioFile?: string; artwork?: string }>;
  platform: SocialPlatform;
  config: SocialVideoConfig;
}): Promise<{ sessionId: string }> {
  const sessionId = uuidv4();
  const now = Date.now();
  const safeReleaseTitle = sanitizeFilename(input.config.title || input.releaseId || 'release', 60);
  const releaseDir = path.join(SOCIAL_VIDEO_DIR, `${input.releaseId}_${safeReleaseTitle}`);

  const batch: BatchProgress = {
    sessionId,
    platform: input.platform,
    releaseId: input.releaseId,
    albumMode: input.config.albumMode === 'album',
    preset: input.config.preset || 'bars',
    color: input.config.color,
    visibility: input.config.visibility || 'public',
    scheduleAt: input.config.scheduleAt?.toISOString?.() || input.config.scheduleAt as string | undefined,
    title: input.config.title,
    description: input.config.description,
    releaseDir,
    targetPageId: input.config.targetPageId,
    tracks: input.tracks.map(t => ({
      trackId: t.trackId,
      title: t.title,
      artist: t.artist,
      isrc: t.isrc,
      status: 'pending' as const,
    })),
    step: 'downloading',
    overallProgress: 0,
    startedAt: now,
    updatedAt: now,
  };

  activeBatches.set(sessionId, batch);
  batchControllers.set(sessionId, new AbortController());

  // Process asynchronously
  processBatch(sessionId).catch(err => {
    updateProgress(sessionId, { step: 'failed', error: err instanceof Error ? err.message : String(err) });
  });

  return { sessionId };
}

async function processBatch(sessionId: string): Promise<void> {
  const batch = activeBatches.get(sessionId);
  if (!batch) return;
  const ctrl = batchControllers.get(sessionId);

  const tag = `[social:${sessionId.slice(0, 8)}]`;
  console.log(`${tag} Starting batch: ${batch.tracks.length} tracks, platform=${batch.platform}, albumMode=${batch.albumMode}, dir=${batch.releaseDir}`);

  try {
    // Step 1: Download assets to release dir
    console.log(`${tag} Step 1/3: Downloading assets...`);
    await downloadAssets(batch);
    if (ctrl?.signal.aborted) { console.log(`${tag} Cancelled after download`); return; }
    console.log(`${tag} Step 1/3: Assets downloaded`);

    // Step 2: Generate videos
    if (batch.albumMode) {
      console.log(`${tag} Step 2/3: Generating album video...`);
      await generateAlbum(batch, ctrl?.signal);
      if (ctrl?.signal.aborted) { console.log(`${tag} Cancelled during album generation`); return; }
      console.log(`${tag} Step 2/3: Album video done`);
    } else {
      console.log(`${tag} Step 2/3: Generating individual videos...`);
      await generateAllTracks(batch, ctrl?.signal);
      if (ctrl?.signal.aborted) { console.log(`${tag} Cancelled during track generation`); return; }
      console.log(`${tag} Step 2/3: Individual videos done`);
    }

    // Step 3: Upload all
    console.log(`${tag} Step 3/3: Uploading...`);
    await uploadAll(batch, ctrl?.signal);
    if (ctrl?.signal.aborted) { console.log(`${tag} Cancelled during upload`); return; }
    console.log(`${tag} Step 3/3: Upload done`);

    // Persist YouTube video IDs to tracks
    for (const track of batch.tracks) {
      if (track.status === 'uploaded' && track.externalId) {
        try {
          await mongoose.model('Track').updateOne(
            { _id: track.trackId },
            {
              $push: {
                socialDeliveries: {
                  platform: batch.platform,
                  externalId: track.externalId,
                  videoUrl: batch.platform === 'facebook'
                    ? `https://www.facebook.com/watch/?v=${track.externalId}`
                    : `https://youtu.be/${track.externalId}`,
                  uploadedAt: new Date(),
                }
              }
            }
          );
        } catch (dbErr) {
          console.error(`${tag} Failed to persist social delivery for track ${track.trackId}:`, dbErr);
        }
      }
    }

    const uploadedCount = batch.tracks.filter(t => t.status === 'uploaded').length;
    if (uploadedCount === 0) {
      const errors = batch.tracks.map(t => t.error || 'unknown error').filter(Boolean).join('; ');
      throw new Error(`No tracks were uploaded: ${errors}`);
    }

    // Cleanup: remove release dir after 1 hour (R2 video cache is the source of truth)
    console.log(`${tag} Cleanup: scheduling removal of ${batch.releaseDir} in 1h`);
    setTimeout(() => {
      fs.rm(batch.releaseDir, { recursive: true, force: true }).catch(() => {});
    }, 60 * 60 * 1000).unref();

    updateProgress(sessionId, { step: 'done', overallProgress: 100 });
    console.log(`${tag} Batch complete — ${uploadedCount} track(s) uploaded`);
  } catch (err) {
    const ctrl = batchControllers.get(sessionId);
    if (ctrl?.signal.aborted) {
      console.log(`${tag} Batch cancelled`);
      updateProgress(sessionId, { step: 'failed', error: 'Cancelled by admin' });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${tag} Batch failed: ${msg}`);
    updateProgress(sessionId, { step: 'failed', error: msg });
  } finally {
    batchControllers.delete(sessionId);
  }
}

async function downloadAssets(batch: BatchProgress): Promise<void> {
  updateProgress(batch.sessionId, { step: 'downloading' });

  await fs.mkdir(batch.releaseDir, { recursive: true });

  const results = await Promise.allSettled(
    batch.tracks.map(async (track) => {
      track.status = 'downloading';
      const trackDoc = await findTrackById(track.trackId);
      if (!trackDoc) {
        track.status = 'failed';
        track.error = 'Track not found';
        return;
      }
      const td = trackDoc as any;
      const audioFile = td.audioFile || td.audioUrl || td.fileUrl || '';
      let artwork = td.artwork || td.artworkFile || td.artworkUrl || '';

      if (!artwork) {
        const releaseId = td.releaseId || td.release_id || td.albumId || td.album_id;
        if (releaseId) {
          try {
            const oid = typeof releaseId === 'string' ? new mongoose.Types.ObjectId(releaseId) : releaseId;
            const release = await mongoose.connection.collection('releases').findOne(
              { _id: oid },
              { projection: { artwork: 1, artworkFile: 1, artworkUrl: 1, coverArt: 1 } }
            );
            artwork = release?.artwork || release?.artworkFile || release?.artworkUrl || release?.coverArt || '';
          } catch { /* ignore */ }
        }
      }

      const [tempAudioPath, tempArtworkPath] = await Promise.all([
        resolveMedia(audioFile, 'tracks'),
        resolveMedia(artwork, 'artwork'),
      ]);

      if (!tempAudioPath) {
        track.status = 'failed';
        track.error = `Could not resolve audio file (audioFile="${audioFile || '(empty)'}")`;
        return;
      }

      const safeTrack = sanitizeFilename(track.title || track.trackId, 50);
      const audioExt = path.extname(tempAudioPath) || '.wav';
      const audioDest = path.join(batch.releaseDir, `${safeTrack}${audioExt}`);
      await fs.rename(tempAudioPath, audioDest).catch(() => fs.copyFile(tempAudioPath, audioDest).then(() => fs.unlink(tempAudioPath)));
      track.audioPath = audioDest;

      if (tempArtworkPath) {
        const artExt = path.extname(tempArtworkPath) || '.jpg';
        const artDest = path.join(batch.releaseDir, `artwork${artExt}`);
        await fs.rename(tempArtworkPath, artDest).catch(() => fs.copyFile(tempArtworkPath, artDest).then(() => fs.unlink(tempArtworkPath)));
        track.artworkPath = artDest;
      }

      track.status = 'downloaded';
    })
  );

  for (const r of results) {
    if (r.status === 'rejected') {
      const idx = results.indexOf(r);
      const track = batch.tracks[idx];
      if (track && track.status !== 'failed') {
        track.status = 'failed';
        track.error = r.reason instanceof Error ? r.reason.message : 'Download rejected';
      }
    }
  }
}

async function refreshSocialToken(platform: string, credentials: Record<string, any>): Promise<Record<string, any>> {
  const refreshToken = credentials.refreshToken;
  const tokenExpiresAt = Number(credentials.tokenExpiresAt || 0);

  if (!refreshToken) return credentials;
  if (tokenExpiresAt && Date.now() < tokenExpiresAt) return credentials;

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return credentials;

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: String(refreshToken),
        grant_type: 'refresh_token',
      }),
    });
    if (response.ok) {
      const newTokens = await response.json();
      credentials.accessToken = newTokens.access_token;
      credentials.tokenExpiresAt = String(Date.now() + Number(newTokens.expires_in || 3600) * 1000);
      if (newTokens.refresh_token) credentials.refreshToken = newTokens.refresh_token;
      await DspProvider.updateOne(
        { key: platform },
        { $set: { credentials: encryptCredentialMap({ ...credentials }) } }
      );
    }
  } catch { /* non-fatal — try with existing token */ }

  return credentials;
}

async function generateAlbum(batch: BatchProgress, signal?: AbortSignal): Promise<void> {
  updateProgress(batch.sessionId, { step: 'generating' });

  const audioPaths = batch.tracks
    .filter(t => t.audioPath)
    .map(t => t.audioPath!);

  if (audioPaths.length === 0) {
    const errors = batch.tracks.map(t => t.error || 'unknown').filter(Boolean).join('; ');
    throw new Error(`No audio files available for album video: ${errors}`);
  }

  const firstTrack = batch.tracks[0];
  const albumArtwork = firstTrack?.artworkPath;
  const albumTitle = batch.title || batch.tracks.map(t => t.title).join(', ');

  // Check if album video already exists from a previous attempt
  if (firstTrack?.videoPath) {
    try {
      await fs.access(firstTrack.videoPath);
      const stat = await fs.stat(firstTrack.videoPath);
      if (stat.size > 0) {
        console.log(`${batch.sessionId.slice(0, 8)}] Reusing existing album video`);
        firstTrack.status = 'generated';
        batch.tracks.slice(1).forEach(t => { t.status = 'generated'; });
        return;
      }
    } catch { /* doesn't exist, generate */ }
  }

  const { localPath, duration } = await generateAlbumVideo(
    audioPaths,
    albumArtwork,
    albumTitle,
    batch.tracks[0]?.artist || '',
    batch.preset,
    batch.color,
    batch.releaseId,
    { outputDir: batch.releaseDir, keepLocal: true },
    (pct: number) => { if (firstTrack) firstTrack.videoProgress = pct; },
    signal
  );

  const albumTrack = batch.tracks[0];
  if (albumTrack) {
    albumTrack.videoPath = localPath;
    albumTrack.duration = duration;
    albumTrack.status = 'generated';
  }
  batch.tracks.slice(1).forEach(t => { t.status = 'generated'; });
}

async function generateAllTracks(batch: BatchProgress, signal?: AbortSignal): Promise<void> {
  updateProgress(batch.sessionId, { step: 'generating' });

  const tag = `[social:${batch.sessionId.slice(0, 8)}]`;

  console.log(`${tag} Generating ${batch.tracks.length} videos...`);
  const results = await Promise.allSettled(
    batch.tracks.map(async (track) => {
      if (!track.audioPath) {
        track.status = 'failed';
        track.error = track.error || 'No audio file';
        return;
      }

      const safeName = sanitizeFilename(`${track.trackId}_${track.title}` || track.trackId || 'track');
      const outputPath = path.join(batch.releaseDir, `${safeName}.mp4`);

      // Check if video already exists from a previous attempt
      try {
        await fs.access(outputPath);
        const stat = await fs.stat(outputPath);
        if (stat.size > 0) {
          console.log(`${tag}  Reusing existing video for "${track.title}"`);
          track.videoPath = outputPath;
          track.status = 'generated';
          return;
        }
      } catch { /* file doesn't exist, generate it */ }

      track.status = 'generating';
      console.log(`${tag}  ffmpeg for "${track.title}"`);

      const { duration } = await generateVideo({
        audioPath: track.audioPath,
        artworkPath: track.artworkPath,
        title: track.title,
        artist: track.artist,
        preset: batch.preset,
        color: batch.color,
        outputPath,
        hasArtwork: !!track.artworkPath,
        onProgress: (pct) => { track.videoProgress = pct; },
        signal,
      });

      track.videoPath = outputPath;
      track.duration = duration;
      track.status = 'generated';
      console.log(`${tag}  ffmpeg done for "${track.title}" (${(duration || 0).toFixed(1)}s)`);
    })
  );

  for (const [index, r] of results.entries()) {
    if (r.status === 'rejected') {
      const track = batch.tracks[index];
      if (track) {
        track.status = 'failed';
        track.error = r.reason instanceof Error ? r.reason.message : 'Video generation failed';
        console.error(`${tag}  FAILED "${track.title}": ${track.error}`);
      }
    }
  }
}

async function uploadAll(batch: BatchProgress, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  updateProgress(batch.sessionId, { step: 'uploading' });

  const connector = dspRegistry.get(batch.platform);
  const providerRec = await DspProvider.findOne({ key: batch.platform }).select('+credentials +credentialEnvelopeVersion');
  if (!providerRec) throw new Error(`${batch.platform} provider not found`);

  const tag = `[social:${batch.sessionId.slice(0, 8)}]`;

  if (batch.albumMode) {
    if (signal?.aborted) return;
    // Upload single combined video
    const albumTrack = batch.tracks[0];
    if (!albumTrack?.videoPath) {
      throw new Error('No generated album video to upload');
    }

    const creds = await refreshSocialToken(batch.platform, decryptCredentialMap((providerRec as any).credentials || {}));
    const albumUploadProgress = (pct: number, bytes?: number, total?: number) => {
      batch.tracks.forEach(t => { t.videoProgress = pct; t.uploadBytes = bytes; t.uploadTotalBytes = total; });
    };
    const fbPages = batch.platform === 'facebook' ? ((providerRec as any).config?.connectedPages || []) : [];
    const ctx: DspConnectorContext = {
      providerKey: batch.platform,
      credentials: creds,
      config: {
        ...(batch.scheduleAt ? { scheduleAt: batch.scheduleAt } : {}),
        visibility: batch.visibility,
        videoLocalPath: albumTrack.videoPath,
        ...(batch.targetPageId ? { targetPageId: batch.targetPageId } : {}),
        ...(fbPages.length ? { connectedPages: fbPages } : {}),
      },
      region: (providerRec as any).region || '',
      operation: 'deliver',
      jobId: batch.sessionId,
      onProgress: albumUploadProgress,
      signal,
    };

    const fallbackArtist = batch.tracks[0]?.artist || 'Unknown Artist';
    const payload = {
      releaseId: batch.releaseId,
      releaseTitle: batch.title,
      primaryArtist: fallbackArtist,
      tracks: batch.tracks.map(t => ({
        trackId: t.trackId,
        title: t.title,
        artistName: t.artist || fallbackArtist,
        isrc: t.isrc,
        audioFile: t.audioPath || '',
        artwork: t.artworkPath || '',
      })),
    };

    const result = await connector.deliver(payload as any, ctx);
    if (result.state === 'failed') {
      batch.tracks.forEach(t => { t.status = 'failed'; t.error = result.message || `${batch.platform} rejected`; });
    } else {
      batch.tracks.forEach(t => { t.externalId = result.externalId; t.status = 'uploaded'; });
    }
    if (signal?.aborted) {
      throw new Error('Upload cancelled');
    }
    return;
  }

  // Individual tracks — upload all generated tracks in parallel
  const providerRecPlain = providerRec.toObject();
  const providerCreds = await refreshSocialToken(batch.platform, decryptCredentialMap((providerRecPlain as any).credentials || {}));

  const ready = batch.tracks.filter(t => t.status === 'generated' && t.videoPath);
  console.log(`${tag} Uploading ${ready.length}/${batch.tracks.length} videos to ${batch.platform}...`);
  if (ready.length === 0) {
    const statusMap = batch.tracks.map(t => `${t.title}: status=${t.status} videoPath=${t.videoPath ? 'yes' : 'no'} error=${t.error || 'none'}`);
    console.warn(`${tag} No ready tracks — track states:`, statusMap.join(' | '));
  }

  const fallbackArtist = batch.tracks[0]?.artist || 'Unknown Artist';

  const uploadResults = await Promise.allSettled(
    ready.map(async (track) => {
      if (signal?.aborted) { track.status = 'failed'; track.error = 'Cancelled'; return; }
      track.status = 'uploading';
      console.log(`${tag}  uploading "${track.title}"...`);

      const onUploadProgress = (pct: number, bytes?: number, total?: number) => {
        track.videoProgress = pct;
        if (bytes != null) track.uploadBytes = bytes;
        if (total != null) track.uploadTotalBytes = total;
      };
      const fbPages = batch.platform === 'facebook' ? ((providerRecPlain as any).config?.connectedPages || []) : [];
      const ctx: DspConnectorContext = {
        providerKey: batch.platform,
        credentials: providerCreds,
        config: {
          ...(batch.scheduleAt ? { scheduleAt: batch.scheduleAt } : {}),
          visibility: batch.visibility,
          videoLocalPath: track.videoPath,
          ...(batch.targetPageId ? { targetPageId: batch.targetPageId } : {}),
          ...(fbPages.length ? { connectedPages: fbPages } : {}),
        },
        region: (providerRecPlain as any).region || '',
        operation: 'deliver',
        jobId: `${batch.sessionId}:${track.trackId}`,
        onProgress: onUploadProgress,
        signal,
      };

      try {
        const result = await connector.deliver({
          trackId: track.trackId,
          title: track.title,
          artistName: track.artist || fallbackArtist,
          isrc: track.isrc,
          audioFile: track.audioPath || '',
          artwork: track.artworkPath || '',
        } as any, ctx);

        if (result.state === 'failed') {
          track.status = 'failed';
          track.error = result.message || `${batch.platform} rejected`;
          console.error(`${tag}  FAILED "${track.title}": ${track.error}`);
        } else {
          track.externalId = result.externalId;
          track.videoProgress = 100;
          track.status = 'uploaded';
          // Don't cleanup yet — release dir will be removed in 1 hour
          console.log(`${tag}  uploaded "${track.title}" -> externalId=${result.externalId}`);
        }
      } catch (err) {
        track.status = 'failed';
        track.error = err instanceof Error ? err.message : `${batch.platform} threw`;
        console.error(`${tag}  ERROR "${track.title}": ${track.error}`);
      }
    })
  );

  if (signal?.aborted) {
    throw new Error('Upload cancelled');
  }
}

// Clean up old batches periodically
const CLEANUP_INTERVAL = 30 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, batch] of activeBatches) {
    if (batch.startedAt < cutoff && (batch.step === 'done' || batch.step === 'failed')) {
      activeBatches.delete(id);
    }
  }
}, CLEANUP_INTERVAL).unref();
