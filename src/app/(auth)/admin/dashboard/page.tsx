'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useColorMode } from '@/context/ColorModeContext';
import useAdminAuth from '@/hooks/useAdminAuth';
import { adminAPI, releaseAPI } from '@/services/api';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import { getNormalizedReleaseStatus, getReleaseStatusLabel } from '@/lib/releaseStatus';
import {
  Container,
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack,
  useTheme,
  Skeleton,
  LinearProgress,
} from '@mui/material';
import {
  MusicNote,
  Group,
  MonetizationOn,
  Album,
  BarChart,
  PendingActions,
  CheckCircle,
  Cancel,
  ArrowForward,
  type SvgIconComponent,
} from '@mui/icons-material';

interface DashboardStats {
  totalUsers: number;
  totalTracks: number;
  pendingTracks: number;
  pendingPayouts: number;
  totalRevenue: number;
  totalReleases: number;
  pendingReleases: number;
  releaseCounts?: {
    all?: number;
    pending?: number;
    in_process?: number;
    approved?: number;
    rejected?: number;
    shipped?: number;
    other?: number;
  };
}

interface DashboardUser {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'artist' | string;
  profilePicture?: string;
  createdAt: string;
}

interface DashboardRelease {
  _id: string;
  releaseTitle?: string;
  primaryArtist?: string;
  status: 'approved' | 'pending' | 'rejected' | string;
  trackCount?: number;
  tracks?: unknown[];
  artworkUrl?: string;
  updatedAt: string;
}

interface DashboardUsersResponse {
  users?: DashboardUser[];
}

interface StatCardConfig {
  label: string;
  value: number;
  icon: SvgIconComponent;
  avatarColor: 'primary' | 'secondary' | 'warning' | 'error';
}

const statGridStyles = {
  display: 'grid',
  gap: 2,
  mb: 3,
  gridTemplateColumns: {
    xs: 'repeat(2, minmax(0, 1fr))',
    sm: 'repeat(2, minmax(0, 1fr))',
    md: 'repeat(5, minmax(0, 1fr))',
  },
} as const;

const panelGridStyles = {
  display: 'grid',
  gap: 2.5,
  gridTemplateColumns: {
    xs: '1fr',
    md: 'repeat(2, minmax(0, 1fr))',
  },
} as const;

