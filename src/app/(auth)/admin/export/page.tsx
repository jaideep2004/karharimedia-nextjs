'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  alpha,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Archive,
  Album,
  Cancel,
  CheckCircle,
  CloudDownload,
  ErrorOutline,
  Inventory2,
  Pending,
  PlayArrow,
  Refresh,
  UploadFile,
} from '@mui/icons-material';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import Link from 'next/link';
import { adminAPI, releaseAPI } from '@/services/api';
import { getNormalizedReleaseStatus } from '@/lib/releaseStatus';

type ExportState = 'queued' | 'running' | 'completed' | 'completed_with_warnings' | 'failed';

type ExportPart = {
  name: string;
  type: 'metadata' | 'tracks';
  size: number;
  trackCount: number;
  createdAt: string;
};

type ExportJob = {
  _id: string;
  state: ExportState;
  scope: 'release' | 'user' | 'users' | 'status';
  criteria?: {
    releaseIds?: string[];
    userId?: string;
    userIds?: string[];
    statuses?: Array<'approved' | 'pending' | 'pending_review' | 'rejected'>;
    zipGrouping?: 'per_release' | 'per_user';
  };
  counts: {
    releases: number;
    tracks: number;
    files: number;
    missing: number;
    parts: number;
  };
  parts: ExportPart[];
  errors: string[];
  warnings: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  expiresAt: string;
};

const stateColor: Record<ExportState, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
  queued: 'default',
  running: 'primary',
  completed: 'success',
  completed_with_warnings: 'warning',
  failed: 'error',
};

const stateLabel: Record<ExportState, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  completed_with_warnings: 'Warnings',
  failed: 'Failed',
};

const numberFormatter = new Intl.NumberFormat();
const byteFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

function formatNumber(value: number | undefined) {
  return numberFormatter.format(Number(value || 0));
}

function formatBytes(value: number | undefined) {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024 * 1024) return `${byteFormatter.format(bytes / (1024 * 1024 * 1024))} GB`;
  if (bytes >= 1024 * 1024) return `${byteFormatter.format(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${byteFormatter.format(bytes / 1024)} KB`;
  return `${numberFormatter.format(bytes)} B`;
}

