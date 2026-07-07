import { Db } from 'mongodb';
import { normalizeMusicPublishingTracks, type PublishingStage } from '@/lib/musicPublishing';
import { listApprovedReleasesForPublishing } from '@/lib/repositories/releases';

export async function listPublishingRows(
  db: Db,
  options: { stage: PublishingStage; query?: string; skip: number; limit: number }
) {
  const releases = await listApprovedReleasesForPublishing(db);
  const query = (options.query || '').trim().toLowerCase();
  const rows = normalizeMusicPublishingTracks(releases)
    .filter((row) => row.publishingStatus === options.stage)
    .filter((row) => {
      if (!query) return true;
      return Object.values(row).some((value) =>
        String(value || '').toLowerCase().includes(query)
      );
    });

  return {
    rows: rows.slice(options.skip, options.skip + options.limit),
    total: rows.length,
  };
}