export default function AdminDashboard() {
  const theme = useTheme();
  const { mode } = useColorMode();
  const isDark = mode === 'dark';
  const { isAdmin, isLoading: isAuthLoading, error: authError } = useAdminAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalTracks: 0,
    pendingTracks: 0,
    pendingPayouts: 0,
    totalRevenue: 0,
    totalReleases: 0,
    pendingReleases: 0,
  });
  const [recentUsers, setRecentUsers] = useState<DashboardUser[]>([]);
  const [recentReleases, setRecentReleases] = useState<DashboardRelease[]>([]);
  const [pendingReleases, setPendingReleases] = useState<DashboardRelease[]>([]);
  const [releaseCounts, setReleaseCounts] = useState({
    all: 0,
    pending: 0,
    in_process: 0,
    approved: 0,
    rejected: 0,
    shipped: 0,
    other: 0,
  });

  // Fetch data on component mount
  useEffect(() => {
    // Only fetch data if admin authentication passed
    if (isAdmin === true) {
      fetchDashboardData();
    }
  }, [isAdmin]);

  // Fetch all dashboard data
  const fetchDashboardData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const defaultStats: DashboardStats = {
        totalUsers: 0,
        totalTracks: 0,
        pendingTracks: 0,
        pendingPayouts: 0,
        totalRevenue: 0,
        totalReleases: 0,
        pendingReleases: 0,
      };

      const [statsResult, usersResult, releasesResult] = await Promise.allSettled([
        adminAPI.getDashboardStats(),
        adminAPI.getUsers({ limit: 5, sort: '-createdAt' }),
        Promise.all([
          releaseAPI.getReleases({ summary: '1', page: 1, limit: 5 }),
          releaseAPI.getReleases({ summary: '1', page: 1, limit: 5, status: 'pending' }),
        ]),
      ]);

      if (statsResult.status === 'fulfilled') {
        const statsResponse = statsResult.value;

        if (statsResponse.success && statsResponse.data) {
          setStats({
            ...defaultStats,
            ...statsResponse.data,
          });
          const syncedCounts = statsResponse.data.releaseCounts;
          if (syncedCounts) {
            setReleaseCounts({
              all: Number(syncedCounts.all || 0),
              pending: Number(syncedCounts.pending || 0),
              in_process: Number(syncedCounts.in_process || 0),
              approved: Number(syncedCounts.approved || 0),
              rejected: Number(syncedCounts.rejected || 0),
              shipped: Number(syncedCounts.shipped || syncedCounts.approved || 0),
              other: Number(syncedCounts.other || 0),
            });
          }
        } else {
          setStats(defaultStats);
        }
      } else {
        console.error('Error fetching dashboard stats:', statsResult.reason);
        setStats(defaultStats);
      }

      if (usersResult.status === 'fulfilled') {
        const usersResponse = usersResult.value;

        if (usersResponse.success && usersResponse.data) {
          const users = (usersResponse.data as DashboardUsersResponse).users || [];

          if (Array.isArray(users) && users.length > 0) {
            setRecentUsers(users);
          } else {
            setRecentUsers([]);
          }
        } else {
          setRecentUsers([]);
        }
      } else {
        console.error('Error fetching users:', usersResult.reason);
        setRecentUsers([]);
      }

      if (releasesResult.status === 'fulfilled') {
        const [recentResponse, pendingResponse] = releasesResult.value;

        setRecentReleases(recentResponse.success && Array.isArray(recentResponse.data)
          ? recentResponse.data as DashboardRelease[]
          : []);
        setPendingReleases(pendingResponse.success && Array.isArray(pendingResponse.data)
          ? pendingResponse.data as DashboardRelease[]
          : []);

        const nextCounts = recentResponse.counts || pendingResponse.counts;
        if (nextCounts) {
            setReleaseCounts({
              all: Number(nextCounts.all || 0),
              pending: Number(nextCounts.pending || 0),
              in_process: Number(nextCounts.in_process || 0),
              approved: Number(nextCounts.approved || 0),
              rejected: Number(nextCounts.rejected || 0),
              shipped: Number((nextCounts as any).shipped || nextCounts.approved || 0),
              other: Number(nextCounts.other || 0),
            });
        }
      } else {
        console.error('Error fetching releases:', releasesResult.reason);
        setRecentReleases([]);
        setPendingReleases([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load dashboard data';
      console.error('Error fetching dashboard data:', error);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const statCards: StatCardConfig[] = [
    { label: 'Total Users', value: stats.totalUsers, icon: Group, avatarColor: 'primary' },
    { label: 'Total Releases', value: releaseCounts.all || stats.totalReleases, icon: Album, avatarColor: 'secondary' },
    { label: 'Total Tracks', value: stats.totalTracks, icon: MusicNote, avatarColor: 'primary' },
    {
      label: 'Pending Approvals',
      value: releaseCounts.pending || stats.pendingReleases,
      icon: PendingActions,
      avatarColor: 'warning',
    },
    {
      label: 'Pending Payouts',
      value: stats.pendingPayouts,
      icon: MonetizationOn,
      avatarColor: 'error',
    },
  ];

  const approvedReleases = releaseCounts.approved;
  const rejectedReleases = releaseCounts.rejected;
  const shippedReleases = releaseCounts.shipped || releaseCounts.approved;
  const reviewLoad =
    releaseCounts.all > 0 ? Math.round((releaseCounts.pending / releaseCounts.all) * 100) : 0;
  const bromaLoad =
    releaseCounts.all > 0 ? Math.round((releaseCounts.in_process / releaseCounts.all) * 100) : 0;
  const surfaceSx = {
    ...premiumSurfaceSx(theme),
    borderRadius: '14px',
    bgcolor: isDark ? '#111827' : '#ffffff',
    backgroundImage: 'none',
    boxShadow: isDark ? '0 18px 44px rgba(0,0,0,0.18)' : '0 18px 44px rgba(15,23,42,0.06)',
  };
  const headingText = isDark ? '#f1f5f9' : '#0f172a';
  const mutedText = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.52)';
  const featureHeadingSx = {
    fontWeight: 900,
    color: headingText, 
    letterSpacing: 0, 
    fontSize: '1.2rem',
  };
  const sectionHeadingSx = {
    fontWeight: 700,
    fontSize: '1rem',
    color: headingText,
    letterSpacing: 0,
  };
  const statAccent: Record<StatCardConfig['avatarColor'], { color: string; bg: string }> = {
    primary: { color: '#00e7ff', bg: isDark ? 'rgba(0,231,255,0.16)' : 'rgba(0,231,255,0.10)' },
    secondary: { color: '#f59e0b', bg: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.10)' },
    warning: { color: '#f59e0b', bg: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.10)' },
    error: { color: '#fb7185', bg: isDark ? 'rgba(251,113,133,0.14)' : 'rgba(251,113,133,0.10)' },
  };

  // Render auth loading state
  if (isAuthLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '70vh',
        }}
      >
        <CircularProgress sx={{ mb: 2 }} />
        <Typography>Verifying admin access...</Typography>
      </Box>
    );
  }

  // Render auth error state
  if (authError) {
    return (
      <Container maxWidth={false}>
        <Alert severity="error" sx={{ mt: 4 }}>
          {authError}
        </Alert>
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Button variant="contained" component={Link} href="/login">
            Back to Login
          </Button>
        </Box>
      </Container>
    );
  }

  // If not admin, don't render anything (redirection happens in hook)
  if (isAdmin === false) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Render loading state
  if (isLoading) {
    return (
      <Container maxWidth={false} disableGutters sx={{ py: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Skeleton variant="text" width={300} height={40} />
          <Skeleton variant="text" width={200} height={20} />
        </Box>

        <Box sx={statGridStyles}>
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} variant="rounded" height={120} />
          ))}
        </Box>

        <Box sx={panelGridStyles}>
          <Skeleton variant="rounded" height={300} />
          <Skeleton variant="rounded" height={300} />
        </Box>

        <Box sx={{ mt: 3 }}>
          <Skeleton variant="rounded" height={400} />
        </Box>
      </Container>
    );
  }

  // Render error state
  if (error) {
    return (
      <Container maxWidth={false}>
        <Alert severity="error" sx={{ mt: 4 }}>
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container
      maxWidth={false}
      disableGutters
      sx={{ py: 0, pl: 0, pr: 0 }}
    >
      <PremiumHeader
        eyebrow="Admin Command Center"
        title="Admin Dashboard"
        description="Review queues, payout risk, delivery status, and user activity in one focused control room."
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1.45fr 0.75fr' },
          gap: 2.5,
          mb: 3,
        }}
      >
        <Paper elevation={0} sx={{ ...surfaceSx, p: { xs: 2.5, md: 3.25 } }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 2,
              alignItems: { xs: 'flex-start', sm: 'center' },
              flexDirection: { xs: 'column', sm: 'row' },
              mb: 2.5,
            }}
          >
            <Box>
              <Typography variant="h5" sx={featureHeadingSx}>
                Review Command Center
              </Typography>
              <Typography sx={{ color: mutedText, mt: 0.5, fontSize: '0.98rem' }}>
                Prioritize pending releases before broad catalog browsing.
              </Typography>
            </Box>
            <Button
              component={Link}
              href="/admin/releases?status=pending"
              variant="contained"
              endIcon={<ArrowForward />}
              sx={{ borderRadius: '12px', px: 2.5, fontWeight: 900 }}
            >
              Open Queue
            </Button>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' },
              gap: 2,
              mb: 2.5,
            }}
          >
            {[
              {
                label: 'Pending',
                value: releaseCounts.pending || stats.pendingReleases,
                icon: <PendingActions />,
                color: '#f59e0b',
              },
              {
                label: 'Processing',
                value: releaseCounts.in_process,
                icon: <PendingActions />,
                color: '#0ea5e9',
              },
              {
                label: 'Shipped',
                value: shippedReleases,
                icon: <CheckCircle />,
                color: '#10b981',
              },
              {
                label: 'Approved',
                value: approvedReleases,
                icon: <CheckCircle />,
                color: '#10b981',
              },
              { label: 'Rejected', value: rejectedReleases, icon: <Cancel />, color: '#ef4444' },
            ].map(item => (
              <Box
                key={item.label}
                sx={{
                  borderRadius: '12px',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                  p: 2.25,
                  bgcolor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(248,250,252,0.72)',
                }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, color: item.color, mb: 1 }}
                >
                  {item.icon}
                  <Typography sx={{ fontWeight: 900 }}>{item.label}</Typography>
                </Box>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 900,
                    color: headingText,
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '1.6rem',
                  }}
                >
                  {item.value}
                </Typography>
              </Box>
            ))}
          </Box>

          <Stack spacing={2}>
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" sx={{ fontWeight: 900, color: headingText }}>
                Queue Load
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 800, color: reviewLoad > 40 ? 'warning.main' : 'success.main' }}
              >
                {reviewLoad}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={reviewLoad}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  bgcolor: reviewLoad > 40 ? '#f59e0b' : '#10b981',
                },
              }}
            />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" sx={{ fontWeight: 900, color: headingText }}>
                Broma Moderation
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 800, color: releaseCounts.in_process > 0 ? '#0ea5e9' : 'success.main' }}
              >
                {releaseCounts.in_process} active · {bromaLoad}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={bromaLoad}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  bgcolor: '#0ea5e9',
                },
              }}
            />
          </Box>
          </Stack>
        </Paper>

        <Paper
          elevation={0}
          sx={{ ...surfaceSx, p: { xs: 2.5, md: 3 }, display: 'flex', flexDirection: 'column' }}
        >
          <Typography sx={{ ...sectionHeadingSx, mb: 2 }}>Fast Actions</Typography>
          <Stack spacing={1.25}>
            {[
              { title: 'Add User/Subadmin', icon: <Group />, href: '/admin/users/new', primary: true },
              { title: 'Manage Users', icon: <Group />, href: '/admin/users' },
              { title: 'Payout Requests', icon: <MonetizationOn />, href: '/admin/payouts' },
              { title: 'DSP Deliveries', icon: <MusicNote />, href: '/admin/dsp-deliveries' },
              { title: 'Analytics', icon: <BarChart />, href: '/admin/analytics' },
            ].map(item => (
              <Button
                key={item.title}
                component={Link}
                href={item.href}
                variant={item.primary ? 'contained' : 'outlined'}
                startIcon={item.icon}
                endIcon={<ArrowForward />}
                sx={{
                  justifyContent: 'flex-start',
                  borderRadius: '999px',
                  py: 1.15,
                  px: 2,
                  fontWeight: 900,
                  borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
                  color: item.primary ? '#fff' : '#00e7ff',
                  bgcolor: item.primary ? '#00e7ff' : 'transparent',
                  '& .MuiButton-endIcon': { ml: 'auto' },
                  '&:hover': {
                    borderColor: '#00e7ff',
                    bgcolor: item.primary ? '#4a4fe0' : isDark ? 'rgba(91,95,247,0.08)' : 'rgba(91,95,247,0.06)',
                  },
                }}
                fullWidth
              >
                {item.title}
              </Button>
            ))}
          </Stack>
        </Paper>
      </Box>

      {/* Stats Overview */}
      <Box sx={statGridStyles}>
        {statCards.map(({ label, value, icon: Icon, avatarColor }) => {
          const accent = statAccent[avatarColor];
          return (
            <Box
              key={label}
              sx={{
                ...surfaceSx,
                p: { xs: 2.25, md: 2.5 },
                minHeight: 176,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.14)',
                },
              }}
            >
              <Avatar
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '12px',
                  bgcolor: accent.bg,
                  color: accent.color,
                }}
              >
                <Icon sx={{ fontSize: 22 }} />
              </Avatar>
              <Box>
                <Typography
                  sx={{
                    mt: 1.75,
                    fontWeight: 900,
                    fontSize: { xs: '1.75rem', sm: '1.6rem' },
                    lineHeight: 1,
                    color: headingText,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {value}
                </Typography>
                <Typography
                  sx={{ mt: 0.75, fontSize: '0.85rem', fontWeight: 700, color: mutedText }}
                >
                  {label}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Dashboard Content */}
      <Box sx={panelGridStyles}>
        {/* Recent Users */}
        <Paper
          elevation={0}
          sx={{
            ...surfaceSx,
            p: { xs: 2.5, md: 3 },
            height: '100%',
          }}
        >
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
          >
            <Typography sx={sectionHeadingSx}>Recent Users</Typography>
            <Button
              component={Link}
              href="/admin/users"
              size="small"
              color="primary"
              variant="outlined"
              sx={{
                borderRadius: '999px',
                px: 1.75,
                fontWeight: 900,
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
              }}
            >
              View All
            </Button>
          </Box>

          <Divider
            sx={{ mb: 2, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }}
          />

          <List sx={{ px: 0, display: 'grid', gap: 1.25 }}>
            {recentUsers.length > 0 ? (
              recentUsers.map(user => (
                <ListItem
                  key={user._id}
                  sx={{
                    px: 1.5,
                    py: 1.35,
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)',
                    bgcolor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(248,250,252,0.72)',
                    transition: 'background-color 160ms ease, border-color 160ms ease',
                    '&:hover': {
                      borderColor: isDark ? 'rgba(255,255,255,0.13)' : 'rgba(15,23,42,0.13)',
                      bgcolor: isDark ? 'rgba(255,255,255,0.045)' : '#ffffff',
                    },
                  }}
                >
                  <ListItemAvatar>
                    <Avatar
                      src={user.profilePicture || undefined}
                      sx={{
                        width: 42,
                        height: 42,
                        bgcolor: user.profilePicture ? 'transparent' : statAccent.primary.bg,
                        color: statAccent.primary.color,
                        fontWeight: 900,
                      }}
                    >
                      {!user.profilePicture && user.name.charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: 900, color: headingText }}>
                        {user.name}
                      </Typography>
                    }
                    secondary={
                      <>
                        <Typography component="span" variant="caption" color="text.secondary">
                          <Box component="span" sx={{ color: mutedText }}>
                            {user.email}
                          </Box>
                        </Typography>
                        <br />
                        <Typography component="span" variant="caption" sx={{ color: mutedText }}>
                          Joined {formatDate(user.createdAt)}
                        </Typography>
                      </>
                    }
                  />
                  <Chip
                    label={user.role}
                    size="small"
                    color={user.role === 'admin' ? 'secondary' : 'primary'}
                    sx={{
                      height: 24,
                      borderRadius: '999px',
                      fontSize: '0.68rem',
                      fontWeight: 900,
                      minWidth: 60,
                    }}
                  />
                </ListItem>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                No recent users
              </Typography>
            )}
          </List>
        </Paper>

        {/* Pending Releases */}
        <Paper
          elevation={0}
          sx={{
            ...surfaceSx,
            p: { xs: 2.5, md: 3 },
            height: '100%',
          }}
        >
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
          >
            <Typography sx={sectionHeadingSx}>Pending Releases</Typography>
            <Button
              component={Link}
              href="/admin/releases?status=pending"
              size="small"
              color="primary"
              variant="outlined"
              sx={{
                borderRadius: '999px',
                px: 1.75,
                fontWeight: 900,
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
              }}
            >
              View All
            </Button>
          </Box>

          <Divider
            sx={{ mb: 2, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }}
          />

          {pendingReleases.length > 0 ? (
            <List sx={{ px: 0, display: 'grid', gap: 1.25 }}>
              {pendingReleases.slice(0, 5).map(release => (
                <ListItem
                  key={release._id}
                  sx={{
                    px: 1.5,
                    py: 1.35,
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)',
                    bgcolor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(248,250,252,0.72)',
                  }}
                >
                  <ListItemAvatar>
                    <Avatar
                      src={release.artworkUrl || undefined}
                      variant="rounded"
                      sx={{
                        width: 42,
                        height: 42,
                        bgcolor: release.artworkUrl ? 'transparent' : statAccent.warning.bg,
                        color: statAccent.warning.color,
                      }}
                    >
                      {!release.artworkUrl && <MusicNote sx={{ fontSize: 16 }} />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 900, color: headingText }}
                        noWrap
                      >
                        {release.releaseTitle || 'Untitled Release'}
                      </Typography>
                    }
                    secondary={
                      <Typography component="span" variant="caption" sx={{ color: mutedText }}>
                        by {release.primaryArtist || 'Unknown Artist'}
                      </Typography>
                    }
                  />
                  <Button
                    component={Link}
                    href={`/admin/releases/${release._id}`}
                    size="small"
                    variant="outlined"
                    sx={{
                      borderRadius: '999px',
                      fontWeight: 900,
                      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
                      minWidth: 'auto',
                      px: 1.5,
                      py: 0.5,
                    }}
                  >
                    Review
                  </Button>
                </ListItem>
              ))}
            </List>
          ) : (
            <Box
              sx={{
                minHeight: 220,
                display: 'grid',
                placeItems: 'center',
                borderRadius: '12px',
                border: '1px dashed',
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
                bgcolor: isDark ? 'rgba(255,255,255,0.018)' : 'rgba(248,250,252,0.6)',
              }}
            >
              <Stack alignItems="center" spacing={1}>
                <CheckCircle sx={{ color: '#10b981' }} />
                <Typography variant="body2" sx={{ color: mutedText, fontWeight: 800 }}>
                  No pending releases
                </Typography>
              </Stack>
            </Box>
          )}
        </Paper>

        {/* All Releases Table */}
        <Box sx={{ gridColumn: { xs: 'auto', md: '1 / -1' } }}>
          <Paper
            elevation={0}
            sx={{
              ...surfaceSx,
              p: { xs: 2.5, md: 3 },
            }}
          >
            <Box
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
            >
              <Typography sx={sectionHeadingSx}>All Releases</Typography>
              <Button
                component={Link}
                href="/admin/releases"
                size="small"
                color="primary"
                variant="outlined"
                sx={{
                  borderRadius: '999px',
                  px: 1.75,
                  fontWeight: 900,
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
                }}
              >
                View All
              </Button>
            </Box>

            <Divider
              sx={{ mb: 2, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }}
            />

            {recentReleases.length > 0 ? (
              <TableContainer
                sx={{
                  borderRadius: '12px',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                  overflow: 'hidden',
                }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['Cover', 'Title', 'Artist', 'Status', 'Tracks', 'Updated'].map(header => (
                        <TableCell
                          key={header}
                          sx={{
                            fontWeight: 900,
                            fontSize: '0.78rem',
                            color: mutedText,
                            bgcolor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(248,250,252,0.95)',
                          }}
                        >
                          {header}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentReleases.map(release => {
                      const displayStatus = getNormalizedReleaseStatus(release.status);

                      return (
                      <TableRow
                        key={release._id}
                        sx={{
                          '& td': {
                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                            py: 1.55,
                          },
                          '&:hover td': {
                            bgcolor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(248,250,252,0.72)',
                          },
                          '&:last-child td': {
                            borderBottom: 0,
                          },
                        }}
                      >
                        <TableCell sx={{ width: 48, px: 1.5 }}>
                          <Avatar
                            src={release.artworkUrl || undefined}
                            variant="rounded"
                            sx={{
                              width: 36,
                              height: 36,
                              bgcolor: release.artworkUrl ? 'transparent' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                            }}
                          >
                            {!release.artworkUrl && <MusicNote sx={{ fontSize: 14, opacity: 0.4 }} />}
                          </Avatar>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 120 }}>
                          <Typography
                            variant="body2"
                            sx={{ color: headingText, fontWeight: 900 }}
                            noWrap
                          >
                            {release.releaseTitle || 'Untitled'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: mutedText, fontWeight: 700 }}>
                            {release.primaryArtist || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={getReleaseStatusLabel(release.status)}
                            color={
                              displayStatus === 'approved'
                                ? 'success'
                                : displayStatus === 'pending'
                                  ? 'warning'
                                  : displayStatus === 'in_process'
                                    ? 'info'
                                    : displayStatus === 'rejected'
                                      ? 'error'
                                      : 'default'
                            }
                            size="small"
                            sx={{
                              height: 24,
                              borderRadius: '999px',
                              fontSize: '0.68rem',
                              fontWeight: 900,
                              minWidth: 70,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              color: headingText,
                              fontWeight: 800,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {Number(release.trackCount ?? (Array.isArray(release.tracks) ? release.tracks.length : 0))}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: mutedText, fontWeight: 700 }}>
                            {formatDate(release.updatedAt)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                No releases found
              </Typography>
            )}
          </Paper>
        </Box>
      </Box>
    </Container>
  );
}
