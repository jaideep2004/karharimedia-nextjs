/**
 * Manual/cron cleanup script for social-videos folder.
 *
 * Removes release subdirectories and temp files in SOCIAL_VIDEO_DIR
 * older than 1 day (configurable via --max-age-hours).
 *
 * Usage:
 *   npm run social:cleanup
 *   npm run social:cleanup -- --max-age-hours=48
 */
import 'dotenv/config';
import { cleanupExpiredSocialVideos } from '../services/socialVideoCleanup.service';

async function main() {
  const ageArg = process.argv.find((a) => a.startsWith('--max-age-hours='))?.split('=')[1];
  const maxAgeHours = ageArg ? Number(ageArg) : 1;
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    console.error('Invalid --max-age-hours value');
    process.exit(1);
  }

  const result = await cleanupExpiredSocialVideos(maxAgeHours * 60 * 60 * 1000);
  console.log(`Social-videos cleanup complete (older than ${maxAgeHours}h):`);
  console.log(`  removed release dirs : ${result.removedDirs}`);
  console.log(`  removed temp files   : ${result.removedFiles}`);
  console.log(`  kept (recent)        : ${result.skippedActive}`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
