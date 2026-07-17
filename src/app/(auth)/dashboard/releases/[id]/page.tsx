'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Album as AlbumIcon,
  ArrowBack,
  CalendarToday,
  Edit,
  Fingerprint,
  GraphicEq,
  InfoOutlined,
  MusicNote,
  PlayArrow,
  Replay,
  Store,
  UploadFile,
} from '@mui/icons-material';
import AuthGuard from '@/components/AuthGuard';
import { DspLogo } from '@/components/dsp/DspLogo';
import {
  AcrCloudStatusLike,
  fetchAcrCloudScanResult,
  getAcrCloudColor,
  getAcrCloudLabel,
  getAcrCloudState,
  getAcrCloudSummary,
} from '@/lib/acrCloud';
import { getDspDisplayName } from '@/lib/platforms';
import PremiumAudioPlayer from '@/components/audio/PremiumAudioPlayer';
import { getReleaseRejectionReason, getNormalizedReleaseStatus, getReleaseStatusLabel } from '@/lib/releaseStatus';
import StatusBadge from '@/components/StatusBadge';

type Track = {
  _id?: string;
  title?: string;
  genre?: string;
  subGenre?: string;
  releaseDate?: string;
  audioUrl?: string;
  artworkUrl?: string;
  status?: string;
  isrc?: string;
  duration?: string | number;
  explicit?: boolean;
  copyrightC?: string;
  copyrightP?: string;
  copyrightCYear?: string | number;
  copyrightPYear?: string | number;
  label?: string;
  acrCloud?: AcrCloudStatusLike;
};

type Release = {
  _id?: string;
  releaseTitle?: string;
  primaryArtist?: string;
  artist?: string;
  releaseType?: string;
  status?: string;
  releaseDate?: string;
  originalReleaseDate?: string;
  createdAt?: string;
  updatedAt?: string;
  artworkUrl?: string;
  genre?: string;
  subGenre?: string;
  upc?: string;
  label?: string;
  copyright?: string;
  production?: string;
  cLine?: string;
  cline?: string;
  pLine?: string;
  pline?: string;
  copyrightC?: string;
  copyrightP?: string;
  stores?: string[];
  tracks?: Track[];
  rejectionReason?: string;
  rejectReason?: string;
};

const panelSx = (isDark: boolean) => ({
  borderRadius: '14px',
  bgcolor: isDark ? '#101722' : '#ffffff',
  border: '1px solid',
  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
  boxShadow: isDark ? '0 18px 44px rgba(0,0,0,0.18)' : '0 18px 44px rgba(15,23,42,0.06)',
});

