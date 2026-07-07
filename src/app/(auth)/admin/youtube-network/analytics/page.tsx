'use client';

import { Suspense } from 'react';
import { Box, LinearProgress } from '@mui/material';
import { useSearchParams } from 'next/navigation';
import { YoutubeAnalyticsPanel } from '@/components/youtube/YoutubeAnalyticsPanel';
import RouteTabs from '@/components/navigation/RouteTabs';

function AdminYoutubeNetworkAnalyticsContent() {
  const searchParams = useSearchParams();
  return (
    <Box sx={{ width: '100%' }}>
      <RouteTabs
        ariaLabel="admin youtube network sections"
        items={[
          { label: 'Channels', href: '/admin/youtube-network' },
          { label: 'Analytics', href: '/admin/youtube-network/analytics' },
        ]}
      />
      <YoutubeAnalyticsPanel
        apiPath="/api/admin/youtube/analytics"
        initialChannelId={searchParams.get('channelId') || undefined}
        admin
        showHeader
      />
    </Box>
  );
}

export default function AdminYoutubeNetworkAnalyticsPage() {
  return (
    <Suspense fallback={<LinearProgress />}>
      <AdminYoutubeNetworkAnalyticsContent />
    </Suspense>
  );
}
