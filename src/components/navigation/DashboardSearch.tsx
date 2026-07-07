'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Album,
  Close,
  Dashboard,
  HeadsetMic,
  MusicNote,
  Person,
  Search,
  Settings,
  Upload,
} from '@mui/icons-material';
import { adminAPI } from '@/services/api';

type DashboardSearchProps = {
  audience: 'admin' | 'user';
  iconColor?: string;
};

type SearchResult = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
};

const adminPages: SearchResult[] = [
  { id: 'admin-dashboard', label: 'Dashboard', description: 'Review command center', href: '/admin/dashboard', icon: <Dashboard /> },
  { id: 'admin-users', label: 'Users', description: 'Accounts and KYC', href: '/admin/users', icon: <Person /> },
  { id: 'admin-releases', label: 'Releases', description: 'Catalog review queue', href: '/admin/releases', icon: <Album /> },
  { id: 'admin-deliveries', label: 'DSP Deliveries', description: 'Provider delivery jobs', href: '/admin/dsp-deliveries', icon: <Upload /> },
  { id: 'admin-support', label: 'Support Queue', description: 'User support tickets', href: '/admin/support', icon: <HeadsetMic /> },
  { id: 'admin-settings', label: 'Settings', description: 'Platform configuration', href: '/admin/settings', icon: <Settings /> },
];

const userPages: SearchResult[] = [
  { id: 'user-dashboard', label: 'Dashboard', description: 'Account overview', href: '/dashboard', icon: <Dashboard /> },
  { id: 'user-create-release', label: 'Create New Release', description: 'Start a distribution submission', href: '/dashboard/upload', icon: <Upload /> },
  { id: 'user-releases', label: 'Releases', description: 'Drafts and submitted catalog', href: '/dashboard/releases', icon: <Album /> },
  { id: 'user-support', label: 'Support Center', description: 'Tickets and replies', href: '/dashboard/support', icon: <HeadsetMic /> },
  { id: 'user-settings', label: 'Settings', description: 'Account preferences', href: '/dashboard/settings', icon: <Settings /> },
];

export default function DashboardSearch({ audience, iconColor }: DashboardSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [remoteResults, setRemoteResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(value => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setRemoteResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const search = query.trim();
      try {
        const releasePromise = fetch(`/api/releases?summary=1&page=1&limit=8&search=${encodeURIComponent(search)}`, { cache: 'no-store' })
          .then(response => response.json())
          .then(payload =>
            (payload?.releases || payload?.data || [])
              .map((release: any) => ({
                id: `release-${release._id}`,
                label: release.releaseTitle || release.title || 'Untitled Release',
                description: `${release.primaryArtist || release.ownerName || 'Unknown artist'} · ${release.status || 'pending'}`,
                href:
                  audience === 'admin'
                    ? `/admin/releases/${release._id}`
                    : `/dashboard/releases/${release._id}`,
                icon: <MusicNote />,
              }))
          )
          .catch(() => []);

        const userPromise =
          audience === 'admin'
            ? adminAPI
                .getUsers({ page: 1, limit: 8, search: query.trim() })
                .then(response =>
                  (response?.data?.users || []).map((user: any) => ({
                    id: `user-${user._id}`,
                    label: user.name || user.artistName || user.email,
                    description: `${user.email || ''} · ${user.role || 'user'}`,
                    href: `/admin/users/${user._id}`,
                    icon: <Person />,
                  }))
                )
                .catch(() => [])
            : Promise.resolve([]);

        const [releases, users] = await Promise.all([releasePromise, userPromise]);
        if (!cancelled) setRemoteResults([...users, ...releases]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [audience, open, query]);

  const pageResults = useMemo(() => {
    const pages = audience === 'admin' ? adminPages : userPages;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return pages;
    return pages.filter(page =>
      `${page.label} ${page.description}`.toLowerCase().includes(normalized)
    );
  }, [audience, query]);

  const results = [...pageResults, ...remoteResults];
  const navigate = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <>
      <Tooltip title="Search">
        <IconButton
          size="small"
          aria-label="Search dashboard"
          onClick={() => setOpen(true)}
          sx={{ width: 36, height: 36, color: iconColor }}
        >
          <Search sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 2, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography fontWeight={900}>Search</Typography>
            <IconButton aria-label="Close search" onClick={() => setOpen(false)} size="small">
              <Close />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ px: 2, pb: 1.5 }}>
            <TextField
              autoFocus
              fullWidth
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search pages, releases, or users…"
              inputProps={{ 'aria-label': 'Search pages, releases, or users' }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
                endAdornment: loading ? <CircularProgress size={18} /> : null,
              }}
            />
          </Box>
          <Divider />
          {results.length ? (
            <List sx={{ maxHeight: 460, overflowY: 'auto', py: 0.75 }}>
              {results.map(result => (
                <ListItemButton
                  key={result.id}
                  onClick={() => navigate(result.href)}
                  sx={{ mx: 0.75, borderRadius: 1.5, minHeight: 58 }}
                >
                  <Avatar
                    variant="rounded"
                    sx={{ mr: 1.5, width: 36, height: 36, bgcolor: 'action.selected', color: 'primary.main' }}
                  >
                    {result.icon}
                  </Avatar>
                  <ListItemText
                    primary={result.label}
                    secondary={result.description}
                    primaryTypographyProps={{ fontWeight: 800, noWrap: true }}
                    secondaryTypographyProps={{ noWrap: true }}
                  />
                </ListItemButton>
              ))}
            </List>
          ) : (
            <Box sx={{ px: 3, py: 5, textAlign: 'center' }}>
              <Typography fontWeight={800}>No results</Typography>
              <Typography variant="body2" color="text.secondary">
                Try a release title, artist, user, or dashboard section.
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