const formatDate = (dateString?: string) => {
  if (!dateString) return 'Not set';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDuration = (value?: string | number) => {
  if (!value) return 'Not set';
  if (typeof value === 'string') return value;
  const mins = Math.floor(value / 60);
  const secs = Math.round(value % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function ReleaseDetailPage() {
  return (
    <AuthGuard>
      <ReleaseDetail />
    </AuthGuard>
  );
}

function ReleaseDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const releaseId = params?.id;
  const acrRefreshRef = useRef<Record<string, boolean>>({});

  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playerIndex, setPlayerIndex] = useState(0);
  const [playerRequestId, setPlayerRequestId] = useState(0);
  const [playerVisible, setPlayerVisible] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    const fetchRelease = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/releases/${releaseId}`);
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.success) {
          throw new Error(data?.error || 'Failed to load release');
        }

        if (mounted) {
          setRelease(data.release || data.data || null);
          setError('');
        }
      } catch (e: any) {
        if (mounted) {
          setError(e?.message || 'Failed to load release');
          setRelease(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (releaseId) void fetchRelease();

    return () => {
      mounted = false;
    };
  }, [releaseId]);

  useEffect(() => {
    if (!Array.isArray(release?.tracks)) return;

    const pendingTracks = release.tracks.filter(
      (track) =>
        track?.acrCloud?.fileId &&
        getAcrCloudState(track.acrCloud) === 'pending' &&
        !acrRefreshRef.current[track.acrCloud.fileId]
    );
    if (!pendingTracks.length) return;

    let cancelled = false;

    const refreshPending = async () => {
      for (const track of pendingTracks) {
        const fileId = track.acrCloud?.fileId;
        if (!fileId || cancelled) return;
        acrRefreshRef.current[fileId] = true;

        try {
          const nextStatus = await fetchAcrCloudScanResult(fileId);
          if (cancelled) return;

          setRelease((prev) =>
            prev
              ? {
                  ...prev,
                  tracks: Array.isArray(prev.tracks)
                    ? prev.tracks.map((item) =>
                        item?.acrCloud?.fileId === fileId
                          ? { ...item, acrCloud: { ...(item.acrCloud || {}), ...nextStatus } }
                          : item
                      )
                    : prev.tracks,
                }
              : prev
          );
        } catch {
          // Keep persisted status when live refresh fails.
        } finally {
          delete acrRefreshRef.current[fileId];
        }
      }
    };

    void refreshPending();

    return () => {
      cancelled = true;
    };
  }, [release]);

  const tracks = useMemo(() => (Array.isArray(release?.tracks) ? release.tracks : []), [release?.tracks]);
  const artistName = release?.primaryArtist || release?.artist || 'Unknown artist';
  const playableTracks = useMemo(
    () =>
      tracks
        .map((track, sourceIndex) => ({
          id: track._id || `track-${sourceIndex}`,
          title: track.title || `Track ${sourceIndex + 1}`,
          artist: artistName,
          audioUrl: track.audioUrl || '',
          artworkUrl: track.artworkUrl || release?.artworkUrl,
          sourceIndex,
        }))
        .filter(track => Boolean(track.audioUrl)),
    [artistName, release?.artworkUrl, tracks]
  );
  const stores = Array.isArray(release?.stores) ? release.stores : [];
  const readyAcrCount = tracks.filter((track) => getAcrCloudState(track.acrCloud) === 'ready').length;
  const pendingAcrCount = tracks.filter((track) => getAcrCloudState(track.acrCloud) === 'pending').length;
  const rejectedReason = getReleaseRejectionReason(release?.rejectionReason || release?.rejectReason);
  const firstTrack = tracks[0];
  const releaseGenre = release?.genre || firstTrack?.genre || '';
  const releaseSubGenre = release?.subGenre || firstTrack?.subGenre || '';

  const handlePlayPause = (trackId: string) => {
    const nextIndex = playableTracks.findIndex(track => track.id === trackId);
    if (nextIndex < 0) return;
    setPlayerIndex(nextIndex);
    setPlayerRequestId(value => value + 1);
    setPlayerVisible(true);
  };

  const handleResubmit = async () => {
    if (!releaseId || release?.status !== 'rejected') return;
    try {
      setResubmitting(true);
      const res = await fetch(`/api/releases/${releaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resubmit' }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to resubmit release');
      }
      setRelease((prev) =>
        prev
          ? {
              ...prev,
              status: 'pending',
              rejectReason: undefined,
              rejectionReason: undefined,
              updatedAt: new Date().toISOString(),
            }
          : prev
      );
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to resubmit release');
    } finally {
      setResubmitting(false);
    }
  };

  const renderDspIcon = (store: string, index: number) => {
    const dspName = getDspDisplayName(store);

    return (
      <Tooltip key={`${store}-${index}`} title={dspName}>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 1.25,
            py: 0.75,
            borderRadius: '9px',
            bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.035)',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)',
          }}
        >
          <DspLogo value={store} alt={dspName} size={24} padding={0.25} />
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: isDark ? '#e5edf6' : '#1f2937' }}>
            {dspName}
          </Typography>
        </Box>
      </Tooltip>
    );
  };

  const renderAcrChip = (acrCloud?: AcrCloudStatusLike) => {
    if (!acrCloud) {
      return (
        <Chip
          size="small"
          icon={<Fingerprint sx={{ fontSize: 14 }} />}
          label="ACR not started"
          sx={{ height: 24, fontSize: '0.7rem', fontWeight: 700 }}
        />
      );
    }

    return (
      <Chip
        size="small"
        color={getAcrCloudColor(acrCloud) as any}
        icon={<Fingerprint sx={{ fontSize: 14 }} />}
        label={getAcrCloudLabel(acrCloud)}
        sx={{ height: 24, fontSize: '0.7rem', fontWeight: 700 }}
      />
    );
  };

  if (loading) {
    return (
      <Box sx={{ width: '100%', py: 3 }}>
        <Skeleton variant="rounded" width={130} height={34} sx={{ mb: 3, borderRadius: '9px' }} />
        <Box sx={{ ...panelSx(isDark), p: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            <Skeleton variant="rounded" width={220} height={220} sx={{ borderRadius: '14px' }} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="45%" height={44} />
              <Skeleton variant="text" width="30%" height={26} />
              <Skeleton variant="rounded" width="100%" height={92} sx={{ mt: 3, borderRadius: '12px' }} />
            </Box>
          </Stack>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ width: '100%', py: 3 }}>
        <Button startIcon={<ArrowBack />} onClick={() => router.push('/dashboard/releases')} sx={{ mb: 2 }}>
          Back to Releases
        </Button>
        <Alert severity="error" sx={{ borderRadius: '12px' }}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!release) return null;

  return (
    <Box sx={{ width: '100%', py: { xs: 1, sm: 2 } }}>
      <Button
        startIcon={<ArrowBack sx={{ fontSize: 17 }} />}
        onClick={() => router.push('/dashboard/releases')}
        sx={{
          mb: 2.5,
          borderRadius: '9px',
          fontSize: '0.82rem',
          fontWeight: 800,
          color: isDark ? 'rgba(255,255,255,0.62)' : 'rgba(15,23,42,0.58)',
        }}
      >
        Back to Releases
      </Button>

      <Box sx={{ ...panelSx(isDark), p: { xs: 2, md: 3 }, mb: 3, overflow: 'hidden' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2.5, md: 3 }} alignItems={{ md: 'stretch' }}>
          <Avatar
            variant="rounded"
            src={release.artworkUrl}
            sx={{
              width: { xs: '100%', sm: 220 },
              height: { xs: 220, sm: 220 },
              maxWidth: { xs: 320, md: 220 },
              borderRadius: '14px',
              bgcolor: isDark ? '#1f2937' : '#eef2f7',
              alignSelf: { xs: 'center', md: 'flex-start' },
              boxShadow: '0 16px 38px rgba(0,0,0,0.22)',
            }}
          >
            <AlbumIcon sx={{ fontSize: 62 }} />
          </Avatar>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
              <StatusBadge status={release.status} size="medium" sx={{ fontWeight: 800 }} />
              <Chip
                size="small"
                label={release.releaseType || 'Single'}
                sx={{
                  height: 27,
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
                  color: isDark ? '#d8e2ef' : '#334155',
                }}
              />
            </Stack>

            <Typography
              variant="h4"
              sx={{
                fontWeight: 900,
                fontSize: { xs: '1.55rem', sm: '2rem' },
                lineHeight: 1.12,
                letterSpacing: 0,
                color: isDark ? '#f4f7fb' : '#0f172a',
                overflowWrap: 'anywhere',
              }}
            >
              {release.releaseTitle || 'Untitled Release'}
            </Typography>
            <Typography
              sx={{
                mt: 0.75,
                mb: 2.5,
                fontSize: '1rem',
                fontWeight: 650,
                color: isDark ? 'rgba(255,255,255,0.56)' : 'rgba(15,23,42,0.58)',
                overflowWrap: 'anywhere',
              }}
            >
              {artistName}
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
                gap: 1.25,
              }}
            >
              {[
                { icon: <CalendarToday sx={{ fontSize: 16 }} />, label: 'Release date', value: formatDate(release.releaseDate) },
                { icon: <MusicNote sx={{ fontSize: 16 }} />, label: 'Tracks', value: `${tracks.length}` },
                { icon: <Fingerprint sx={{ fontSize: 16 }} />, label: 'ACR ready', value: `${readyAcrCount}/${tracks.length}` },
                { icon: <UploadFile sx={{ fontSize: 16 }} />, label: 'Stores', value: `${stores.length}` },
              ].map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    p: 1.35,
                    borderRadius: '10px',
                    bgcolor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.03)',
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                  }}
                >
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.4 }}>
                    <Box sx={{ color: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(15,23,42,0.4)' }}>{item.icon}</Box>
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.45)', textTransform: 'uppercase' }}>
                      {item.label}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: '0.92rem', fontWeight: 850, color: isDark ? '#edf2f7' : '#172033' }}>
                    {item.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Stack>
      </Box>

      {rejectedReason && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: '12px' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
            <Box>
              <Typography sx={{ fontWeight: 850, mb: 0.4 }}>Rejection reason</Typography>
              <Typography sx={{ fontSize: '0.88rem' }}>{rejectedReason}</Typography>
            </Box>
            <Button
              variant="outlined"
              color="error"
              startIcon={<Edit />}
              onClick={() => router.push(`/dashboard/upload?editReleaseId=${releaseId}`)}
              disabled={release?.status !== 'rejected'}
              sx={{ borderRadius: '10px', fontWeight: 850, flexShrink: 0 }}
            >
              Edit Details
            </Button>
            <Button
              variant="contained"
              color="error"
              startIcon={resubmitting ? <CircularProgress color="inherit" size={16} /> : <Replay />}
              onClick={handleResubmit}
              disabled={resubmitting || release?.status !== 'rejected'}
              sx={{ borderRadius: '10px', fontWeight: 850, flexShrink: 0 }}
            >
              Resubmit
            </Button>
          </Stack>
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.55fr) minmax(320px, 0.8fr)' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Box sx={{ ...panelSx(isDark), overflow: 'hidden' }}>
          <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} alignItems={{ sm: 'center' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, fontSize: '1rem', color: isDark ? '#edf2f7' : '#111827' }}>
                  Track review
                </Typography>
                <Typography sx={{ mt: 0.25, fontSize: '0.78rem', color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.48)' }}>
                  Audio, metadata, and ACR verification status
                </Typography>
              </Box>
              {pendingAcrCount > 0 && (
                <Chip
                  size="small"
                  icon={<CircularProgress size={13} color="inherit" />}
                  label={`${pendingAcrCount} testing`}
                  color="warning"
                  sx={{ height: 26, fontWeight: 800, alignSelf: { xs: 'flex-start', sm: 'center' } }}
                />
              )}
            </Stack>
          </Box>

          {playerVisible && playableTracks.length > 0 && (
            <Box sx={{ px: { xs: 1.5, sm: 2.5 }, pb: 2 }}>
              <PremiumAudioPlayer
                tracks={playableTracks}
                requestedIndex={playerIndex}
                requestId={playerRequestId}
                onDuration={(index, durationSeconds) => {
                  const sourceIndex = playableTracks[index]?.sourceIndex;
                  if (sourceIndex === undefined) return;
                  setRelease(current =>
                    current
                      ? {
                          ...current,
                          tracks: current.tracks?.map((item, itemIndex) =>
                            itemIndex === sourceIndex && !item.duration
                              ? { ...item, duration: durationSeconds }
                              : item
                          ),
                        }
                      : current
                  );
                }}
              />
            </Box>
          )}

          <Box
            sx={{
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: 'minmax(240px, 1.6fr) 0.7fr 0.8fr 1.05fr 0.7fr',
              gap: 2,
              px: 2.5,
              py: 1.1,
              bgcolor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.025)',
              borderTop: '1px solid',
              borderBottom: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)',
            }}
          >
            {['Track', 'Genre', 'Release', 'ACR status', 'Status'].map((heading) => (
              <Typography key={heading} sx={{ fontSize: '0.68rem', fontWeight: 900, color: isDark ? 'rgba(255,255,255,0.36)' : 'rgba(15,23,42,0.4)', textTransform: 'uppercase' }}>
                {heading}
              </Typography>
            ))}
          </Box>

          {tracks.length === 0 ? (
            <Box sx={{ px: 2.5, py: 4, textAlign: 'center' }}>
              <MusicNote sx={{ fontSize: 34, color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.25)' }} />
              <Typography sx={{ mt: 1, fontWeight: 800, color: isDark ? '#e5edf6' : '#172033' }}>No tracks found</Typography>
            </Box>
          ) : (
            tracks.map((track, index) => {
              const trackId = track._id || `track-${index}`;
              const acrSummary = getAcrCloudSummary(track.acrCloud);

              return (
                <Box
                  key={trackId}
                  sx={{
                    display: { xs: 'flex', md: 'grid' },
                    gridTemplateColumns: { md: 'minmax(240px, 1.6fr) 0.7fr 0.8fr 1.05fr 0.7fr' },
                    flexDirection: { xs: 'column' },
                    gap: { xs: 1, md: 2 },
                    px: { xs: 2, sm: 2.5 },
                    py: 1.55,
                    alignItems: { md: 'center' },
                    borderTop: index > 0 ? '1px solid' : 'none',
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                    '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.018)' },
                  }}
                >
                  <Stack direction="row" spacing={1.35} alignItems="center" minWidth={0}>
                    <Box sx={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar
                        variant="rounded"
                        src={track.artworkUrl || release.artworkUrl}
                        sx={{ width: 46, height: 46, borderRadius: '8px', bgcolor: isDark ? '#1f2937' : '#eef2f7' }}
                      >
                        <GraphicEq sx={{ fontSize: 18 }} />
                      </Avatar>
                      {track.audioUrl && (
                        <IconButton
                          aria-label={`Play ${track.title || `Track ${index + 1}`}`}
                          onClick={() => handlePlayPause(trackId)}
                          size="small"
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            borderRadius: '8px',
                            bgcolor: 'rgba(0,0,0,0.48)',
                            opacity: 0,
                            color: '#fff',
                            transition: 'opacity 150ms ease',
                            '&:hover': { opacity: 1 },
                          }}
                        >
                          <PlayArrow sx={{ fontSize: 18 }} />
                        </IconButton>
                      )}
                    </Box>
                    <Box minWidth={0}>
                      <Typography sx={{ fontWeight: 850, fontSize: '0.88rem', color: isDark ? '#edf2f7' : '#162033', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {track.title || `Track ${index + 1}`}
                      </Typography>
                      <Typography sx={{ mt: 0.2, fontSize: '0.72rem', color: isDark ? 'rgba(255,255,255,0.43)' : 'rgba(15,23,42,0.45)' }}>
                        ISRC {track.isrc || 'Not set'} | {formatDuration(track.duration)}
                      </Typography>
                    </Box>
                  </Stack>

                  <Typography sx={{ fontSize: '0.8rem', color: isDark ? 'rgba(255,255,255,0.58)' : 'rgba(15,23,42,0.58)' }}>
                    {[track.genre || releaseGenre, track.subGenre || releaseSubGenre].filter(Boolean).join(' / ') || 'Not set'}
                  </Typography>

                  <Typography sx={{ fontSize: '0.8rem', color: isDark ? 'rgba(255,255,255,0.58)' : 'rgba(15,23,42,0.58)' }}>
                    {formatDate(track.releaseDate || release.releaseDate)}
                  </Typography>

                  <Box>
                    {renderAcrChip(track.acrCloud)}
                    {acrSummary && (
                      <Typography sx={{ mt: 0.55, fontSize: '0.7rem', color: isDark ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 230 }}>
                        {acrSummary}
                      </Typography>
                    )}
                  </Box>

                  <StatusBadge
                    status={track.status || release.status}
                    size="small"
                    sx={{ fontWeight: 850, fontSize: '0.7rem' }}
                  />
                </Box>
              );
            })
          )}
        </Box>

        <Stack spacing={3}>
          <Box sx={{ ...panelSx(isDark), p: 2.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <InfoOutlined sx={{ fontSize: 19, color: theme.palette.primary.main }} />
              <Typography sx={{ fontWeight: 900, color: isDark ? '#edf2f7' : '#111827' }}>Release facts</Typography>
            </Stack>
            {[
              ['UPC', release.upc],
              ['Label', release.label || tracks[0]?.label],
              ['Release type', release.releaseType],
              ['Digital release', formatDate(release.releaseDate)],
              ['Genre', [releaseGenre, releaseSubGenre].filter(Boolean).join(' / ')],
              ['Original release', formatDate(release.originalReleaseDate)],
              ['Created', formatDate(release.createdAt)],
              ['Updated', formatDate(release.updatedAt)],
              ['C line', release.copyright || release.cLine || release.cline || release.copyrightC || [tracks[0]?.copyrightCYear, tracks[0]?.copyrightC].filter(Boolean).join(' ')],
              ['P line', release.production || release.pLine || release.pline || release.copyrightP || [tracks[0]?.copyrightPYear, tracks[0]?.copyrightP].filter(Boolean).join(' ')],
            ].map(([label, value], index) => (
              <Box key={label}>
                {index > 0 && <Divider sx={{ my: 1.15, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }} />}
                <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="flex-start">
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 800, color: isDark ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.45)' }}>
                    {label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 750, color: isDark ? '#e8eef7' : '#172033', textAlign: 'right', overflowWrap: 'anywhere' }}>
                    {value || 'Not set'}
                  </Typography>
                </Stack>
              </Box>
            ))}
          </Box>

          <Box sx={{ ...panelSx(isDark), p: 2.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <Store sx={{ fontSize: 19, color: '#f59e0b' }} />
              <Typography sx={{ fontWeight: 900, color: isDark ? '#edf2f7' : '#111827' }}>Distribution stores</Typography>
            </Stack>
            {stores.length > 0 ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {stores.map(renderDspIcon)}
              </Stack>
            ) : (
              <Typography sx={{ fontSize: '0.82rem', color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.5)' }}>
                No stores selected.
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

export default ReleaseDetailPage;
