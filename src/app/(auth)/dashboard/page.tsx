'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Box,
  Typography,
  Button,
  Alert,
  useTheme,
  Avatar,
  IconButton,
  Skeleton,
  LinearProgress,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  MusicNote as MusicNoteIcon,
  Album as AlbumIcon,
  CheckCircle as CheckCircleIcon,
  PendingActions as PendingActionsIcon,
  CloudUpload as CloudUploadIcon,
  TrendingUp,
  ArrowForward,
  Sync as SyncIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useAuth } from '@/context/AppContext';
import { trackAPI, releaseAPI } from '@/services/api';
import AuthGuard from '@/components/AuthGuard';
import { PremiumHeader } from '@/components/premium/PremiumSurface';
import { getNormalizedReleaseStatus, getReleaseStatusLabel } from '@/lib/releaseStatus';

// Types
interface Track {
  _id: string;
  title: string;
  genre: string;
  releaseDate: string;
  audioUrl: string;
  artworkUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  acrCloud?: {
    fileId?: string;
    state?: string;
    scanState?: string;
    lastError?: string;
    checkedAt?: string;
  };
  createdAt: string;
}

export default function ArtistDashboard() {
  return (
    <AuthGuard>
      <DashboardPage />
    </AuthGuard>
  );
}

function DashboardPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const auth = useAuth();
  const { user } = auth || { user: null };

  const [tracks, setTracks] = useState<Track[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [releaseCounts, setReleaseCounts] = useState({
    all: 0,
    pending: 0,
    in_process: 0,
    approved: 0,
    rejected: 0,
    other: 0,
  });
  const [totalTracks, setTotalTracks] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [releaseLoading, setReleaseLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [tracksRes, releasesRes] = await Promise.all([
          trackAPI.getTracks({ page: 1, limit: 6 }),
          releaseAPI.getReleases({ summary: '1', page: 1, limit: 5 }),
        ]);
        if (tracksRes?.success) {
          setTracks(Array.isArray(tracksRes.data) ? tracksRes.data : []);
          setTotalTracks(Number(tracksRes.pagination?.total ?? tracksRes.data.length ?? 0));
        }
        if (releasesRes?.success) {
          setReleases(Array.isArray(releasesRes.data) ? releasesRes.data : []);
          if (releasesRes.counts) {
            setReleaseCounts({
              all: Number(releasesRes.counts.all || 0),
              pending: Number(releasesRes.counts.pending || 0),
              in_process: Number(releasesRes.counts.in_process || 0),
              approved: Number(releasesRes.counts.approved || 0),
              rejected: Number(releasesRes.counts.rejected || 0),
              other: Number(releasesRes.counts.other || 0),
            });
          }
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        setError('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
        setReleaseLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    return () => { audioElement?.pause(); };
  }, [audioElement]);

  const handlePlayPause = (trackId: string, audioUrl: string) => {
    if (currentlyPlaying === trackId) {
      audioElement?.pause();
      setCurrentlyPlaying(null);
    } else {
      audioElement?.pause();
      const audio = new Audio(audioUrl);
      audio.play();
      audio.addEventListener('ended', () => setCurrentlyPlaying(null));
      setAudioElement(audio);
      setCurrentlyPlaying(trackId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const safeReleases = Array.isArray(releases) ? releases : [];
  const getReleaseTrackCount = (release: any) =>
    Number(release?.trackCount ?? (Array.isArray(release?.tracks) ? release.tracks.length : 0));

  const totalReleases = releaseCounts.all || safeReleases.length;
  const approvedReleases = releaseCounts.approved;
  const inProcessReleases = releaseCounts.in_process;
  const pendingReleases = releaseCounts.pending;
  const rejectedReleases = releaseCounts.rejected;

  const recentReleases = safeReleases.slice(0, 5);
  const recentTracks = safeTracks.slice(0, 6);

  // KPI metrics
  const metrics = [
    {
      label: 'Total Releases',
      value: totalReleases,
      icon: <AlbumIcon />,
      color: '#f59e0b',
      bgColor: isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)',
    },
    {
      label: 'Total Tracks',
      value: totalTracks,
      icon: <MusicNoteIcon />,
      color: '#00e7ff',
      bgColor: isDark ? 'rgba(0, 231, 255, 0.12)' : 'rgba(0, 231, 255, 0.08)',
    },
    {
      label: 'In Process',
      value: inProcessReleases,
      icon: <SyncIcon />,
      color: '#0ea5e9',
      bgColor: isDark ? 'rgba(14, 165, 233, 0.12)' : 'rgba(14, 165, 233, 0.08)',
    },
    {
      label: 'Approved',
      value: approvedReleases,
      icon: <CheckCircleIcon />,
      color: '#10b981',
      bgColor: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)',
    },
    {
      label: 'Pending Review',
      value: pendingReleases,
      icon: <PendingActionsIcon />,
      color: '#f59e0b',
      bgColor: isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)',
    },
    {
      label: 'Rejected',
      value: rejectedReleases,
      icon: <ErrorIcon />,
      color: '#ef4444',
      bgColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)',
    },
  ];

  const getStatusChip = (status: string) => {
    const map: Record<string, { color: string; bg: string }> = {
      approved: { color: '#10b981', bg: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)' },
      in_process: { color: '#0ea5e9', bg: isDark ? 'rgba(14,165,233,0.14)' : 'rgba(14,165,233,0.09)' },
      pending: { color: '#f59e0b', bg: isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.08)' },
      rejected: { color: '#ef4444', bg: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)' },
    };
    const s = map[getNormalizedReleaseStatus(status)] || map.pending;
    const label = getReleaseStatusLabel(status);
    return (
      <Box
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          px: 1.25, py: 0.35, borderRadius: '6px',
          bgcolor: s.bg, color: s.color,
          fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.02em',
        }}
      >
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: s.color }} />
        {label}
      </Box>
    );
  };

  if (isLoading) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
        <Skeleton variant="text" width={280} height={40} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={200} height={24} sx={{ mb: 4 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(6, 1fr)' }, gap: 2, mb: 4 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} variant="rounded" height={110} sx={{ borderRadius: '14px' }} />
          ))}
        </Box>
        <Skeleton variant="rounded" height={300} sx={{ borderRadius: '14px' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <PremiumHeader
        eyebrow="Artist Command Center"
        title={`Welcome back, ${user?.artistName || user?.name || 'Artist'}`}
        description="Watch your catalog, release pipeline, track health, and next actions from one premium operations view."
      />

      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: '12px' }}>{error}</Alert>}

      {/* KPI Metrics */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(6, 1fr)' },
          gap: 2,
          mb: 4,
        }}
      >
        {metrics.map((metric) => (
          <Box
            key={metric.label}
            sx={{
              p: 2.5,
              borderRadius: '14px',
              bgcolor: isDark ? '#111827' : '#ffffff',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
              transition: 'all 200ms ease',
              '&:hover': {
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)',
                transform: 'translateY(-1px)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: '10px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: metric.bgColor,
                  color: metric.color,
                  '& .MuiSvgIcon-root': { fontSize: 20 },
                }}
              >
                {metric.icon}
              </Box>
            </Box>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: { xs: '1.5rem', sm: '1.75rem' },
                lineHeight: 1,
                color: isDark ? '#f1f5f9' : '#0f172a',
                letterSpacing: '-0.02em',
              }}
            >
              {metric.value}
            </Typography>
            <Typography
              sx={{
                mt: 0.5,
                fontSize: '0.78rem',
                fontWeight: 500,
                color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.45)',
                letterSpacing: '0.01em',
              }}
            >
              {metric.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Two-column layout: Recent Releases + Quick Actions */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' },
          gap: 3,
          mb: 4,
        }}
      >
        {/* Recent Releases */}
        <Box
          sx={{
            borderRadius: '14px',
            bgcolor: isDark ? '#111827' : '#ffffff',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2.5, py: 2 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: isDark ? '#e2e8f0' : '#1e293b' }}>
              Recent Releases
            </Typography>
            <Button
              component={Link}
              href="/dashboard/releases"
              size="small"
              endIcon={<ArrowForward sx={{ fontSize: '14px !important' }} />}
              sx={{
                fontSize: '0.78rem', fontWeight: 600,
                color: '#00e7ff',
                '&:hover': { bgcolor: 'rgba(0,231,255,0.06)' },
              }}
            >
              View All
            </Button>
          </Box>

          {releaseLoading ? (
            <Box sx={{ px: 2.5, pb: 2 }}>
              {[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1, borderRadius: '10px' }} />)}
            </Box>
          ) : recentReleases.length === 0 ? (
            <Box sx={{ px: 2.5, pb: 3, textAlign: 'center' }}>
              <AlbumIcon sx={{ fontSize: 40, color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.15)', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">No releases yet</Typography>
            </Box>
          ) : (
            <Box>
              {recentReleases.map((release, idx) => (
                <Box
                  key={release._id}
                  component={Link}
                  href={`/dashboard/releases/${release._id}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2.5,
                    py: 1.5,
                    textDecoration: 'none',
                    color: 'inherit',
                    borderTop: idx > 0 ? '1px solid' : 'none',
                    borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                    transition: 'background 150ms ease',
                    '&:hover': {
                      bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)',
                    },
                  }}
                >
                  <Avatar
                    variant="rounded"
                    src={release.artworkUrl}
                    sx={{
                      width: 42, height: 42,
                      borderRadius: '8px',
                      bgcolor: isDark ? '#1e293b' : '#e2e8f0',
                    }}
                  >
                    <AlbumIcon sx={{ fontSize: 20 }} />
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontWeight: 600, fontSize: '0.85rem',
                        color: isDark ? '#e2e8f0' : '#1e293b',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {release.releaseTitle || release.title || 'Untitled Release'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.4)' }}>
                      {getReleaseTrackCount(release)} tracks · {formatDate(release.createdAt)}
                    </Typography>
                  </Box>
                  {getStatusChip(release.status)}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Quick Actions & Status */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Release Status Breakdown */}
          <Box
            sx={{
              order: 2,
              borderRadius: '14px',
              bgcolor: isDark ? '#111827' : '#ffffff',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
              p: 2.5,
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', mb: 2, color: isDark ? '#e2e8f0' : '#1e293b' }}>
              Release Status
            </Typography>
            {[
              { label: 'Approved', count: approvedReleases, total: totalReleases, color: '#10b981' },
              { label: 'In Process', count: inProcessReleases, total: totalReleases, color: '#0ea5e9' },
              { label: 'Pending', count: pendingReleases, total: totalReleases, color: '#f59e0b' },
              { label: 'Rejected', count: rejectedReleases, total: totalReleases, color: '#ef4444' },
            ].map((item) => (
              <Box key={item.label} sx={{ mb: 2, '&:last-child': { mb: 0 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(15,23,42,0.55)' }}>
                    {item.label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: item.color }}>
                    {item.count}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={item.total > 0 ? (item.count / item.total) * 100 : 0}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 3,
                      bgcolor: item.color,
                    },
                  }}
                />
              </Box>
            ))}
          </Box>

          {/* Quick Actions */}
          <Box
            sx={{
              order: 1,
              borderRadius: '14px',
              bgcolor: isDark ? '#111827' : '#ffffff',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
              p: 2.5,
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', mb: 2, color: isDark ? '#e2e8f0' : '#1e293b' }}>
              Quick Actions
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[
                { label: 'Create New Release', href: '/dashboard/upload', icon: <CloudUploadIcon />, color: '#00e7ff' },
                { label: 'View Releases', href: '/dashboard/releases', icon: <AlbumIcon />, color: '#f59e0b' },
                { label: 'View Analytics', href: '/dashboard/analytics', icon: <TrendingUp />, color: '#10b981' },
              ].map((action) => (
                <Button
                  key={action.label}
                  component={Link}
                  href={action.href}
                  fullWidth
                  startIcon={action.icon}
                  endIcon={<ArrowForward sx={{ fontSize: '14px !important' }} />}
                  sx={{
                    justifyContent: 'flex-start',
                    py: 1.25,
                    px: 2,
                    borderRadius: '10px',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    color: isDark ? '#e2e8f0' : '#1e293b',
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)',
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                    '& .MuiButton-endIcon': { ml: 'auto' },
                    '& .MuiButton-startIcon': { color: action.color },
                    '&:hover': {
                      bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
                    },
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Recent Tracks */}
      <Box
        sx={{
          borderRadius: '14px',
          bgcolor: isDark ? '#111827' : '#ffffff',
          border: '1px solid',
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2.5, py: 2 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: isDark ? '#e2e8f0' : '#1e293b' }}>
            Recent Tracks
          </Typography>
          <Button
            component={Link}
            href="/dashboard/tracks"
            size="small"
            endIcon={<ArrowForward sx={{ fontSize: '14px !important' }} />}
            sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#00e7ff' }}
          >
            View All
          </Button>
        </Box>

        {recentTracks.length === 0 ? (
          <Box sx={{ px: 2.5, pb: 4, textAlign: 'center' }}>
            <MusicNoteIcon sx={{ fontSize: 48, color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)', mb: 1 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No tracks yet. Upload your first release to get started.
            </Typography>
            <Button
              component={Link}
              href="/dashboard/upload"
              variant="contained"
              size="small"
              startIcon={<CloudUploadIcon />}
              sx={{
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #00e7ff 0%, #7b93f9 100%)',
              }}
            >
              Create New Release
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 0, borderTop: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }}>
            {recentTracks.map((track, idx) => (
              <Box
                key={track._id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 2,
                  borderRight: { xs: 'none', sm: (idx % 2 === 0 && idx % 3 !== 2) ? '1px solid' : 'none', md: (idx % 3 !== 2) ? '1px solid' : 'none' },
                  borderBottom: '1px solid',
                  borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                  transition: 'background 150ms ease',
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.015)' },
                }}
              >
                {/* Artwork + Play */}
                <Box sx={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar
                    variant="rounded"
                    src={track.artworkUrl}
                    sx={{ width: 48, height: 48, borderRadius: '8px', bgcolor: isDark ? '#1e293b' : '#e2e8f0' }}
                  >
                    <MusicNoteIcon sx={{ fontSize: 20 }} />
                  </Avatar>
                  <IconButton
                    onClick={() => handlePlayPause(track._id, track.audioUrl)}
                    size="small"
                    aria-label={currentlyPlaying === track._id ? 'pause' : 'play'}
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%', height: '100%',
                      borderRadius: '8px',
                      bgcolor: currentlyPlaying === track._id
                        ? 'rgba(74,108,247,0.8)'
                        : 'rgba(0,0,0,0.4)',
                      opacity: currentlyPlaying === track._id ? 1 : 0,
                      transition: 'opacity 150ms ease',
                      color: '#fff',
                      '&:hover': { opacity: 1 },
                    }}
                  >
                    {currentlyPlaying === track._id
                      ? <PauseIcon sx={{ fontSize: 20 }} />
                      : <PlayArrowIcon sx={{ fontSize: 20 }} />
                    }
                  </IconButton>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontWeight: 600, fontSize: '0.82rem',
                      color: isDark ? '#e2e8f0' : '#1e293b',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {track.title}
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.4)' }}>
                    {track.genre} · {formatDate(track.createdAt)}
                  </Typography>
                </Box>
                {getStatusChip(track.status)}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
