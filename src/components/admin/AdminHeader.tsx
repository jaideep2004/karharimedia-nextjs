'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Badge,
  Box,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  Tooltip,
  Button,
  Chip,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Notifications as NotificationsIcon,
  Logout as LogoutIcon,
  Settings as SettingsIcon,
  Person as PersonIcon,
  DarkMode,
  LightMode,
  MarkEmailRead,
  Shield as ShieldIcon,
} from '@mui/icons-material';
import { useNotifications } from '@/context/NotificationsContext';
import { useColorMode } from '@/context/ColorModeContext';
import { useAuth } from '@/context/AppContext';
import { isSubadmin } from '@/lib/adminAccess';
import { removeAuthTokenCookie } from '@/lib/authCookie';
import { getNotificationTitle } from '@/lib/notificationTitles';
import { getNotificationRoute } from '@/lib/notificationRoutes';
import DashboardSearch from '@/components/navigation/DashboardSearch';

export default function AdminHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const { mode, toggleColorMode } = useColorMode();
  const { user } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const notificationsOpen = Boolean(notificationsAnchor);

  const isDark = mode === 'dark';

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
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
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const handleNotificationClick = async (notification: typeof notifications[number]) => {
    await markAsRead(notification._id);
    handleNotificationsClose();
    router.push(getNotificationRoute(notification, 'admin'));
  };

  const handleLogout = async () => {
    removeAuthTokenCookie();
    window.location.assign('/login');
  };

  // Generate breadcrumb from pathname
  const getBreadcrumb = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length <= 1) return null;
    const breadcrumb = parts
      .slice(1)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '));
    return breadcrumb.join(' / ');
  };

  return (
    <AppBar
      position="static"
      color="default"
      elevation={0}
      sx={{
        bgcolor: isDark ? 'rgba(9, 14, 26, 0.8)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid',
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      }}
    >
      <Toolbar
        sx={{ justifyContent: 'space-between', px: { xs: 2, sm: 3 }, minHeight: '60px !important' }}
      >
        {/* Left: Breadcrumb */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {getBreadcrumb() && (
            <Typography
              variant="body2"
              sx={{
                color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)',
                fontWeight: 500,
                fontSize: '0.85rem',
              }}
            >
              {getBreadcrumb()}
            </Typography>
          )}
        </Box>

        {/* Right: Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <DashboardSearch
            audience="admin"
            iconColor={isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)'}
          />

          {/* Theme toggle */}
          <Tooltip title={isDark ? 'Light Mode' : 'Dark Mode'}>
            <IconButton
              onClick={toggleColorMode}
              size="small"
              sx={{
                width: 36,
                height: 36,
                color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)' },
              }}
            >
              {isDark ? <LightMode sx={{ fontSize: 19 }} /> : <DarkMode sx={{ fontSize: 19 }} />}
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
                color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)',
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)' },
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
                <NotificationsIcon sx={{ fontSize: 20 }} />
              </Badge>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={notificationsAnchor}
            open={notificationsOpen}
            onClose={handleNotificationsClose}
            PaperProps={{
              sx: {
                width: 340,
                maxHeight: 420,
                mt: 1,
                borderRadius: '14px',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                bgcolor: isDark ? '#111827' : '#ffffff',
                boxShadow: isDark
                  ? '0 12px 40px rgba(0,0,0,0.4)'
                  : '0 12px 40px rgba(15,23,42,0.1)',
              },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <Box
              sx={{
                px: 2.5,
                py: 1.5,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography variant="subtitle2" fontWeight={700}>
                Notifications
              </Typography>
              {unreadCount > 0 && (
                <Button
                  size="small"
                  onClick={() => markAllAsRead()}
                  sx={{ minWidth: 0, fontSize: '0.72rem', fontWeight: 700 }}
                >
                  Mark All Read
                </Button>
              )}
            </Box>
            <Divider
              sx={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}
            />
            {notificationsLoading ? (
              <Box sx={{ px: 2.5, py: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Loading notifications…
                </Typography>
              </Box>
            ) : notifications.length === 0 ? (
              <Box sx={{ px: 2.5, py: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  No notifications yet.
                </Typography>
              </Box>
            ) : (
              notifications.slice(0, 8).map(notification => {
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
                      bgcolor: isUnread
                        ? isDark
                          ? alpha(theme.palette.primary.main, 0.1)
                          : alpha(theme.palette.primary.main, 0.06)
                        : 'transparent',
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
                        {getNotificationTitle({
                          type: notification.type,
                          message: notification.message,
                        })}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', whiteSpace: 'normal' }}
                      >
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
                          color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.52)',
                          '&:hover': {
                            bgcolor: isDark ? 'rgba(34,197,94,0.14)' : 'rgba(34,197,94,0.1)',
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
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)',
              height: 24,
              alignSelf: 'center',
            }}
          />

          {/* User menu */}
          <Box
            onClick={handleClick}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
              py: 0.5,
              px: 1,
              borderRadius: '10px',
              transition: 'background 150ms ease',
              '&:hover': {
                bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
              },
            }}
          >
            <Avatar
              src={user?.profilePicture || undefined}
              sx={{
                width: 30,
                height: 30,
                bgcolor: isDark ? '#334155' : '#e2e8f0',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: isDark ? '#ffffff' : '#1e293b',
                '& img': {
                  objectFit: 'contain',
                },
              }}
            >
              A
            </Avatar>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontSize: '0.82rem',
                color: isDark ? '#e2e8f0' : '#1e293b',
                display: { xs: 'none', sm: 'block' },
              }}
            >
              Admin
            </Typography>
          </Box>
        </Box>
      </Toolbar>

      <Menu
        anchorEl={anchorEl}
        id="account-menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        PaperProps={{
          elevation: 0,
          sx: {
            mt: 1,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
            bgcolor: isDark ? '#111827' : '#ffffff',
            boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.3)' : '0 8px 24px rgba(15,23,42,0.08)',
            minWidth: 180,
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
          <Chip
            icon={<ShieldIcon sx={{ fontSize: 14 }} />}
            label={isSubadmin(user) ? 'Subadmin Access' : 'Administrator'}
            size="small"
            sx={{
              width: '100%',
              justifyContent: 'flex-start',
              bgcolor: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.06)',
              color: isDark ? '#fca5a5' : '#991b1b',
              border: '1px solid',
              borderColor: isDark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.14)',
              fontWeight: 700,
              '& .MuiChip-icon': {
                color: isDark ? '#fca5a5' : '#b91c1c',
              },
            }}
          />
        </Box>
        <Divider sx={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }} />
        <MenuItem onClick={() => router.push('/admin/profile')} sx={{ py: 1.25 }}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          Profile
        </MenuItem>
        <MenuItem onClick={() => router.push('/admin/settings')} sx={{ py: 1.25 }}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>
        <Divider sx={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }} />
        <MenuItem onClick={handleLogout} sx={{ py: 1.25, color: '#ef4444' }}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" sx={{ color: '#ef4444' }} />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>
    </AppBar>
  );
}
