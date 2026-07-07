'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  InputAdornment,
  Tab,
  Tabs,
  TextField,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import { Album, CloudUpload, Pause, PlayArrow, Search } from '@mui/icons-material';
import AuthGuard from '@/components/AuthGuard';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import RouteTabs from '@/components/navigation/RouteTabs';
import { trackAPI } from '@/services/api';

type TrackRow = {
  id: string;
  title: string;
  artist: string;
  releaseTitle: string;
  releaseId: string;
  artworkUrl?: string;
  audioUrl?: string;
  isrc?: string;
  status?: string;
  releaseDate?: string;
};

const formatDate = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function TracksPage() {
  return (
    <AuthGuard>
      <TracksContent />
    </AuthGuard>
  );
}

function TracksContent() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<TrackRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState({ all: 0, pending: 0, in_process: 0, approved: 0, rejected: 0, other: 0 });
  const [playing, setPlaying] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await trackAPI.getTracks({
          page: 1,
          limit: 100,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          search: search.trim() || undefined,
        });
        if (!response.success) throw new Error(response.error || 'Failed to load tracks');
        setRows(Array.isArray(response.data) ? response.data : []);
        if (response.counts) {
          setCounts({
            all: Number(response.counts.all || 0),
            pending: Number(response.counts.pending || 0),
            in_process: Number(response.counts.in_process || 0),
            approved: Number(response.counts.approved || 0),
            rejected: Number(response.counts.rejected || 0),
            other: Number(response.counts.other || 0),
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tracks');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [statusFilter, search]);

  useEffect(() => () => audio?.pause(), [audio]);

  const activeCounts = useMemo(() => ({
    total: counts.all,
    approved: counts.approved,
    pending: counts.pending,
  }), [counts]);

  const togglePlay = (row: TrackRow) => {
    if (!row.audioUrl) return;
    if (playing === row.id) {
      audio?.pause();
      setPlaying(null);
      return;
    }
    audio?.pause();
    const next = new Audio(row.audioUrl);
    next.onended = () => setPlaying(null);
    next.play().catch(() => setPlaying(null));
    setAudio(next);
    setPlaying(row.id);
  };

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <PremiumHeader
        eyebrow="Catalog"
        title="Tracks"
        description="Every submitted track across your releases, ready for review, playback, and distribution checks."
        action={<Button component={Link} href="/dashboard/upload" variant="contained" startIcon={<CloudUpload />}>
          Create New Release
        </Button>}
      />

      <RouteTabs
        ariaLabel="release catalog sections"
        items={[
          { label: 'All Releases', href: '/dashboard/releases' },
          { label: 'Pending', href: '/dashboard/releases?status=pending' },
          { label: 'Approved', href: '/dashboard/releases?status=approved' },
          { label: 'Rejected', href: '/dashboard/releases?status=rejected' },
          { label: 'Tracks', href: '/dashboard/tracks' },
        ]}
      />

      <Paper
        elevation={0}
        sx={{ ...premiumSurfaceSx(theme), p: 1.25, mb: 2.5, borderRadius: '16px' }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <Tabs
            value={statusFilter}
            onChange={(_, value) => setStatusFilter(value)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="track status filters"
            sx={{
              minHeight: 42,
              flex: 1,
              '& .MuiTab-root': { minHeight: 42, textTransform: 'none', fontWeight: 850, borderRadius: '10px' },
              '& .Mui-selected': { bgcolor: isDark ? 'rgba(74,108,247,0.18)' : 'rgba(74,108,247,0.10)' },
            }}
          >
            {[
              ['all', `All (${counts.all})`],
              ['pending', `Pending (${counts.pending})`],
              ['in_process', `In Process (${counts.in_process})`],
              ['approved', `Approved (${counts.approved})`],
              ['rejected', `Rejected (${counts.rejected})`],
            ].map(([value, label]) => (
              <Tab key={value} value={value} label={label} />
            ))}
          </Tabs>
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tracks, releases, artists, ISRC..."
            size="small"
            sx={{ minWidth: { xs: '100%', md: 360 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, mb: 2.5 }}>
        {[
          ['Total tracks', activeCounts.total, '#4f46e5'],
          ['Approved', activeCounts.approved, '#10b981'],
          ['Pending review', activeCounts.pending, '#f59e0b'],
        ].map(([label, value, color]) => (
          <Paper
            key={label}
            elevation={0}
            sx={{
              ...premiumSurfaceSx(theme),
              p: 2,
              minHeight: 112,
              borderRadius: '24px',
              position: 'relative',
              '&::after': {
                content: '""',
                position: 'absolute',
                left: 18,
                right: 18,
                bottom: 0,
                height: 3,
                borderRadius: 99,
                bgcolor: String(color),
              },
            }}
          >
            <Typography variant="body2" color="text.secondary" fontWeight={850}>
              {String(label)}
            </Typography>
            <Typography variant="h4" fontWeight={950} sx={{ mt: 1, fontSize: { xs: '1.75rem', md: '2rem' } }}>
              {String(value)}
            </Typography>
          </Paper>
        ))}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ ...premiumSurfaceSx(theme), overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>
        ) : rows.length === 0 ? (
          <Box sx={{ py: 7, textAlign: 'center' }}>
            <Album sx={{ fontSize: 42, color: 'text.disabled', mb: 1 }} />
            <Typography fontWeight={800}>No tracks yet</Typography>
            <Typography color="text.secondary">Upload a release to start your catalog.</Typography>
          </Box>
        ) : (
          rows.map((row, index) => (
            <Box
              key={row.id}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(260px,1.35fr) 1fr 130px 120px 112px' },
                gap: { xs: 1.25, md: 1.75 },
                alignItems: 'center',
                px: { xs: 1.5, md: 2 },
                py: 1.5,
                borderTop: index ? '1px solid' : 0,
                borderColor: 'divider',
                bgcolor: 'transparent',
                transition: 'background-color 160ms ease',
                '&:hover': {
                  bgcolor: isDark ? 'rgba(91,95,247,0.08)' : 'rgba(91,95,247,0.055)',
                },
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" minWidth={0}>
                <Box sx={{ position: 'relative' }}>
                  <Avatar src={row.artworkUrl} variant="rounded" sx={{ width: 44, height: 44, borderRadius: '12px' }}><Album /></Avatar>
                  {row.audioUrl && (
                    <IconButton onClick={() => togglePlay(row)} size="small" sx={{ position: 'absolute', inset: 0, color: '#fff', bgcolor: 'rgba(0,0,0,0.48)', borderRadius: 1.5, '&:hover': { bgcolor: 'rgba(0,0,0,0.62)' } }}>
                      {playing === row.id ? <Pause /> : <PlayArrow />}
                    </IconButton>
                  )}
                </Box>
                <Box minWidth={0}>
                  <Typography fontWeight={850} noWrap sx={{ fontSize: '0.92rem' }}>{row.title}</Typography>
                  <Typography color="text.secondary" fontSize={12.5} noWrap>{row.artist}</Typography>
                </Box>
              </Stack>
              <Typography component={Link} href={`/dashboard/releases/${row.releaseId}`} sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 800, fontSize: '0.9rem' }}>
                {row.releaseTitle}
              </Typography>
              <Typography color="text.secondary" sx={{ fontSize: '0.86rem' }}>{row.isrc || 'No ISRC'}</Typography>
              <Typography color="text.secondary" sx={{ fontSize: '0.86rem' }}>{formatDate(row.releaseDate)}</Typography>
              <Chip label={row.status || 'pending'} size="small" color={row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'error' : 'warning'} sx={{ height: 26, maxWidth: 112 }} />
            </Box>
          ))
        )}
      </Paper>
    </Box>
  );
}
