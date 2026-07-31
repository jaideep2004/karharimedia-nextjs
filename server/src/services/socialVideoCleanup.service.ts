import fs from 'fs/promises';
import path from 'path';
import { SOCIAL_VIDEO_DIR } from '../config/constants';

const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export interface SocialCleanupResult {
  removedDirs: number;
  removedFiles: number;
  skippedActive: number;
}

/**
 * Removes release subdirectories and flat temp files in SOCIAL_VIDEO_DIR
 * whose mtime is older than maxAgeMs.
 *
 * Safe against in-flight batches: any entry touched within maxAgeMs is kept.
 * Returns counts for logging.
 */
export async function cleanupExpiredSocialVideos(maxAgeMs: number = DEFAULT_MAX_AGE_MS): Promise<SocialCleanupResult> {
  const result: SocialCleanupResult = { removedDirs: 0, removedFiles: 0, skippedActive: 0 };
  const entries = await fs.readdir(SOCIAL_VIDEO_DIR).catch(() => []);
  const now = Date.now();

  for (const entry of entries) {
    const entryPath = path.join(SOCIAL_VIDEO_DIR, entry);
    try {
      const stat = await fs.stat(entryPath);
      if (now - stat.mtimeMs < maxAgeMs) {
        result.skippedActive++;
        continue; // still fresh — an active or recently-finished batch
      }
      if (stat.isDirectory()) {
        await fs.rm(entryPath, { recursive: true, force: true });
        result.removedDirs++;
      } else {
        await fs.unlink(entryPath);
        result.removedFiles++;
      }
    } catch {
      // skip entries that disappear mid-scan
    }
  }

  return result;
}
