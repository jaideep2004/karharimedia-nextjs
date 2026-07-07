import { NextResponse } from 'next/server';
import { fetchBackend } from '@/app/api/_lib/backend';
import { connectToDatabase } from '@/utils/mongodb';
import { releasesCollection } from '@/lib/repositories/releases';
import { tracksCollection } from '@/lib/repositories/tracks';

export async function GET() {
  try {
    const [result, localStats] = await Promise.all([
      fetchBackend('/api/users/stats').catch(() => ({ ok: false, status: 200, data: null })),
      getLocalCatalogStats(),
    ]);
    const data = result.data as {
      data?: {
        totalUsers?: number;
        totalTracks?: number;
        pendingTracks?: number;
        pendingPayouts?: number;
        totalRevenue?: number;
        totalReleases?: number;
        pendingReleases?: number;
      };
    } | null;
    const stats = data?.data;

    return NextResponse.json({
      success: true,
      data: {
        totalUsers: stats?.totalUsers || 0,
        totalTracks: localStats.totalTracks,
        pendingTracks: stats?.pendingTracks || 0,
        pendingPayouts: stats?.pendingPayouts || 0,
        totalRevenue: stats?.totalRevenue || 0,
        totalReleases: localStats.totalReleases || stats?.totalReleases || 0,
        pendingReleases: localStats.pendingReleases || stats?.pendingReleases || 0,
        releaseCounts: localStats.releaseCounts,
        releaseTypeCounts: localStats.releaseTypeCounts,
        bromaSync: localStats.bromaSync,
      }
    }, { status: result.ok ? result.status : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch stats from backend';
    return NextResponse.json({
      success: false,
      message,
      data: {
        totalUsers: 0,
        totalTracks: 0,
        pendingTracks: 0,
        pendingPayouts: 0,
        totalRevenue: 0,
        totalReleases: 0,
        pendingReleases: 0
      }
    }, { status: 500 });
  }
}

async function getLocalCatalogStats() {
  const { db } = await connectToDatabase();
  const bromaSync = await fetchBackend(
    '/api/dsp/broma/release-statuses/sync',
    {
      method: 'POST',
      body: JSON.stringify({ limit: 300 }),
    }
  ).catch(() => null);
  const [releaseStats, canonicalTracks] = await Promise.all([
    releasesCollection(db)
      .aggregate<{
        _id: null;
        totalReleases: number;
        totalTracks: number;
        pendingReleases: number;
        approvedReleases: number;
        rejectedReleases: number;
        processingReleases: number;
      }>([
        {
          $group: {
            _id: null,
            totalReleases: { $sum: 1 },
            totalTracks: {
              $sum: {
                $cond: [{ $isArray: '$tracks' }, { $size: '$tracks' }, 0],
              },
            },
            pendingReleases: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$status', 'pending'] },
                      { $eq: ['$status', 'pending_review'] },
                      { $eq: ['$status', null] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            approvedReleases: {
              $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
            },
            rejectedReleases: {
              $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
            },
            processingReleases: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['uploading_to_broma', 'broma_moderation', 'dsp_processing']] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray(),
    tracksCollection(db).countDocuments({ deletedAt: { $exists: false }, source: 'release_embed' }),
  ]);
  const stats = releaseStats[0] || {
    totalReleases: 0,
    totalTracks: 0,
    pendingReleases: 0,
    approvedReleases: 0,
    rejectedReleases: 0,
    processingReleases: 0,
  };
  const releaseTypeCounts = await releasesCollection(db)
    .aggregate<{ _id: { status: string; type: string }; count: number }>([
      {
        $match: {
          status: { $in: ['approved', 'rejected', 'uploading_to_broma', 'broma_moderation', 'dsp_processing'] },
        },
      },
      {
        $group: {
          _id: {
            status: '$status',
            type: { $toLower: { $ifNull: ['$releaseType', { $ifNull: ['$metadata.releaseType', 'unknown'] }] } },
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();
  return {
    totalReleases: Number(stats.totalReleases || 0),
    totalTracks: Math.max(Number(stats.totalTracks || 0), Number(canonicalTracks || 0)),
    pendingReleases: Number(stats.pendingReleases || 0),
    releaseCounts: {
      all: Number(stats.totalReleases || 0),
      pending: Number(stats.pendingReleases || 0),
      in_process: Number(stats.processingReleases || 0),
      approved: Number(stats.approvedReleases || 0),
      rejected: Number(stats.rejectedReleases || 0),
      shipped: Number(stats.approvedReleases || 0),
      other: 0,
    },
    releaseTypeCounts: releaseTypeCounts.map((row) => ({
      status: row._id.status,
      type: row._id.type || 'unknown',
      count: row.count,
    })),
    bromaSync: bromaSync?.data || null,
  };
}
