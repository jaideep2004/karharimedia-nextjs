'use client';

import type { ReactNode } from 'react';
import { Box, Paper, Tab, Tabs, useTheme } from '@mui/material';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface RouteTabItem {
  label: string;
  href: string;
  matchPath?: string;
}

function splitHref(href: string) {
  const [path, query = ''] = href.split('?');
  return { path, query: new URLSearchParams(query) };
}

function tabMatches(item: RouteTabItem, pathname: string, searchParams: URLSearchParams) {
  const { path, query } = splitHref(item.href);
  const matchPath = item.matchPath || path;
  const matchesPath = item.matchPath
    ? pathname === matchPath || pathname.startsWith(`${matchPath}/`)
    : pathname === path;
  if (!matchesPath) return false;

  const keys = Array.from(query.keys());
  if (keys.length === 0) {
    return !searchParams.get('status') && !searchParams.get('view') && !searchParams.get('tab');
  }

  return keys.every(key => searchParams.get(key) === query.get(key));
}

export default function RouteTabs({
  items,
  ariaLabel,
  action,
}: {
  items: RouteTabItem[];
  ariaLabel: string;
  action?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const readonlySearchParams = useSearchParams();
  const theme = useTheme();
  const searchParams = new URLSearchParams(readonlySearchParams.toString());
  const active = items.find(item => tabMatches(item, pathname, searchParams))?.href || items[0]?.href || false;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 2.5,
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: isDark ? 'rgba(15,23,42,0.78)' : 'rgba(255,255,255,0.88)',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          gap: 1,
          minWidth: 0,
        }}
      >
        <Tabs
          value={active}
          onChange={(_event, href) => router.push(href)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label={ariaLabel}
          sx={{
            flex: 1,
            minWidth: 0,
            px: 1,
            minHeight: 46,
            '& .MuiTab-root': {
              minHeight: 46,
              textTransform: 'none',
              fontWeight: 850,
              letterSpacing: 0,
            },
          }}
        >
          {items.map(item => (
            <Tab key={item.href} value={item.href} label={item.label} />
          ))}
        </Tabs>
        {action ? (
          <Box
            sx={{
              px: { xs: 1, md: 1.25 },
              py: { xs: 1, md: 0.75 },
              display: 'flex',
              justifyContent: { xs: 'stretch', md: 'flex-end' },
              '& > *': {
                width: { xs: '100%', md: 'auto' },
              },
            }}
          >
            {action}
          </Box>
        ) : null}
      </Box>
    </Paper>
  );
}
