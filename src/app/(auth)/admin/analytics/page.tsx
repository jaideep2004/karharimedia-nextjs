'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Box, CircularProgress, Paper, Typography } from '@mui/material';
import dynamic from 'next/dynamic';
import { adminAPI, releaseAPI, trackAPI } from '@/services/api';
import { PremiumHeader } from '@/components/premium/PremiumSurface';
import { registerChartElements } from './registerChartElements';

const Bar = dynamic(() => import('react-chartjs-2').then((mod) => mod.Bar), { ssr: false });
const Pie = dynamic(() => import('react-chartjs-2').then((mod) => mod.Pie), { ssr: false });
const Line = dynamic(() => import('react-chartjs-2').then((mod) => mod.Line), { ssr: false });

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [releaseData, setReleaseData] = useState<any[]>([]);
  const [trackData, setTrackData] = useState<any[]>([]);
  const [userData, setUserData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    registerChartElements();
    setChartReady(true);
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [releasesRes, tracksRes, usersRes] = await Promise.all([
          releaseAPI.getReleases({ summary: '1' }),
          trackAPI.getTracks(),
          adminAPI.getUsers(),
        ]);
        setReleaseData(releasesRes.data || []);
        setTrackData(tracksRes.data || []);
        setUserData((usersRes.data && (usersRes.data.users || usersRes.data)) || []);
      } catch {
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const releaseStatusCounts = releaseData.reduce((acc, release) => {
    acc[release.status] = (acc[release.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const userRoleCounts = userData.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const releasesPerMonth = releaseData.reduce((acc, release) => {
    const date = new Date(release.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const tracksPerRelease = releaseData.map((release) =>
    Number(release.trackCount ?? (Array.isArray(release.tracks) ? release.tracks.length : 0))
  );
  const chartColors = ['#42a5f5', '#66bb6a', '#ffa726', '#ef5350', '#ab47bc', '#26c6da', '#d4e157', '#ff7043'];
  const cardSize = { xs: 320, sm: 380, md: 440 } as const;

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <PremiumHeader
        eyebrow="Intelligence"
        title="Analytics Dashboard"
        description="Operating charts for release status, users, monthly volume, tracks, and catalog depth."
      />
      {loading || !chartReady ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 4, justifyItems: 'center' }}>
          <ChartCard title="Releases by Status" cardSize={cardSize}>
            <Pie data={{ labels: Object.keys(releaseStatusCounts), datasets: [{ data: Object.values(releaseStatusCounts), backgroundColor: chartColors, borderWidth: 1 }] }} options={chartOptions('pie')} />
          </ChartCard>
          <ChartCard title="User Roles Distribution" cardSize={cardSize}>
            <Bar data={{ labels: Object.keys(userRoleCounts), datasets: [{ label: 'Users', data: Object.values(userRoleCounts), backgroundColor: chartColors }] }} options={chartOptions('bar')} />
          </ChartCard>
          <ChartCard title="Releases Per Month" cardSize={cardSize}>
            <Line data={{ labels: Object.keys(releasesPerMonth), datasets: [{ label: 'Releases', data: Object.values(releasesPerMonth), fill: true, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.3)', tension: 0.4 }] }} options={chartOptions('line')} />
          </ChartCard>
          <ChartCard title="Tracks Per Release" cardSize={cardSize}>
            <Bar data={{ labels: releaseData.map((release, index) => release.releaseTitle || `Release ${index + 1}`), datasets: [{ label: 'Tracks', data: tracksPerRelease, backgroundColor: chartColors }] }} options={chartOptions('bar')} />
          </ChartCard>
        </Box>
      )}
    </Box>
  );
}

function ChartCard({ title, cardSize, children }: { title: string; cardSize: Record<string, number>; children: ReactNode }) {
  return (
    <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <Paper sx={{ p: 2, borderRadius: 3, boxShadow: 6, background: 'linear-gradient(135deg, #334155 0%, #111827 100%)', width: cardSize, height: cardSize, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" color="white" gutterBottom sx={{ px: 1 }}>{title}</Typography>
        <Box sx={{ flex: 1, minHeight: 0 }}>{children}</Box>
      </Paper>
    </Box>
  );
}

function chartOptions(kind: 'pie' | 'bar' | 'line') {
  return {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: kind !== 'bar', labels: { color: 'white' } },
      tooltip: { enabled: true },
    },
    scales: kind === 'pie' ? undefined : {
      x: { ticks: { color: 'white' } },
      y: { ticks: { color: 'white' }, beginAtZero: true },
    },
  };
}