function formatDate(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function isActiveJob(job?: ExportJob) {
  return !!job && ['queued', 'running'].includes(job.state);
}

function getReleaseUserId(release: any) {
  return String(
    release.ownerUserId ||
      release.userId ||
      release.artistId ||
      release.ownerId ||
      release.createdBy ||
      ''
  );
}

export default function AdminExportPage() {
  const theme = useTheme();
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'release' | 'user' | 'users' | 'status'>('status');
  const [exportStatus, setExportStatus] = useState<'all' | 'approved' | 'pending' | 'rejected'>('approved');
  const [selectedReleaseId, setSelectedReleaseId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedUserReleaseIds, setSelectedUserReleaseIds] = useState<string[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const latestJob = jobs[0];
  const active = isActiveJob(latestJob);

  const loadJobs = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/export/catalog', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to load export jobs');
      }

      setJobs(Array.isArray(payload.data?.jobs) ? payload.data.jobs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load export jobs');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void loadJobs(true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [active, loadJobs]);

  const loadReleases = useCallback(async () => {
    const response = await releaseAPI.getReleases({ summary: '1' });
    if (response.success) setReleases(Array.isArray(response.data) ? response.data : []);
  }, []);

  const loadUsers = useCallback(async () => {
    const response = await adminAPI.getUsers({ limit: 500, sort: 'name' });
    if (response.success) {
      const rows = Array.isArray(response.data?.users) ? response.data.users : [];
      setUsers(rows);
    }
  }, []);

  const openCreateExport = () => {
    setExportOpen(true);
    if (releases.length === 0) void loadReleases();
    if (users.length === 0) void loadUsers();
  };

  const resetExportDialog = () => {
    setExportScope('status');
    setExportStatus('approved');
    setSelectedReleaseId('');
    setSelectedUserId('');
    setSelectedUserIds([]);
    setSelectedUserReleaseIds([]);
  };

  const handleCreateExport = async () => {
    setCreating(true);
    setError('');

    try {
      const createScope =
        exportScope === 'user' && selectedUserReleaseIds.length > 0 ? 'user' : exportScope;
      const statuses =
        exportScope === 'user'
          ? ['pending', 'pending_review']
          : exportStatus === 'all'
            ? ['approved', 'pending', 'pending_review', 'rejected']
            : exportStatus === 'pending'
              ? ['pending', 'pending_review']
              : [exportStatus];
      const response = await fetch('/api/admin/export/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: createScope,
          releaseIds:
            exportScope === 'user'
              ? selectedUserReleaseIds
              : exportScope === 'release'
                ? [selectedReleaseId]
                : [],
          userId: exportScope === 'user' ? selectedUserId : undefined,
          userIds: createScope === 'users' ? selectedUserIds : [],
          statuses,
          zipGrouping: createScope === 'users' || exportScope === 'user' ? 'per_user' : 'per_release',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to start export');
      }
      setExportOpen(false);
      resetExportDialog();
      await loadJobs(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start export');
    } finally {
      setCreating(false);
    }
  };

  const userOptions = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; email: string }>();
    users.forEach((user) => {
      const id = String(user._id || user.id || '');
      if (!id) return;
      byId.set(id, {
        id,
        label: user.artistName || user.name || user.email || 'Unknown user',
        email: user.email || '',
      });
    });
    releases.forEach((release) => {
      const id = String(release.ownerUserId || release.userId || release.artistId || '');
      if (!id || byId.has(id)) return;
      byId.set(id, {
        id,
        label: release.ownerName || release.ownerArtistName || 'Unknown user',
        email: release.ownerEmail || '',
      });
    });
    return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [releases, users]);

  const exportedReleaseIds = useMemo(() => {
    const ids = new Set<string>();
    jobs.forEach((job) => {
      if (!['completed', 'completed_with_warnings'].includes(job.state)) return;
      (job.criteria?.releaseIds || []).forEach((id) => {
        if (id) ids.add(String(id));
      });
    });
    return ids;
  }, [jobs]);

  const pendingUserReleases = useMemo(
    () =>
      selectedUserId
        ? releases.filter(
            (release) =>
              getReleaseUserId(release) === selectedUserId && getNormalizedReleaseStatus(release.status) === 'pending'
          )
        : [],
    [releases, selectedUserId]
  );

  const canCreateExport =
    !creating &&
    !active &&
    (exportScope === 'status' ||
      (exportScope === 'release' && Boolean(selectedReleaseId)) ||
      (exportScope === 'user' && Boolean(selectedUserId) && selectedUserReleaseIds.length > 0) ||
      (exportScope === 'users' && selectedUserIds.length > 0));

  const metrics = useMemo(
    () => [
      { label: 'Releases', value: latestJob?.counts.releases || 0, accent: '#00e7ff' },
      { label: 'Tracks', value: latestJob?.counts.tracks || 0, accent: '#21a67a' },
      { label: 'Files', value: latestJob?.counts.files || 0, accent: '#f5a524' },
      { label: 'Missing', value: latestJob?.counts.missing || 0, accent: '#ef4444' },
    ],
    [latestJob]
  );

  const downloadable = latestJob?.parts?.length ? latestJob.parts : [];
  const tabItems = [
    { label: 'All', href: '/admin/releases', icon: <Album fontSize="small" />, color: '#00e7ff' },
    { label: 'Pending', href: '/admin/releases?status=pending', icon: <Pending fontSize="small" />, color: '#f59e0b' },
    { label: 'Approved', href: '/admin/releases?status=approved', icon: <CheckCircle fontSize="small" />, color: '#10b981' },
    { label: 'Rejected', href: '/admin/releases?status=rejected', icon: <Cancel fontSize="small" />, color: '#ef4444' },
    { label: 'Export Catalog', href: '/admin/export', icon: <UploadFile fontSize="small" />, color: '#0ea5e9' },
  ];

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
      <PremiumHeader
        eyebrow="Catalog Ops"
        title="Export"
        description="Approved releases, track audio, and metadata."
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: '100%' }}>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={() => loadJobs()}
              disabled={loading || creating}
              sx={{ minHeight: 44 }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={creating ? <CircularProgress size={18} color="inherit" /> : <PlayArrow />}
              onClick={openCreateExport}
              disabled={creating || active}
              sx={{ minHeight: 44 }}
            >
              {creating ? 'Starting…' : active ? 'Export Running…' : 'Create Export'}
            </Button>
          </Stack>
        }
      />

      <Paper elevation={0} sx={{ ...premiumSurfaceSx(theme), mb: 4, p: '10px' }}>
        <Tabs
          value={4}
          aria-label="admin release sections"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            px: 1,
            pt: 1,
            borderBottom: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'}`,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 850,
              minHeight: 54,
              borderRadius: 2,
              mx: 0.5,
              color: '#fff',
              '&.Mui-selected': {
                color: '#fff',
              },
            },
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: 999,
              backgroundColor: '#fff',
            },
            '& .MuiTabs-scrollButtons.Mui-disabled': {
              opacity: 0,
              width: 0,
            },
          }}
        >
          {tabItems.map((item, index) => (
            <Tab
              key={item.label}
              component={Link}
              href={item.href}
              icon={item.icon}
              iconPosition="start"
              label={item.label}
              id={`admin-export-tab-${index}`}
              aria-controls={`admin-export-tabpanel-${index}`}
              sx={{
                minHeight: 46,
                minWidth: { xs: 124, sm: 132 },
                mx: 0.5,
                mb: 0.75,
                borderRadius: '14px',
                bgcolor: item.color,
                color: '#fff',
                opacity: index === 4 ? 1 : 0.88,
                boxShadow: index === 4 ? `0 14px 28px ${alpha(item.color, 0.34)}` : 'none',
                transition: 'transform 160ms ease, opacity 160ms ease, box-shadow 160ms ease',
                '&.Mui-selected': {
                  bgcolor: item.color,
                  color: '#fff',
                  opacity: 1,
                },
                '&:hover': {
                  opacity: 1,
                  transform: 'translateY(-1px)',
                },
                '& .MuiTab-iconWrapper': { mr: 0.75 },
              }}
            />
          ))}
        </Tabs>
      </Paper>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} icon={<ErrorOutline />}>
          {error}
        </Alert>
      ) : null}

      <Paper elevation={0} sx={{ ...premiumSurfaceSx(theme), p: { xs: 2, md: 2.5 }, mb: 2 }}>
        {loading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 240 }}>
            <CircularProgress />
          </Box>
        ) : latestJob ? (
          <Stack spacing={2.25}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              alignItems={{ xs: 'stretch', md: 'center' }}
              justifyContent="space-between"
              spacing={1.5}
            >
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Chip
                  icon={<Inventory2 />}
                  color={stateColor[latestJob.state]}
                  label={stateLabel[latestJob.state]}
                  sx={{ fontWeight: 800 }}
                />
                <Chip variant="outlined" label={`Scope: ${latestJob.scope}`} />
                {latestJob.criteria?.statuses?.length ? (
                  <Chip variant="outlined" label={`Status: ${latestJob.criteria.statuses.join(', ')}`} />
                ) : null}
                <Chip variant="outlined" label={`Expires: ${formatDate(latestJob.expiresAt)}`} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Started {formatDate(latestJob.startedAt || latestJob.createdAt)}
              </Typography>
            </Stack>

            {active ? <LinearProgress aria-label="Catalog export running" /> : null}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
                gap: 1.25,
              }}
            >
              {metrics.map((metric) => (
                <Paper
                  key={metric.label}
                  elevation={0}
                  sx={{
                    p: 1.75,
                    borderRadius: '16px',
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.025)',
                    position: 'relative',
                    overflow: 'hidden',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      bgcolor: metric.accent,
                    },
                  }}
                >
                  <Typography variant="caption" color="text.secondary" fontWeight={850}>
                    {metric.label}
                  </Typography>
                  <Typography variant="h5" fontWeight={950} sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(metric.value)}
                  </Typography>
                </Paper>
              ))}
            </Box>

            {latestJob.errors?.length ? (
              <Alert severity="error">
                {latestJob.errors[0]}
              </Alert>
            ) : null}

            {latestJob.counts.missing > 0 ? (
              <Alert severity="warning">
                {formatNumber(latestJob.counts.missing)} files were recorded in the missing-file report.
              </Alert>
            ) : null}
          </Stack>
        ) : (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Archive sx={{ fontSize: 42, color: 'text.secondary', mb: 1 }} />
            <Typography fontWeight={900}>No exports yet</Typography>
            <Typography color="text.secondary" variant="body2">
              Create the first approved catalog export.
            </Typography>
          </Box>
        )}
      </Paper>

      <Paper elevation={0} sx={{ ...premiumSurfaceSx(theme), overflow: 'hidden' }}>
        <Box sx={{ px: 2.25, py: 1.75, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6" fontWeight={950}>
            ZIP Parts
          </Typography>
        </Box>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="catalog export zip parts" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 850 }}>File</TableCell>
                <TableCell sx={{ fontWeight: 850 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 850 }}>Tracks</TableCell>
                <TableCell sx={{ fontWeight: 850 }}>Size</TableCell>
                <TableCell sx={{ fontWeight: 850 }}>Created</TableCell>
                <TableCell align="right" sx={{ fontWeight: 850 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {downloadable.length ? (
                downloadable.map((part) => (
                  <TableRow key={part.name} hover>
                    <TableCell>
                      <Tooltip title={part.name}>
                        <Typography
                          variant="body2"
                          fontWeight={800}
                          sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {part.name}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" label={part.type === 'metadata' ? 'Metadata' : 'Tracks'} />
                    </TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumber(part.trackCount)}
                    </TableCell>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatBytes(part.size)}
                    </TableCell>
                    <TableCell>{formatDate(part.createdAt)}</TableCell>
                    <TableCell align="right">
                      <Button
                        component="a"
                        href={`/api/admin/export/catalog/${latestJob?._id}/files/${encodeURIComponent(part.name)}`}
                        variant="outlined"
                        size="small"
                        startIcon={<CloudDownload />}
                        download
                        sx={{ minHeight: 40 }}
                      >
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Box sx={{ py: 5, textAlign: 'center' }}>
                      <Typography fontWeight={850}>No ZIP parts ready</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Running jobs add files here when each part closes.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog
        open={exportOpen}
        onClose={() => {
          setExportOpen(false);
          resetExportDialog();
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 950 }}>Create Catalog Export</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              select
              label="Export scope"
              value={exportScope}
              onChange={(event) => {
                setExportScope(event.target.value as 'release' | 'user' | 'users' | 'status');
                setSelectedReleaseId('');
                setSelectedUserId('');
                setSelectedUserIds([]);
                setSelectedUserReleaseIds([]);
              }}
              fullWidth
            >
              <MenuItem value="status">All releases by status</MenuItem>
              <MenuItem value="user">Pending releases for a user</MenuItem>
              <MenuItem value="users">Selected users</MenuItem>
              <MenuItem value="release">Single release</MenuItem>
            </TextField>

            {exportScope === 'status' ? (
              <TextField
                select
                label="Status"
                value={exportStatus}
                onChange={(event) => setExportStatus(event.target.value as typeof exportStatus)}
                fullWidth
              >
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
                <MenuItem value="all">All statuses</MenuItem>
              </TextField>
            ) : null}

            {exportScope === 'user' ? (
              <>
                <TextField
                  select
                  label="User"
                  value={selectedUserId}
                  onChange={(event) => {
                    setSelectedUserId(event.target.value);
                    setSelectedUserReleaseIds([]);
                  }}
                  fullWidth
                >
                  {userOptions.map((user) => (
                    <MenuItem key={user.id} value={user.id}>
                      {[user.label, user.email].filter(Boolean).join(' - ')}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  label="Pending releases"
                  value={selectedUserReleaseIds}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedUserReleaseIds(
                      typeof value === 'string' ? value.split(',') : value as string[]
                    );
                  }}
                  disabled={!selectedUserId || pendingUserReleases.length === 0}
                  SelectProps={{
                    multiple: true,
                    renderValue: (selected) => {
                      const ids = selected as string[];
                      return ids
                        .map((id) => {
                          const release = pendingUserReleases.find((item) => String(item._id) === id);
                          return release?.releaseTitle || release?.title || id;
                        })
                        .join(', ');
                    },
                  }}
                  helperText={
                    !selectedUserId
                      ? 'Select a user to load pending releases.'
                      : pendingUserReleases.length === 0
                        ? 'No pending releases found for this user.'
                        : 'Select one or more pending releases to export.'
                  }
                  fullWidth
                >
                  {pendingUserReleases.map((release) => {
                    const releaseId = String(release._id);
                    const title = release.releaseTitle || release.title || 'Untitled release';
                    const trackCount = Number(release.trackCount ?? (Array.isArray(release.tracks) ? release.tracks.length : 0));
                    const exported = exportedReleaseIds.has(releaseId);
                    return (
                      <MenuItem key={releaseId} value={releaseId}>
                        <Checkbox checked={selectedUserReleaseIds.includes(releaseId)} />
                        <ListItemText
                          primary={title}
                          secondary={[
                            release.primaryArtist || release.artist,
                            `${trackCount} track${trackCount === 1 ? '' : 's'}`,
                          ].filter(Boolean).join(' - ')}
                        />
                        {exported ? (
                          <Chip
                            size="small"
                            icon={<CheckCircle />}
                            label="Exported"
                            color="success"
                            variant="outlined"
                            sx={{ ml: 1 }}
                          />
                        ) : null}
                      </MenuItem>
                    );
                  })}
                </TextField>
              </>
            ) : null}

            {exportScope === 'users' ? (
              <TextField
                select
                label="Users"
                value={selectedUserIds}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedUserIds(typeof value === 'string' ? value.split(',') : value as string[]);
                }}
                SelectProps={{
                  multiple: true,
                  renderValue: (selected) => {
                    const ids = selected as string[];
                    return ids
                      .map((id) => userOptions.find((user) => user.id === id)?.label || id)
                      .join(', ');
                  },
                }}
                helperText="Creates one parent ZIP containing user-named ZIP files."
                fullWidth
              >
                {userOptions.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    <Checkbox checked={selectedUserIds.includes(user.id)} />
                    <ListItemText
                      primary={user.label}
                      secondary={user.email}
                    />
                  </MenuItem>
                ))}
              </TextField>
            ) : null}

            {exportScope === 'release' ? (
              <TextField
                select
                label="Release"
                value={selectedReleaseId}
                onChange={(event) => setSelectedReleaseId(event.target.value)}
                fullWidth
              >
                {releases.map((release) => (
                  <MenuItem key={release._id} value={release._id}>
                    {[release.releaseTitle || release.title || 'Untitled release', release.ownerName || release.ownerArtistName].filter(Boolean).join(' - ')}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}

            <Alert severity="info">
              {exportScope === 'users'
                ? 'Selected user exports create a parent ZIP with one ZIP per user plus metadata.'
                : exportScope === 'user'
                  ? 'Only the selected pending releases for this user will be exported. Releases already exported once are marked.'
                : 'Exports are created as release-named ZIP files. Metadata includes user name and email.'}
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => {
              setExportOpen(false);
              resetExportDialog();
            }}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateExport}
            disabled={!canCreateExport}
            startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
          >
            {creating ? 'Starting' : 'Create Export'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
