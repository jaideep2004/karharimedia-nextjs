'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge, Box, Fab, Tooltip, useTheme } from '@mui/material';
import { ChatBubble, SupportAgent } from '@mui/icons-material';
import { useNotifications } from '@/context/NotificationsContext';
import { countUnreadSupportNotifications } from '@/components/support/supportNotifications';

export default function FloatingSupportButton({
  href = '/dashboard/support',
  label = 'Open support chat',
}: {
  href?: string;
  label?: string;
}) {
  const theme = useTheme();
  const pathname = usePathname();
  const { notifications } = useNotifications();
  const previousCount = useRef(0);
  const [pulse, setPulse] = useState(false);

  const unreadSupportCount = useMemo(() => countUnreadSupportNotifications(notifications), [notifications]);

  useEffect(() => {
    if (unreadSupportCount > previousCount.current) {
      setPulse(true);
      const timer = window.setTimeout(() => setPulse(false), 1100);
      previousCount.current = unreadSupportCount;
      return () => window.clearTimeout(timer);
    }
    previousCount.current = unreadSupportCount;
    return undefined;
  }, [unreadSupportCount]);

  if (pathname.startsWith(href)) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        right: { xs: 18, sm: 28 },
        bottom: { xs: 18, sm: 28 },
        zIndex: theme.zIndex.tooltip,
        '@keyframes supportPulse': {
          '0%': { transform: 'scale(1)', boxShadow: '0 18px 42px rgba(17,24,39,0.24)' },
          '45%': { transform: 'scale(1.08)', boxShadow: '0 0 0 12px rgba(20,184,166,0.18), 0 22px 50px rgba(17,24,39,0.28)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 18px 42px rgba(17,24,39,0.24)' },
        },
      }}
    >
      <Tooltip title={label} placement="left">
        <Badge
          badgeContent={unreadSupportCount}
          color="error"
          overlap="circular"
          sx={{
            '& .MuiBadge-badge': {
              minWidth: 22,
              height: 22,
              fontWeight: 900,
              border: '2px solid',
              borderColor: 'background.paper',
            },
          }}
        >
          <Fab
            component={Link}
            href={href}
            aria-label={label}
            sx={{
              width: { xs: 58, sm: 66 },
              height: { xs: 58, sm: 66 },
              color: '#04111f',
              bgcolor: '#38f0c1',
              backgroundImage: 'linear-gradient(135deg, #38f0c1, #facc15)',
              boxShadow: '0 18px 42px rgba(17,24,39,0.24)',
              animation: pulse ? 'supportPulse 1000ms ease' : 'none',
              '&:hover': {
                bgcolor: '#45ffd0',
                backgroundImage: 'linear-gradient(135deg, #45ffd0, #fde047)',
              },
            }}
          >
            {pulse ? <ChatBubble /> : <SupportAgent />}
          </Fab>
        </Badge>
      </Tooltip>
    </Box>
  );
}
