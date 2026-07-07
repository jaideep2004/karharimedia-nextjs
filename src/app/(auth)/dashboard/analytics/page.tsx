'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Chip, CircularProgress, Stack, ToggleButton, ToggleButtonGroup, Typography, useTheme } from '@mui/material';
import { PlayCircle, Public, TrendingUp, Visibility } from '@mui/icons-material';
import AuthGuard from '@/components/AuthGuard';
import { DspLogo } from '@/components/dsp/DspLogo';
import { PremiumHeader, PremiumMetric, PremiumPanel } from '@/components/premium/PremiumSurface';

type DspAnalyticsData = {
  hasData: boolean;
  lastSyncedAt?: string | null;
  metrics: {
    totalStreams: number;
    uniqueListeners: number;
    averageDailyStreams: number;
    profileViews: number;
  };
  daily: Array<{ date: string; value: number }>;
  platforms: Array<{ name: string; value: number; pct?: number; color?: string }>;
};

const emptyAnalytics: DspAnalyticsData = {
  hasData: false,
  metrics: { totalStreams: 0, uniqueListeners: 0, averageDailyStreams: 0, profileViews: 0 },
  daily: [],
  platforms: [],
};

const platformColors = ['#1DB954', '#FC3C44', '#FF0000', '#25D1DA', '#8b5cf6', '#94a3b8'];

const formatCompact = (value: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);

export default function AnalyticsPage() {
  return (
    <AuthGuard>
      <AnalyticsContent />
    </AuthGuard>
  );
}

function AnalyticsContent() {
  const theme = useTheme();
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [analytics, setAnalytics] = useState<DspAnalyticsData>(emptyAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isDark = theme.palette.mode === 'dark';
  const currentData = analytics.daily;
  const maxValue = Math.max(1, ...currentData.map((row) => row.value));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(`/api/analytics/dsp?range=${period}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || 'Failed to load DSP analytics');
        }
        if (!cancelled) setAnalytics(payload.data || emptyAnalytics);
      } catch (err) {
        if (!cancelled) {
          setAnalytics(emptyAnalytics);
          setError(err instanceof Error ? err.message : 'Failed to load DSP analytics');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <PremiumHeader
        eyebrow="DSP Analytics"
        title="Analytics"
        description="Streaming, listener, country, and platform performance across DSP distribution."
        action={
          <ToggleButtonGroup value={period} exclusive size="small" onChange={(_, value) => value && setPeriod(value)}>
            <ToggleButton value="7d">7D</ToggleButton>
            <ToggleButton value="30d">30D</ToggleButton>
            <ToggleButton value="90d">90D</ToggleButton>
          </ToggleButtonGroup>
        }
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <PremiumMetric label="Total Streams" value={formatCompact(analytics.metrics.totalStreams)} hint="Across DSPs" accent="#00e7ff" />
        <PremiumMetric label="Unique Listeners" value={formatCompact(analytics.metrics.uniqueListeners)} hint="Reported audience" accent="#10b981" />
        <PremiumMetric label="Avg. Daily Streams" value={formatCompact(analytics.metrics.averageDailyStreams)} hint="Current window" accent="#f59e0b" />
        <PremiumMetric label="Profile Views" value={formatCompact(analytics.metrics.profileViews)} hint="DSP profile visits" accent="#8b5cf6" />
      </Box>

      {error ? (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      ) : null}
      {!loading && !analytics.hasData ? (
        <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
          No Broma statistics report has been synced yet. Use the Broma statistics sync endpoint from admin tooling to load real DSP analytics.
        </Alert>
      ) : null}

      <PremiumPanel sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <TrendingUp sx={{ color: '#00e7ff' }} />
          <Typography variant="h6" sx={{ fontWeight: 900 }}>Stream Activity</Typography>
          <Chip size="small" label="DSP data" />
          {analytics.lastSyncedAt ? (
            <Chip size="small" variant="outlined" label={`Synced ${new Date(analytics.lastSyncedAt).toLocaleDateString()}`} />
          ) : null}
        </Stack>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: loading || currentData.length === 0 ? 'center' : 'flex-start', gap: period === '90d' ? 0.25 : 0.75, height: 210 }}>
          {loading ? (
            <CircularProgress size={28} />
          ) : currentData.length > 0 ? (
            currentData.map((row, index) => (
              <Box key={`${row.date}-${index}`} sx={{ flex: 1, height: `${Math.max(4, (row.value / maxValue) * 100)}%`, bgcolor: '#00e7ff', opacity: 0.7, borderRadius: '6px 6px 2px 2px' }} />
            ))
          ) : (
            <Typography color="text.secondary">Waiting for synced Broma stream data.</Typography>
          )}
        </Box>
      </PremiumPanel>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <PremiumPanel>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <PlayCircle sx={{ color: '#10b981' }} />
            <Typography variant="h6" sx={{ fontWeight: 900 }}>Streams by Platform</Typography>
          </Stack>
          <Stack spacing={1.5}>
            {analytics.platforms.length === 0 ? (
              <Typography color="text.secondary">No platform breakdown synced yet.</Typography>
            ) : analytics.platforms.map((platform, index) => (
              <Box key={platform.name}>
                <Stack direction="row" justifyContent="space-between">
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <DspLogo value={platform.name} alt={platform.name} size={24} padding={0.25} />
                    <Typography sx={{ fontWeight: 800 }}>{platform.name}</Typography>
                  </Stack>
                  <Typography sx={{ color: 'text.secondary' }}>{platform.value.toLocaleString()} ({platform.pct || 0}%)</Typography>
                </Stack>
                <Box sx={{ mt: 0.7, height: 6, borderRadius: 1, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)', overflow: 'hidden' }}>
                  <Box sx={{ width: `${platform.pct || 0}%`, height: '100%', bgcolor: platform.color || platformColors[index % platformColors.length] }} />
                </Box>
              </Box>
            ))}
          </Stack>
        </PremiumPanel>
        <PremiumPanel>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Public sx={{ color: '#f59e0b' }} />
            <Typography variant="h6" sx={{ fontWeight: 900 }}>Audience Notes</Typography>
          </Stack>
          <Stack spacing={1.25} sx={{ color: 'text.secondary' }}>
            <Typography><Visibility fontSize="small" /> Top markets and DSP-level breakdowns remain separate from YouTube Network analytics.</Typography>
            <Typography>YouTube creator analytics live under YouTube Network only.</Typography>
          </Stack>
        </PremiumPanel>
      </Box>
    </Box>
  );
}
