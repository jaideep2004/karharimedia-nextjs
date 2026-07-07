'use client';

import { Suspense, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Paper,
  Radio,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import {
  AddLink,
  CheckCircle,
  OpenInNew,
  PeopleAlt,
  PlayCircle,
  QueryStats,
  Visibility,
  YouTube,
} from '@mui/icons-material';
import {
  PremiumHeader,
  PremiumMetric,
  PremiumPanel,
  premiumSurfaceSx,
} from '@/components/premium/PremiumSurface';
import RouteTabs from '@/components/navigation/RouteTabs';
import {
  formatYoutubeMetric,
  type YoutubeChannelCandidate,
  type YoutubeChannelView,
} from '@/lib/youtube';

type ChannelsPayload = {
  success?: boolean;
  data?: {
    channels?: YoutubeChannelView[];
  };
  error?: string;
};

type SessionPayload = {
  success?: boolean;
  data?: {
    sessionId: string;
    googleAccountEmail: string;
    channels: YoutubeChannelCandidate[];
    expiresAt: string;
  };
  error?: string;
};

const statusTone: Record<
  YoutubeChannelView['workflowStatus'],
  { color: 'default' | 'success' | 'warning' | 'error' | 'info'; copy: string }
> = {
  verification_pending: { color: 'warning', copy: 'Verification Pending' },
  under_review: { color: 'info', copy: 'Under Review' },
  processing: { color: 'info', copy: 'Processing' },
  connected: { color: 'success', copy: 'Connected' },
  rejected: { color: 'error', copy: 'Rejected' },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function YoutubeNetworkContent() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [channels, setChannels] = useState<YoutubeChannelView[]>([]);
  const [session, setSession] = useState<SessionPayload['data'] | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const totals = useMemo(
    () =>
      channels.reduce(
        (acc, channel) => ({
          subscribers: acc.subscribers + channel.subscribers,
          views: acc.views + channel.views,
          videos: acc.videos + channel.videos,
        }),
        { subscribers: 0, views: 0, videos: 0 }
      ),
    [channels]
  );

  const loadChannels = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/youtube/channels', { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as ChannelsPayload | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to load YouTube channels');
      }
      setChannels(Array.isArray(payload.data?.channels) ? payload.data.channels : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load YouTube channels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, []);

  useEffect(() => {
    const connectSession = searchParams.get('connectSession');
    const youtubeError = searchParams.get('youtubeError');

    if (youtubeError) {
      setError(youtubeError);
      router.replace('/dashboard/youtube-network');
      return;
    }

    if (!connectSession) return;
    const sessionId = connectSession;

    const controller = new AbortController();
    async function loadSession() {
      setSessionLoading(true);
      setError('');
      try {
        const response = await fetch(
          `/api/youtube/oauth/session?sessionId=${encodeURIComponent(sessionId)}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );
        const payload = (await response.json().catch(() => null)) as SessionPayload | null;
        if (!response.ok || !payload?.success || !payload.data) {
          throw new Error(payload?.error || 'Failed to load YouTube channel choices');
        }
        setSession(payload.data);
        setSelectedChannelId(payload.data.channels[0]?.channelId || '');
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load YouTube channel choices');
        }
      } finally {
        if (!controller.signal.aborted) setSessionLoading(false);
      }
    }

    loadSession();
    return () => controller.abort();
  }, [router, searchParams]);

  const handleConnect = () => {
    window.location.assign('/api/youtube/oauth/start');
  };

  const handleSaveSelection = async () => {
    if (!session || !selectedChannelId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/youtube/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, channelId: selectedChannelId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to save YouTube channel');
      }
      setSession(null);
      setSelectedChannelId('');
      setNotice('YouTube channel connected. Verification is pending.');
      router.replace('/dashboard/youtube-network');
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save YouTube channel');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ width: '100%', py: { xs: 1, sm: 2 } }}>
      <PremiumHeader
        eyebrow="YouTube"
        title="YouTube Network"
        description="Connect channels, track review state, and monitor internal analytics sync readiness."
      />

      <RouteTabs
        ariaLabel="youtube network sections"
        action={
          <Button
            variant="contained"
            startIcon={<AddLink />}
            onClick={handleConnect}
            sx={{ minHeight: 42, fontWeight: 900, borderRadius: '12px' }}
          >
            Connect YouTube Channel
          </Button>
        }
        items={[
          { label: 'Channels', href: '/dashboard/youtube-network' },
          { label: 'Analytics', href: '/dashboard/youtube-network/analytics' },
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
      {sessionLoading ? <LinearProgress sx={{ mb: 2 }} /> : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          gap: 2,
          mb: 3,
        }}
      >
        <PremiumMetric
          label="Connected Channels"
          value={channels.length}
          hint="Submitted for admin review"
          accent="#ef4444"
        />
        <PremiumMetric
          label="Subscribers"
          value={formatYoutubeMetric(totals.subscribers)}
          hint="Latest synced channel total"
          accent="#0f766e"
        />
        <PremiumMetric
          label="Views"
          value={formatYoutubeMetric(totals.views)}
          hint="Public channel view count"
          accent="#7c3aed"
        />
      </Box>

      <PremiumPanel sx={{ p: { xs: 2, md: 3 } }}>
        {loading ? (
          <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
            <CircularProgress />
            <Typography sx={{ color: 'text.secondary' }}>Loading connected channels</Typography>
          </Stack>
        ) : channels.length === 0 ? (
          <Stack spacing={2.5} alignItems="flex-start" sx={{ py: { xs: 3, md: 5 } }}>
            <Avatar sx={{ width: 56, height: 56, bgcolor: '#ef4444' }}>
              <YouTube />
            </Avatar>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: 0 }}>
                No YouTube channels connected
              </Typography>
              <Typography sx={{ mt: 0.75, color: 'text.secondary', maxWidth: 680 }}>
                Connect a channel with Google OAuth. The admin team will review it and handle any
                CMS or MCN steps outside the platform.
              </Typography>
            </Box>
            <Button variant="contained" startIcon={<AddLink />} onClick={handleConnect}>
              Connect YouTube Channel
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2}>
            {channels.map(channel => {
              const tone = statusTone[channel.workflowStatus];
              return (
                <Paper
                  key={channel.id}
                  sx={{
                    ...premiumSurfaceSx(theme),
                    borderRadius: 3,
                    p: { xs: 2, md: 2.5 },
                  }}
                >
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={2}
                    alignItems={{ xs: 'flex-start', md: 'center' }}
                  >
                    <Avatar
                      src={channel.thumbnail}
                      alt={channel.channelTitle}
                      sx={{ width: 64, height: 64, bgcolor: '#ef4444' }}
                    >
                      <YouTube />
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ flexWrap: 'wrap', rowGap: 1 }}
                      >
                        <Typography variant="h6" sx={{ fontWeight: 900, minWidth: 0 }}>
                          {channel.channelTitle}
                        </Typography>
                        <Chip
                          size="small"
                          color={tone.color}
                          label={tone.copy}
                          sx={{ fontWeight: 800 }}
                        />
                      </Stack>
                      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                        Connected with {channel.googleAccountEmail} on{' '}
                        {formatDate(channel.connectedAt)}
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}
                      >
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Analytics: ${channel.analyticsAccessStatus.replace(/_/g, ' ')}`}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Sync: ${channel.analyticsSyncStatus.replace(/_/g, ' ')}`}
                        />
                      </Stack>
                    </Box>
                    <Stack
                      direction="row"
                      spacing={1.25}
                      sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}
                    >
                      <MetricChip
                        icon={<PeopleAlt />}
                        label={formatYoutubeMetric(channel.subscribers)}
                      />
                      <MetricChip
                        icon={<Visibility />}
                        label={formatYoutubeMetric(channel.views)}
                      />
                      <MetricChip
                        icon={<PlayCircle />}
                        label={formatYoutubeMetric(channel.videos)}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<OpenInNew />}
                        href={`https://www.youtube.com/channel/${channel.channelId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<QueryStats />}
                        href={`/dashboard/youtube-network/analytics?channelId=${channel.id}`}
                      >
                        Analytics
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </PremiumPanel>

      <Dialog
        open={Boolean(session)}
        onClose={() => (!saving ? setSession(null) : undefined)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>Select YouTube channel</DialogTitle>
        <DialogContent dividers>
          {session ? (
            <Stack spacing={2}>
              <Alert severity="info">Google account: {session.googleAccountEmail}</Alert>
              {session.channels.length === 0 ? (
                <Alert severity="warning">
                  No YouTube channels were found for this Google account.
                </Alert>
              ) : (
                session.channels.map(channel => (
                  <Paper
                    key={channel.channelId}
                    onClick={() => setSelectedChannelId(channel.channelId)}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor:
                        selectedChannelId === channel.channelId ? 'primary.main' : 'divider',
                    }}
                  >
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Radio checked={selectedChannelId === channel.channelId} />
                      <Avatar
                        src={channel.thumbnail}
                        alt={channel.channelTitle}
                        sx={{ width: 52, height: 52 }}
                      >
                        <YouTube />
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 900 }}>{channel.channelTitle}</Typography>
                        <Stack
                          direction="row"
                          spacing={1}
                          divider={<Divider orientation="vertical" flexItem />}
                          sx={{ color: 'text.secondary' }}
                        >
                          <Typography variant="caption">
                            {formatYoutubeMetric(channel.subscribers)} subscribers
                          </Typography>
                          <Typography variant="caption">
                            {formatYoutubeMetric(channel.views)} views
                          </Typography>
                        </Stack>
                      </Box>
                    </Stack>
                  </Paper>
                ))
              )}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setSession(null)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={18} /> : <CheckCircle />}
            onClick={handleSaveSelection}
            disabled={saving || !selectedChannelId || !session?.channels.length}
          >
            Save Channel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function MetricChip({ icon, label }: { icon: ReactElement; label: string }) {
  return (
    <Chip
      icon={icon}
      label={label}
      size="small"
      variant="outlined"
      sx={{ fontWeight: 800, '& .MuiChip-icon': { fontSize: 18 } }}
    />
  );
}

export default function YouTubeNetworkPage() {
  return (
    <Suspense fallback={<LinearProgress />}>
      <YoutubeNetworkContent />
    </Suspense>
  );
}
