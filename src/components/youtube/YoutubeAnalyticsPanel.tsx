'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import {
  GroupAdd,
  PlayCircle,
  Public,
  QueryStats,
  SwapVert,
  Sync,
  Traffic,
} from '@mui/icons-material';
import {
  PremiumHeader,
  PremiumMetric,
  PremiumPanel,
  premiumSurfaceSx,
} from '@/components/premium/PremiumSurface';
import { formatYoutubeMetric } from '@/lib/youtube';

type RangeKey = '7d' | '28d' | '90d';
type Metrics = {
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
};
type ChannelOption = {
  id: string;
  channelTitle: string;
  thumbnail: string;
  analyticsAccessStatus: string;
  analyticsSyncStatus: string;
  lastAnalyticsSyncedAt?: string;
  analyticsError?: string;
};
type DailyRow = Metrics & { date: string };
type BreakdownRow = Metrics & { dimensionKey: string; dimensions: Record<string, string> };
type TopVideo = Metrics & { videoId: string; title: string; thumbnail: string };
type DashboardPayload = {
  channels: ChannelOption[];
  selectedChannelId: string;
  summary: Metrics;
  daily: DailyRow[];
  breakdowns: Record<string, BreakdownRow[]>;
  topVideos: TopVideo[];
  sync: {
    syncStatus: string;
    reauthorizationRequired?: boolean;
    analyticsAccessStatus: string;
    lastSuccessfulSyncAt?: string;
    error?: string;
  };
};
type ApiPayload = { success?: boolean; data?: DashboardPayload; error?: string };

