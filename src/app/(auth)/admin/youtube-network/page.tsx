'use client';

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type SyntheticEvent,
} from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
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
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  CheckCircle,
  DoNotDisturb,
  ManageSearch,
  OpenInNew,
  QueryStats,
  Search,
  SettingsSuggest,
  Sync,
  YouTube,
} from '@mui/icons-material';
import { PremiumHeader, PremiumMetric, premiumTableSx } from '@/components/premium/PremiumSurface';
import RouteTabs from '@/components/navigation/RouteTabs';
import {
  formatYoutubeMetric,
  type YoutubeAdminAction,
  type YoutubeChannelView,
  type YoutubeCmsStatus,
  type YoutubeVerificationStatus,
} from '@/lib/youtube';

type AdminPayload = {
  success?: boolean;
  data?: {
    channels?: YoutubeChannelView[];
    total?: number;
    page?: number;
    limit?: number;
  };
  error?: string;
};

type AdminTab = 'all' | YoutubeVerificationStatus;

const tabOptions: Array<{ value: AdminTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const cmsOptions: Array<{ value: 'all' | YoutubeCmsStatus; label: string }> = [
  { value: 'all', label: 'All CMS states' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'processing', label: 'Processing' },
  { value: 'connected', label: 'Connected' },
];

const statusColor: Record<
  YoutubeChannelView['workflowStatus'],
  'default' | 'success' | 'warning' | 'error' | 'info'
> = {
  verification_pending: 'warning',
  under_review: 'info',
  processing: 'info',
  connected: 'success',
  rejected: 'error',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function AdminYouTubeNetworkContent() {
  const theme = useTheme();
  const [channels, setChannels] = useState<YoutubeChannelView[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<AdminTab>('all');
  const [cmsStatus, setCmsStatus] = useState<'all' | YoutubeCmsStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const visibleStats = useMemo(
    () =>
      channels.reduce(
        (acc, channel) => ({
          pending: acc.pending + (channel.verificationStatus === 'pending' ? 1 : 0),
          connected: acc.connected + (channel.cmsStatus === 'connected' ? 1 : 0),
          subscribers: acc.subscribers + channel.subscribers,
        }),
        { pending: 0, connected: 0, subscribers: 0 }
      ),
    [channels]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadChannels() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(page + 1),
          limit: String(rowsPerPage),
        });
        if (activeTab !== 'all') params.set('verificationStatus', activeTab);
        if (cmsStatus !== 'all') params.set('cmsStatus', cmsStatus);
        if (debouncedSearchQuery) params.set('q', debouncedSearchQuery);

        const response = await fetch(`/api/admin/youtube/channels?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as AdminPayload | null;
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || 'Failed to load YouTube channels');
        }

        setChannels(Array.isArray(payload.data?.channels) ? payload.data.channels : []);
        setTotal(Number(payload.data?.total || 0));
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load YouTube channels');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadChannels();
    return () => controller.abort();
  }, [activeTab, cmsStatus, debouncedSearchQuery, page, rowsPerPage]);

  const handleTabChange = (_: SyntheticEvent, value: AdminTab) => {
    setActiveTab(value);
    setPage(0);
  };

  const handleAction = async (channel: YoutubeChannelView, action: YoutubeAdminAction) => {
    setActionLoading(`${channel.id}:${action}`);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/youtube/channels/${channel.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to update YouTube channel');
      }
      const updated = payload.data?.channel as YoutubeChannelView | undefined;
      if (updated) {
        setChannels(current => current.map(item => (item.id === updated.id ? updated : item)));
      }
      setNotice('YouTube channel status updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update YouTube channel');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Box sx={{ width: '100%', py: { xs: 1, sm: 2 } }}>
      <PremiumHeader
        eyebrow="Admin YouTube"
        title="YouTube Network"
        description="Review connected channels, track CMS status, and inspect internal analytics readiness."
      />

      <RouteTabs
        ariaLabel="admin youtube network sections"
        items={[
          { label: 'Channels', href: '/admin/youtube-network' },
          { label: 'Analytics', href: '/admin/youtube-network/analytics' },
        ]}
      />

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          {notice}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          gap: 2,
          mb: 3,
        }}
      >
        <PremiumMetric
          label="Matching Channels"
          value={total}
          hint="Across current filters"
          accent="#ef4444"
        />
        <PremiumMetric
          label="Pending On Page"
          value={visibleStats.pending}
          hint="Awaiting admin review"
          accent="#f59e0b"
        />
        <PremiumMetric
          label="Audience On Page"
          value={formatYoutubeMetric(visibleStats.subscribers)}
          hint="Subscriber total"
          accent="#0f766e"
        />
      </Box>

      <Paper sx={{ ...premiumTableSx(theme), p: { xs: 1.25, sm: 2, md: 2.5 }, overflow: 'hidden' }}>
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={2}
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
          >
            {tabOptions.map(tab => (
              <Tab key={tab.value} value={tab.value} label={tab.label} />
            ))}
          </Tabs>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              size="small"
              placeholder="Search channels, users, emails"
              value={searchQuery}
              onChange={event => {
                setSearchQuery(event.target.value);
                setPage(0);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>CMS Status</InputLabel>
              <Select
                label="CMS Status"
                value={cmsStatus}
                onChange={event => {
                  setCmsStatus(event.target.value as 'all' | YoutubeCmsStatus);
                  setPage(0);
                }}
              >
                {cmsOptions.map(option => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Stack>

        {loading ? <LinearProgress sx={{ mb: 1 }} /> : null}

        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: { xs: 760, md: 1120, lg: 1240 } }}>
            <TableHead>
              <TableRow>
                <TableCell>Channel</TableCell>
                <TableCell>User</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Stats</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Analytics</TableCell>
                <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Connected</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Stack
                      alignItems="center"
                      spacing={1.5}
                      sx={{ py: 5, color: 'text.secondary' }}
                    >
                      <ManageSearch />
                      <Typography>No YouTube channels match these filters.</Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : (
                channels.map(channel => (
                  <TableRow key={channel.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar
                          src={channel.thumbnail}
                          alt={channel.channelTitle}
                          sx={{ bgcolor: '#ef4444' }}
                        >
                          <YouTube />
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 900 }}>{channel.channelTitle}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {channel.channelId}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 800 }}>
                        {channel.user?.name || 'Unknown user'}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', display: 'block' }}
                      >
                        {channel.user?.email || channel.googleAccountEmail}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Google: {channel.googleAccountEmail}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      <Stack spacing={0.25}>
                        <Typography variant="body2">
                          {formatYoutubeMetric(channel.subscribers)} subscribers
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {formatYoutubeMetric(channel.views)} views ·{' '}
                          {formatYoutubeMetric(channel.videos)} videos
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                      <Stack spacing={0.75} alignItems="flex-start">
                        <Chip
                          size="small"
                          color={statusColor[channel.workflowStatus]}
                          label={channel.workflowLabel}
                          sx={{ fontWeight: 800 }}
                        />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          CMS: {channel.cmsStatus.replace('_', ' ')}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.75} alignItems="flex-start">
                        <Chip
                          size="small"
                          variant="outlined"
                          label={channel.analyticsAccessStatus.replace(/_/g, ' ')}
                        />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Sync: {channel.analyticsSyncStatus.replace(/_/g, ' ')}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                      <Typography variant="body2">{formatDate(channel.connectedAt)}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Synced {formatDate(channel.lastSyncedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={0.75}
                        justifyContent="flex-end"
                        style={{ flexWrap: 'wrap' }}
                      >
                        <ActionButton
                          title="Approve"
                          icon={<CheckCircle />}
                          loading={actionLoading === `${channel.id}:approve`}
                          disabled={actionLoading !== null}
                          onClick={() => handleAction(channel, 'approve')}
                        />
                        <ActionButton
                          title="Reject"
                          icon={<DoNotDisturb />}
                          loading={actionLoading === `${channel.id}:reject`}
                          disabled={actionLoading !== null}
                          color="error"
                          onClick={() => handleAction(channel, 'reject')}
                        />
                        <ActionButton
                          title="Mark processing"
                          icon={<SettingsSuggest />}
                          loading={actionLoading === `${channel.id}:mark_processing`}
                          disabled={actionLoading !== null}
                          onClick={() => handleAction(channel, 'mark_processing')}
                        />
                        <ActionButton
                          title="Mark connected"
                          icon={<Sync />}
                          loading={actionLoading === `${channel.id}:mark_connected`}
                          disabled={actionLoading !== null}
                          color="success"
                          onClick={() => handleAction(channel, 'mark_connected')}
                        />
                        <Tooltip title="Open channel">
                          <Button
                            size="small"
                            variant="outlined"
                            href={`https://www.youtube.com/channel/${channel.channelId}`}
                            target="_blank"
                            rel="noreferrer"
                            sx={{ minWidth: 38, px: 1 }}
                          >
                            <OpenInNew fontSize="small" />
                          </Button>
                        </Tooltip>
                        <Tooltip title="Show YouTube analytics">
                          <Button
                            size="small"
                            variant="outlined"
                            href={`/admin/youtube-network/analytics?channelId=${channel.id}`}
                            sx={{ minWidth: 38, px: 1 }}
                          >
                            <QueryStats fontSize="small" />
                          </Button>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[10, 25, 50, 100]}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          onRowsPerPageChange={event => {
            setRowsPerPage(Number(event.target.value));
            setPage(0);
          }}
        />
      </Paper>
    </Box>
  );
}

function ActionButton({
  title,
  icon,
  loading,
  disabled,
  color = 'primary',
  onClick,
}: {
  title: string;
  icon: ReactElement;
  loading: boolean;
  disabled: boolean;
  color?: 'primary' | 'success' | 'error';
  onClick: () => void;
}) {
  return (
    <Tooltip title={title}>
      <span>
        <Button
          size="small"
          variant="outlined"
          color={color}
          onClick={onClick}
          disabled={disabled}
          sx={{ minWidth: 38, px: 1 }}
        >
          {loading ? <CircularProgress size={16} /> : icon}
        </Button>
      </span>
    </Tooltip>
  );
}

export default function AdminYouTubeNetworkPage() {
  return (
    <Suspense fallback={<LinearProgress />}>
      <AdminYouTubeNetworkContent />
    </Suspense>
  );
}
