'use client';

import { Suspense } from 'react';
import { Box, LinearProgress } from '@mui/material';
import { useSearchParams } from 'next/navigation';
import { YoutubeAnalyticsPanel } from '@/components/youtube/YoutubeAnalyticsPanel';
import RouteTabs from '@/components/navigation/RouteTabs';

function YoutubeNetworkAnalyticsContent() {
  const searchParams = useSearchParams();
  return (
    <Box sx={{ width: '100%' }}>
      <RouteTabs
        ariaLabel="youtube network sections"
        items={[
          { label: 'Channels', href: '/dashboard/youtube-network' },
          { label: 'Analytics', href: '/dashboard/youtube-network/analytics' },
        ]}
      />
      <YoutubeAnalyticsPanel
        apiPath="/api/youtube/analytics"
        initialChannelId={searchParams.get('channelId') || undefined}
        showHeader
      />
    </Box>
  );
}

export default function YoutubeNetworkAnalyticsPage() {
  return (
    <Suspense fallback={<LinearProgress />}>
      <YoutubeNetworkAnalyticsContent />
    </Suspense>
  );
}