export function YoutubeAnalyticsPanel({
  apiPath,
  initialChannelId,
  admin = false,
  showHeader = true,
}: {
  apiPath: string;
  initialChannelId?: string;
  admin?: boolean;
  showHeader?: boolean;
}) {
  const [range, setRange] = useState<RangeKey>('28d');
  const [channelId, setChannelId] = useState(initialChannelId || '');
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (initialChannelId) setChannelId(initialChannelId);
  }, [initialChannelId]);

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ range });
      if (channelId) params.set('channelId', channelId);
      const response = await fetch(`${apiPath}?${params.toString()}`, {
        cache: 'no-store',
        signal,
      });
      const payload = (await response.json().catch(() => null)) as ApiPayload | null;
      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.error || 'Failed to load YouTube analytics');
      }
      setData(payload.data);
      if (!channelId && payload.data.selectedChannelId)
        setChannelId(payload.data.selectedChannelId);
    } catch (err) {
      if (!signal?.aborted)
        setError(err instanceof Error ? err.message : 'Failed to load YouTube analytics');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [apiPath, channelId, range]);

  const handleSync = async (scope: 'channel' | 'all') => {
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/youtube/analytics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          channelId: scope === 'channel' ? channelId : undefined,
          windowDays: 90,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success)
        throw new Error(payload?.error || 'Failed to queue sync');
      setNotice(scope === 'all' ? 'Network sync queued.' : 'Channel sync queued.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue sync');
    } finally {
      setSyncing(false);
    }
  };

  const summary = data?.summary;
  const netSubscribers = (summary?.subscribersGained || 0) - (summary?.subscribersLost || 0);
  const maxViews = Math.max(1, ...(data?.daily || []).map(row => row.views));
  const issueCount = (data?.channels || []).filter(
    channel =>
      ['failed', 'stale', 'never_synced'].includes(channel.analyticsSyncStatus) ||
      channel.analyticsAccessStatus !== 'active'
  ).length;

  const controls = (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
      <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 240 } }}>
        <InputLabel>Channel</InputLabel>
        <Select
          label="Channel"
          value={channelId}
          onChange={event => setChannelId(event.target.value)}
        >
          {(data?.channels || []).map(channel => (
            <MenuItem key={channel.id} value={channel.id}>
              {channel.channelTitle}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <ToggleButtonGroup
        value={range}
        exclusive
        size="small"
        onChange={(_, value) => value && setRange(value)}
      >
        <ToggleButton value="7d">7D</ToggleButton>
        <ToggleButton value="28d">28D</ToggleButton>
        <ToggleButton value="90d">90D</ToggleButton>
      </ToggleButtonGroup>
      {admin ? (
        <>
          <Button
            variant="outlined"
            startIcon={<Sync />}
            disabled={syncing || !channelId}
            onClick={() => handleSync('channel')}
          >
            Sync Channel
          </Button>
          <Button
            variant="contained"
            startIcon={syncing ? <CircularProgress size={16} /> : <Sync />}
            disabled={syncing}
            onClick={() => handleSync('all')}
          >
            Sync Network
          </Button>
        </>
      ) : null}
    </Stack>
  );

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      {showHeader ? (
        <PremiumHeader
          eyebrow={admin ? 'YouTube Analytics' : 'Creator Analytics'}
          title={admin ? 'YouTube Network Analytics' : 'YouTube Performance'}
          description="Internal YouTube snapshots synced through background workers."
          action={controls}
        />
      ) : (
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 2 }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900 }}>
              YouTube Analytics
            </Typography>
            <Typography sx={{ color: 'text.secondary' }}>
              DB-backed channel performance snapshots.
            </Typography>
          </Box>
          {controls}
        </Stack>
      )}

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
      {data?.sync.reauthorizationRequired ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Reconnect this channel to grant YouTube Analytics access.
        </Alert>
      ) : null}
      {data?.sync.error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {data.sync.error}
        </Alert>
      ) : null}

      {loading ? (
        <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
          <CircularProgress />
          <Typography sx={{ color: 'text.secondary' }}>
            Loading internal analytics snapshots
          </Typography>
        </Stack>
      ) : !data || data.channels.length === 0 ? (
        <PremiumPanel>
          <Typography sx={{ color: 'text.secondary', py: 4 }}>
            No YouTube channels available for analytics.
          </Typography>
        </PremiumPanel>
      ) : (
        <Stack spacing={3}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' },
              gap: 2,
            }}
          >
            <PremiumMetric
              label="Views"
              value={formatYoutubeMetric(summary?.views || 0)}
              hint={`${range.toUpperCase()} selected channel`}
              accent="#ef4444"
            />
            <PremiumMetric
              label="Watch Time"
              value={`${formatYoutubeMetric(summary?.estimatedMinutesWatched || 0)} min`}
              hint="Stored snapshot total"
              accent="#0f766e"
            />
            <PremiumMetric
              label="Net Subscribers"
              value={formatSigned(netSubscribers)}
              hint="Gained minus lost"
              accent="#f59e0b"
            />
            <PremiumMetric
              label={admin ? 'Sync Issues' : 'Engagement'}
              value={
                admin
                  ? issueCount
                  : formatYoutubeMetric(
                      (summary?.likes || 0) + (summary?.comments || 0) + (summary?.shares || 0)
                    )
              }
              hint={admin ? 'Stale, failed, or missing scope' : 'Likes, comments, shares'}
              accent="#2563eb"
            />
          </Box>

          <Box
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 0.9fr' }, gap: 3 }}
          >
            <TrendPanel rows={data.daily} maxViews={maxViews} sync={data.sync} />
            <RankingPanel
              title="Top Videos"
              icon={<PlayCircle />}
              rows={data.topVideos.map(video => ({
                key: video.videoId,
                primary: video.title,
                secondary: `${formatYoutubeMetric(video.estimatedMinutesWatched)} watch minutes`,
                value: formatYoutubeMetric(video.views),
                thumb: video.thumbnail,
              }))}
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
            <BreakdownPanel
              title="Countries"
              icon={<Public />}
              rows={data.breakdowns.country || []}
              dimension="country"
            />
            <BreakdownPanel
              title="Traffic Sources"
              icon={<Traffic />}
              rows={data.breakdowns.trafficSource || []}
              dimension="insightTrafficSourceType"
            />
            <BreakdownPanel
              title="Devices"
              icon={<SwapVert />}
              rows={data.breakdowns.deviceType || []}
              dimension="deviceType"
            />
            <BreakdownPanel
              title="Demographics"
              icon={<GroupAdd />}
              rows={data.breakdowns.demographics || []}
              dimension="ageGroup"
              secondaryDimension="gender"
              valueLabel="viewer %"
            />
          </Box>
        </Stack>
      )}
    </Box>
  );
}

