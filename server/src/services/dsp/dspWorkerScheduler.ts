import fs from 'fs/promises';
import path from 'path';
import { dspDeliveryService } from './dspDelivery.service';
import { SOCIAL_VIDEO_DIR } from '../../config/constants';
import { cleanupExpiredSocialVideos } from '../socialVideoCleanup.service';

const isEnabled = () =>
  String(process.env.ENABLE_DSP_WORKER_SCHEDULER || '').toLowerCase() === 'true';

const intervalMs = () => {
  const value = Number(process.env.DSP_WORKER_INTERVAL_MS || 60_000);
  return Number.isFinite(value) ? Math.max(15_000, value) : 60_000;
};

const maxJobs = () => {
  const value = Number(process.env.DSP_WORKER_MAX_JOBS || 25);
  return Number.isFinite(value) ? Math.min(50, Math.max(1, value)) : 25;
};

const STALE_FILE_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // every 30 min

let timer: NodeJS.Timeout | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;
let running = false;

async function cleanStaleTempFiles() {
  try {
    // Flat temp files (circle_*.mp4, concat mp3s) — short lifetime
    const files = await fs.readdir(SOCIAL_VIDEO_DIR).catch(() => []);
    const now = Date.now();
    let removed = 0;
    for (const file of files) {
      const filePath = path.join(SOCIAL_VIDEO_DIR, file);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile() && now - stat.mtimeMs > STALE_FILE_AGE_MS) {
          await fs.unlink(filePath);
          removed++;
        }
      } catch { /* skip if can't stat or unlink */ }
    }
    if (removed > 0) console.log(`[cleanup] Removed ${removed} stale temp files from social-videos`);

    // Release subdirectories (videos + assets) — 1 day after last write
    const result = await cleanupExpiredSocialVideos();
    if (result.removedDirs > 0 || result.removedFiles > 0) {
      console.log(`[cleanup] Removed ${result.removedDirs} release dir(s) and ${result.removedFiles} file(s) older than 1 day`);
    }
  } catch { /* non-fatal */ }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await dspDeliveryService.processDueDeliveryJobs({
      maxJobs: maxJobs(),
      workerId: `server-scheduler:${process.pid}`,
      dispatchOnly: true,
    });
    if (result.processed.length > 0) {
      console.log(`[scheduler] Processed ${result.processed.length} jobs, released ${result.expiredLocksReleased} locks`);
    }
  } catch (error) {
    console.error('DSP worker scheduler failed:', error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

export function startDspWorkerScheduler() {
  if (!isEnabled()) {
    console.log('DSP worker scheduler disabled');
    return;
  }
  if (timer) return;

  const delay = intervalMs();
  timer = setInterval(() => {
    void tick();
  }, delay);
  timer.unref?.();
  void tick();

  // Periodic cleanup of stale temp files from social-videos
  void cleanStaleTempFiles();
  cleanupTimer = setInterval(() => { void cleanStaleTempFiles(); }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();

  console.log(`DSP worker scheduler enabled every ${delay}ms`);
}
