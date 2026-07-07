'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { Album, MusicNote, Search } from '@mui/icons-material';
import useAdminAuth from '@/hooks/useAdminAuth';
import { adminAPI } from '@/services/api';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import { getNormalizedReleaseStatus, getReleaseStatusLabel } from '@/lib/releaseStatus';

const statusTabs = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_process', label: 'In Process' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function AdminTracksPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { isAdmin, isLoading: authLoading, error: authError } = useAdminAuth();
  const [tracks, setTracks] = useState<any[]>([]);
  const [counts, setCounts] = useState({ all: 0, pending: 0, in_process: 0, approved: 0, rejected: 0, other: 0 });
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAdmin !== true) return;
    const timer = window.setTimeout(() => {
      void loadTracks();
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, status, search, page, rowsPerPage]);

  const loadTracks = async () => {
    try {
      setLoading(true);
      setError('');
      const response: any = await adminAPI.getTracks({
        page: page + 1,
        limit: rowsPerPage,
        status: status !== 'all' ? status : undefined,
        search: search.trim() || undefined,
      });
      if (!response?.success) throw new Error(response?.error || response?.message || 'Failed to load tracks');
      const rows = Array.isArray(response.data) ? response.data : [];
      setTracks(rows);
      setTotal(Number(response.pagination?.total || rows.length || 0));
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
      setTracks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <Box sx={{ minHeight: 420, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (authError || isAdmin === false) return <Alert severity="error">{authError || 'Admin access required'}</Alert>;

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <PremiumHeader
        eyebrow="Admin Catalog"
        title="Tracks"
        description="Every individual track across user releases, with real ownership, status, and release context."
      />

      <Paper elevation={0} sx={{ ...premiumSurfaceSx(theme), p: 1.5, mb: 2.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <Tabs
            value={status}
            onChange={(_, value) => {
              setStatus(value);
              setPage(0);
            }}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="admin track status filters"
            sx={{
              flex: 1,
              minHeight: 44,
              '& .MuiTab-root': {
                minHeight: 44,
                textTransform: 'none',
                fontWeight: 900,
                borderRadius: '10px',
                color: isDark ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.70)',
              },
              '& .Mui-selected': {
                bgcolor: isDark ? 'rgba(74,108,247,0.18)' : 'rgba(74,108,247,0.10)',
                color: isDark ? '#c7d8ff' : '#3155d4',
              },
            }}
          >
            {statusTabs.map((tab) => (
              <Tab key={tab.value} value={tab.value} label={`${tab.label} (${counts[tab.value as keyof typeof counts] ?? 0})`} />
            ))}
          </Tabs>
          <TextField
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Search title, release, artist, ISRC..."
            size="small"
            sx={{ minWidth: { xs: '100%', md: 390 } }}
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

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Paper elevation={0} sx={{ ...premiumSurfaceSx(theme), overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Track', 'Release', 'User', 'ISRC', 'Status', 'Updated'].map((header) => (
                  <TableCell key={header} sx={{ fontWeight: 900, color: 'text.secondary' }}>{header}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}><CircularProgress /></TableCell>
                </TableRow>
              ) : tracks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 7 }}>
                    <MusicNote sx={{ color: 'text.disabled', mb: 1 }} />
                    <Typography fontWeight={900}>No tracks found</Typography>
                  </TableCell>
                </TableRow>
              ) : tracks.map((track) => {
                const normalized = getNormalizedReleaseStatus(track.status);
                return (
                  <TableRow key={track._id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center" minWidth={0}>
                        <Avatar src={track.artworkUrl || undefined} variant="rounded" sx={{ width: 42, height: 42, borderRadius: '10px' }}>
                          <Album />
                        </Avatar>
                        <Box minWidth={0}>
                          <Typography fontWeight={900} noWrap>{track.title || 'Untitled Track'}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>{track.artist || 'Unknown artist'}</Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography
                        component={Link}
                        href={`/admin/releases/${track.releaseId}`}
                        sx={{ color: 'primary.main', fontWeight: 850, textDecoration: 'none' }}
                      >
                        {track.releaseTitle || 'Untitled Release'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={850}>{track.ownerName || '-'}</Typography>
                      <Typography variant="caption" color="text.secondary">{track.ownerEmail || track.ownerUserId || '-'}</Typography>
                    </TableCell>
                    <TableCell>{track.isrc || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={getReleaseStatusLabel(track.status)}
                        color={normalized === 'approved' ? 'success' : normalized === 'rejected' ? 'error' : normalized === 'in_process' ? 'info' : 'warning'}
                        sx={{ fontWeight: 850, borderRadius: '999px' }}
                      />
                    </TableCell>
                    <TableCell>{formatDate(track.updatedAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(Number(event.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Paper>
    </Box>
  );
}