function TrendPanel({
  rows,
  maxViews,
  sync,
}: {
  rows: DailyRow[];
  maxViews: number;
  sync: DashboardPayload['sync'];
}) {
  const theme = useTheme();
  return (
    <Paper sx={{ ...premiumSurfaceSx(theme), p: 2.5 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        style={{ marginBottom: '80px' }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            Daily Views
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Last sync: {sync.lastSuccessfulSyncAt ? formatDate(sync.lastSuccessfulSyncAt) : 'Never'}
          </Typography>
        </Box>
        <Chip
          icon={<QueryStats />}
          label={`${sync.syncStatus} / ${sync.analyticsAccessStatus}`}
          color={sync.syncStatus === 'fresh' ? 'success' : 'default'}
        />
      </Stack>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75, height:"70%" }}>
        {rows.map(row => (
          <Box
            key={row.date}
            title={`${row.date}: ${row.views} views`}
            sx={{ flex: 1, minWidth: 3, height: '100%', display: 'flex', alignItems: 'flex-end' }}
          >
            <Box
              sx={{
                width: '100%',
                height: `${Math.max(4, (row.views / maxViews) * 100)}%`,
                bgcolor: '#ef4444',
                borderRadius: '6px 6px 2px 2px',
                opacity: 0.72,
                '&:hover': { opacity: 1 },
              }}
            />
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function RankingPanel({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: ReactNode;
  rows: Array<{ key: string; primary: string; secondary: string; value: string; thumb?: string }>;
}) {
  const theme = useTheme();
  return (
    <Paper sx={{ ...premiumSurfaceSx(theme), p: 2.5 }}>
      <PanelTitle title={title} icon={icon} />
      <Stack spacing={1.5}>
        {rows.length === 0 ? (
          <EmptyLine />
        ) : (
          rows.slice(0, 10).map((row, index) => (
            <Stack key={row.key} direction="row" spacing={1.5} alignItems="center">
              <Typography sx={{ width: 24, fontWeight: 900, color: 'text.secondary' }}>
                {index + 1}
              </Typography>
              <Box
                sx={{
                  width: 58,
                  height: 36,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                  backgroundImage: row.thumb ? `url(${row.thumb})` : undefined,
                  backgroundSize: 'cover',
                }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontWeight: 900 }}>
                  {row.primary}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {row.secondary}
                </Typography>
              </Box>
              <Typography sx={{ fontWeight: 900 }}>{row.value}</Typography>
            </Stack>
          ))
        )}
      </Stack>
    </Paper>
  );
}

function BreakdownPanel({
  title,
  icon,
  rows,
  dimension,
  secondaryDimension,
  valueLabel = 'views',
}: {
  title: string;
  icon: ReactNode;
  rows: BreakdownRow[];
  dimension: string;
  secondaryDimension?: string;
  valueLabel?: string;
}) {
  const theme = useTheme();
  const max = Math.max(1, ...rows.map(row => row.views));
  return (
    <Paper sx={{ ...premiumSurfaceSx(theme), p: 2.5 }}>
      <PanelTitle title={title} icon={icon} />
      <Stack spacing={1.35}>
        {rows.length === 0 ? (
          <EmptyLine />
        ) : (
          rows.slice(0, 8).map(row => {
            const label = [
              row.dimensions?.[dimension],
              secondaryDimension ? row.dimensions?.[secondaryDimension] : '',
            ]
              .filter(Boolean)
              .join(' / ');
            return (
              <Box key={row.dimensionKey}>
                <Stack direction="row" justifyContent="space-between" spacing={2}>
                  <Typography noWrap sx={{ fontWeight: 800 }}>
                    {label || row.dimensionKey}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {valueLabel === 'viewer %'
                      ? `${row.views.toFixed(1)}%`
                      : formatYoutubeMetric(row.views)}
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    mt: 0.7,
                    height: 6,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      height: 1,
                      width: `${Math.max(2, (row.views / max) * 100)}%`,
                      bgcolor: '#0f766e',
                    }}
                  />
                </Box>
              </Box>
            );
          })
        )}
      </Stack>
    </Paper>
  );
}

function PanelTitle({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
      <Box sx={{ display: 'grid', placeItems: 'center', color: '#ef4444' }}>{icon}</Box>
      <Typography variant="h6" sx={{ fontWeight: 900 }}>
        {title}
      </Typography>
    </Stack>
  );
}

function EmptyLine() {
  return <Typography sx={{ color: 'text.secondary', py: 2 }}>No synced data yet.</Typography>;
}

function formatSigned(value: number) {
  if (value > 0) return `+${formatYoutubeMetric(value)}`;
  return formatYoutubeMetric(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}
