'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Avatar,
  useTheme,
  Tooltip,
  Badge,
  Button,
  ListItemIcon,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AccountBalanceWallet,
  NotificationsOutlined,
  KeyboardArrowDown,
  DarkMode,
  HelpOutline,
  LightMode,
  Logout,
  MarkEmailRead,
  Person as PersonIcon,
  Settings as SettingsIcon,
  TrendingUp,
} from '@mui/icons-material';
import { useAuth } from '@/context/AppContext';
import { useColorMode } from '@/context/ColorModeContext';
import { useNotifications } from '@/context/NotificationsContext';
import { getNotificationTitle } from '@/lib/notificationTitles';
import { getNotificationRoute } from '@/lib/notificationRoutes';
import DashboardSearch from '@/components/navigation/DashboardSearch';

interface TopNavigationProps {
  title?: string;
}

function getHelpCenterHref() {
  if (typeof window === 'undefined') return '/help';

  const helpHost = process.env.NEXT_PUBLIC_HELP_HOST || 'help.karharimedia.com';
  const appHost = process.env.NEXT_PUBLIC_APP_HOST || 'app.karharimedia.com';

  if (window.location.hostname === appHost) return `https://${helpHost}`;
  return '/help';
}

export default function TopNavigation({ title = 'Karhari Media Distribution' }: TopNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const [isClient, setIsClient] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // FIX: Always call hooks at the top level (never conditionally)
  const auth = useAuth();
  const colorMode = useColorMode();
  const { user, logout } = auth;
  const { toggleColorMode } = colorMode;
  const { notifications, unreadCount, loading: notificationsLoading, markAsRead, markAllAsRead } = useNotifications();

  // Menu states
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null);

  // Initialize client-side state
  useEffect(() => {
    setIsClient(true);
    setIsAdmin(user?.role === 'admin' || user?.role === 'subadmin');
    setIsDarkMode(theme.palette.mode === 'dark');
  }, [user, theme.palette.mode]);

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleNotificationsOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationsAnchor(event.currentTarget);
  };

  const handleNotificationsClose = () => {
    setNotificationsAnchor(null);
  };

  const formatNotificationDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  };

  const handleNotificationClick = async (notification: typeof notifications[number]) => {
    await markAsRead(notification._id);
    handleNotificationsClose();
    router.push(getNotificationRoute(notification, 'user'));
  };

  // Generate breadcrumb from pathname
  const getBreadcrumb = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length <= 1) return null;
    const breadcrumb = parts.slice(1).map((part) =>
      part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' ')
    );
    return breadcrumb.join(' / ');
  };

  // Don't render anything during SSR to prevent hydration errors
  if (!isClient) {
    return <AppBar position="sticky" elevation={0} color="default"><Toolbar /></AppBar>;
  }

  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="default"
      sx={{
        bgcolor: isDarkMode ? 'rgba(9, 14, 26, 0.8)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid',
        borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      }}
    >
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', px: { xs: 2, sm: 3 }, minHeight: '60px !important' }}>
        {/* Left: Breadcrumb */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {(getBreadcrumb() || title) && (
            <Typography
              variant="body2"
              sx={{
                color: isDarkMode ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)',
                fontWeight: 500,
                fontSize: '0.85rem',
                display: { xs: 'none', sm: 'block' },
              }}
            >
              {getBreadcrumb() || title}
            </Typography>
          )}
        </Box>

        {/* Right: Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Tooltip title="Open Help Center">
            <Button
              component={Link}
              href={getHelpCenterHref()}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              startIcon={<HelpOutline sx={{ fontSize: 18 }} />}
              sx={{
                display: { xs: 'none', md: 'inline-flex' },
                minHeight: 36,
                borderRadius: '10px',
                px: 1.25,
                color: isDarkMode ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.72)',
                border: '1px solid',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                bgcolor: isDarkMode ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.025)',
                fontWeight: 800,
                textTransform: 'none',
                '&:hover': {
                  bgcolor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.055)',
                  borderColor: isDarkMode ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.14)',
                },
              }}
            >
              Help
            </Button>
          </Tooltip>
          <Tooltip title="Open Help Center">
            <IconButton
              component={Link}
              href={getHelpCenterHref()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Help Center"
              size="small"
              sx={{
                display: { xs: 'inline-flex', md: 'none' },
                width: 36,
                height: 36,
                color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)',
                '&:hover': {
                  bgcolor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                },
              }}
            >
              <HelpOutline sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          <DashboardSearch
            audience="user"
            iconColor={isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)'}
          />

          {/* Theme toggle */}
          <Tooltip title={isDarkMode ? 'Light Mode' : 'Dark Mode'}>
            <IconButton
              onClick={toggleColorMode}
              size="small"
              sx={{
                width: 36,
                height: 36,
                color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)',
                '&:hover': {
                  bgcolor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                },
              }}
            >
              {isDarkMode ? <LightMode sx={{ fontSize: 19 }} /> : <DarkMode sx={{ fontSize: 19 }} />}
            </IconButton>
          </Tooltip>

          {/* Notifications */}
          <Tooltip title="Notifications">
            <IconButton
              size="small"
              onClick={handleNotificationsOpen}
              sx={{
                width: 36,
                height: 36,
                color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)',
                '&:hover': {
                  bgcolor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                },
              }}
            >
              <Badge
                badgeContent={unreadCount}
                color="error"
                sx={{
                  '& .MuiBadge-badge': {
                    fontSize: '0.65rem',
                    height: 16,
                    minWidth: 16,
                  },
                }}
              >
                <NotificationsOutlined sx={{ fontSize: 20 }} />
              </Badge>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={notificationsAnchor}
            open={Boolean(notificationsAnchor)}
            onClose={handleNotificationsClose}
            PaperProps={{
              sx: {
                width: 340,
                maxHeight: 420,
                mt: 1,
                borderRadius: '14px',
                border: '1px solid',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                bgcolor: isDarkMode ? '#111827' : '#ffffff',
                boxShadow: isDarkMode
                  ? '0 12px 40px rgba(0,0,0,0.4)'
                  : '0 12px 40px rgba(15,23,42,0.1)',
              },
            }}
          >
            <Box sx={{ px: 2.5, py: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" fontWeight={700}>Notifications</Typography>
                {unreadCount > 0 && (
                  <Button size="small" onClick={() => markAllAsRead()} sx={{ minWidth: 0, fontSize: '0.72rem', fontWeight: 700 }}>
                    Mark All Read
                  </Button>
                )}
              </Box>
            </Box>
            <Divider sx={{ borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }} />
            {notificationsLoading ? (
              <Box sx={{ px: 2.5, py: 2 }}>
                <Typography variant="body2" color="text.secondary">Loading notifications…</Typography>
              </Box>
            ) : notifications.length === 0 ? (
              <Box sx={{ px: 2.5, py: 3 }}>
                <Typography variant="body2" color="text.secondary">No notifications yet.</Typography>
              </Box>
            ) : (
              notifications.slice(0, 8).map((notification) => {
                const isUnread = !(notification.read ?? notification.isRead);
                return (
                  <MenuItem
                    key={notification._id}
                    onClick={() => handleNotificationClick(notification)}
                    sx={{
                      px: 2.5,
                      py: 1.5,
                      alignItems: 'flex-start',
                      gap: 1,
                      bgcolor: isUnread ? (isDarkMode ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.primary.main, 0.06)) : 'transparent',
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
                        {getNotificationTitle({
                          type: notification.type,
                          message: notification.message,
                        })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'normal' }}>
                        {notification.message}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {formatNotificationDate(notification.createdAt)}
                      </Typography>
                    </Box>
                    <Tooltip title="Mark as read">
                      <IconButton
                        aria-label="Mark notification as read"
                        size="small"
                        onClick={event => {
                          event.stopPropagation();
                          void markAsRead(notification._id);
                        }}
                        sx={{
                          width: 28,
                          height: 28,
                          mt: -0.25,
                          color: isDarkMode ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.52)',
                          '&:hover': {
                            bgcolor: isDarkMode ? 'rgba(34,197,94,0.14)' : 'rgba(34,197,94,0.1)',
                            color: '#16a34a',
                          },
                        }}
                      >
                        <MarkEmailRead sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                  </MenuItem>
                );
              })
            )}
          </Menu>

          {/* Separator */}
          <Divider
            orientation="vertical"
            flexItem
            sx={{
              mx: 0.5,
              borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)',
              height: 24,
              alignSelf: 'center',
            }}
          />

          {/* User menu */}
          <Button
            onClick={handleUserMenuOpen}
            aria-label="Open profile menu"
            aria-controls={userMenuAnchor ? 'profile-menu' : undefined}
            aria-haspopup="menu"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 0.5,
              px: 1,
              minWidth: 0,
              borderRadius: '10px',
              color: 'inherit',
              textTransform: 'none',
              transition: 'background 150ms ease',
              '&:hover': {
                bgcolor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
              },
            }}
          >
            <Avatar
              src={user?.profilePicture || undefined}
              sx={{
                width: 30,
                height: 30,
                bgcolor: isDarkMode ? '#1e293b' : '#e2e8f0',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: isDarkMode ? '#94a3b8' : '#475569',
                '& img': {
                  objectFit: 'contain',
                },
              }}
            >
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </Avatar>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  lineHeight: 1.2,
                  color: isDarkMode ? '#e2e8f0' : '#1e293b',
                }}
              >
                {user?.name || 'User'}
              </Typography>
            </Box>
            <KeyboardArrowDown sx={{ fontSize: 16, color: isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }} />
          </Button>
          <Menu
            id="profile-menu"
            anchorEl={userMenuAnchor}
            open={Boolean(userMenuAnchor)}
            onClose={handleUserMenuClose}
            PaperProps={{
              sx: {
                mt: 1,
                borderRadius: '12px',
                border: '1px solid',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                bgcolor: isDarkMode ? '#111827' : '#ffffff',
                boxShadow: isDarkMode
                  ? '0 8px 24px rgba(0,0,0,0.3)'
                  : '0 8px 24px rgba(15,23,42,0.08)',
                minWidth: 260,
              },
            }}
          >
            <Box sx={{ px: 2, py: 1.5, maxWidth: 300 }}>
              <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', minWidth: 0 }}>
            <Avatar
              src={user?.profilePicture || undefined}
              sx={{
                width: 36,
                    height: 36,
                    bgcolor: isDarkMode ? '#1e293b' : '#e2e8f0',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    color: isDarkMode ? '#94a3b8' : '#475569',
                    flex: '0 0 auto',
                    '& img': {
                      objectFit: 'contain',
                    },
                  }}
                >
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.name || 'User'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {user?.email || 'No email available'}
                  </Typography>
                </Box>
              </Box>
            </Box>
            <Divider sx={{ borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }} />
            <MenuItem
              component={Link}
              href={isAdmin ? '/admin/profile' : '/dashboard/profile'}
              onClick={handleUserMenuClose}
              sx={{ py: 1.25, fontSize: '0.875rem' }}
            >
              <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
              Profile
            </MenuItem>
            {!isAdmin && (
              <MenuItem
                component={Link}
                href="/dashboard/settings"
                onClick={handleUserMenuClose}
                sx={{ py: 1.25, fontSize: '0.875rem' }}
              >
                <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                Settings
              </MenuItem>
            )}
            {!isAdmin && (
              <MenuItem
                component={Link}
                href="/dashboard/royalties"
                onClick={handleUserMenuClose}
                sx={{ py: 1.25, fontSize: '0.875rem' }}
              >
                <ListItemIcon><TrendingUp fontSize="small" /></ListItemIcon>
                Royalties
              </MenuItem>
            )}
            {!isAdmin && (
              <MenuItem
                component={Link}
                href="/dashboard/payouts"
                onClick={handleUserMenuClose}
                sx={{ py: 1.25, fontSize: '0.875rem' }}
              >
                <ListItemIcon><AccountBalanceWallet fontSize="small" /></ListItemIcon>
                Payouts
              </MenuItem>
            )}
            <Divider sx={{ borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }} />
            <MenuItem onClick={logout} sx={{ py: 1.25, fontSize: '0.875rem', color: '#ef4444' }}>
              <ListItemIcon><Logout fontSize="small" sx={{ color: '#ef4444' }} /></ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
