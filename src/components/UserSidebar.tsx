'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  useTheme,
  useMediaQuery,
  IconButton,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Album,
  TrendingUp,
  CloudUpload as CloudUploadIcon,
  BarChart as AnalyticsIcon,
  AccountBalanceWallet,
  MusicNote,
  Person as PersonIcon,
  LibraryMusic,
  VideoLibrary,
  LockOutlined,
  YouTube,
  SupportAgent,
} from '@mui/icons-material';

import { useAuth } from '@/context/AppContext';
import { useNotifications } from '@/context/NotificationsContext';
import { countUnreadSupportNotifications } from '@/components/support/supportNotifications';

const drawerWidth = 264;
const collapsedDrawerWidth = 76;

const menuSections = [
  {
    label: 'Music Distribution',
    items: [
      {
        text: 'Dashboard',
        icon: <DashboardIcon />,
        path: '/dashboard',
      },
      {
        text: 'Create New Release',
        icon: <CloudUploadIcon />,
        path: '/dashboard/upload',
      },
      {
        text: 'Releases',
        icon: <Album />,
        path: '/dashboard/releases',
      },
      {
        text: 'Tracks',
        icon: <MusicNote />,
        path: '/dashboard/tracks',
      },
      {
        text: 'Analytics',
        icon: <AnalyticsIcon />,
        path: '/dashboard/analytics',
      },
      {
        text: 'Music Publishing',
        icon: <LibraryMusic />,
        path: '/dashboard/music-publishing',
      },
      {
        text: 'Vevo Video Distribution',
        icon: <VideoLibrary />,
        path: '/dashboard/vevo-video-distribution',
      },
      {
        text: 'YouTube Network',
        icon: <YouTube />,
        path: '/dashboard/youtube-network',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        text: 'Profile',
        icon: <PersonIcon />,
        path: '/dashboard/profile',
      },
      {
        text: 'Support Center',
        icon: <SupportAgent />,
        path: '/dashboard/support',
      },
      {
        text: 'Settings',
        icon: <SettingsIcon />,
        path: '/dashboard/settings',
      },
      {
        text: 'Royalties',
        icon: <TrendingUp />,
        path: '/dashboard/royalties',
      },
      {
        text: 'Payouts',
        icon: <AccountBalanceWallet />,
        path: '/dashboard/payouts',
      }, 
    ],
  },
];

export default function UserSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const auth = useAuth();
  const { notifications } = useNotifications();
  const user = auth?.user;
  const kycUnderReview = user?.verification?.status === 'submitted' && (user.role === 'artist' || user.role === 'label');
  const unreadSupportCount = countUnreadSupportNotifications(notifications);

  const isDark = theme.palette.mode === 'dark';
  const desktopCollapsed = collapsed && !isMobile;
  const currentDrawerWidth = desktopCollapsed ? collapsedDrawerWidth : drawerWidth;

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleDesktopCollapse = () => {
    setCollapsed((current) => !current);
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === path;
    }
    if (path === '/dashboard/releases') {
      return pathname.startsWith('/dashboard/releases');
    }
    return pathname.startsWith(path);
  };

  const isUnlockedDuringReview = (path: string) => {
    const [basePath] = path.split('?');
    return basePath === '/dashboard' || basePath === '/dashboard/profile' || basePath === '/dashboard/support';
  };

  const drawer = (
    <Box
      sx={{
        overflow: 'auto',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: isDark ? '#100725' : '#fafbfd',
        borderRight: '1px solid',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.08)',
        scrollbarWidth: 'thin',
        scrollbarColor: isDark ? 'rgba(255,255,255,0.12) transparent' : 'rgba(15,23,42,0.12) transparent',
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
          borderRadius: 10,
        },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
      }}
    >
      {/* Brand Header */}
      <Box
        sx={{
          px: 2.5,
          py: 2.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: desktopCollapsed ? 'center' : 'space-between',
        }}
      >
        {!desktopCollapsed && (
          <Box
            component="img"
            src={isDark ? '/images/karhari-media-b1.png' : '/images/karhari-media-b1.png'}
            alt="Karhari Media Distribution"
            sx={{
              width: 195,
              height: 45,
              objectFit: 'contain',
              objectPosition: 'left center',
              display: 'block',
            }}
          />
        )}
        <IconButton
          onClick={handleDrawerToggle}
          sx={{
            display: { md: 'none' },
            color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
            '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
          }}
        >
          <ChevronLeftIcon />  
        </IconButton>
        <Tooltip title={desktopCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'} placement="right">
          <IconButton
            onClick={handleDesktopCollapse}
            aria-label={desktopCollapsed ? 'Expand dashboard sidebar' : 'Collapse dashboard sidebar'}
            sx={{
              display: { xs: 'none', md: 'inline-flex' },
              width: 36,
              height: 36,
              color: isDark ? 'rgba(255,255,255,0.62)' : 'rgba(15,23,42,0.58)',
              bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
              '&:hover': {
                bgcolor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.09)',
              },
            }}
          >
            {desktopCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Navigation Sections */}
      <Box sx={{ flex: 1, px: 1, pb: 2 }}>
        {menuSections.map((section, sectionIdx) => (
          <Box key={section.label} sx={{ mb: sectionIdx < menuSections.length - 1 ? 0.5 : 0 }}>
            <Typography
              variant="overline"
              sx={{
                px: 2,
                pt: sectionIdx > 0 ? 1.5 : 0.5,
                pb: 0.75,
                display: desktopCollapsed ? 'none' : 'block',
                color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.4)',
                letterSpacing: '0.08em',
                fontWeight: 700,
                fontSize: '0.65rem',
              }}
            >
              {section.label}
            </Typography>
            <List disablePadding>
              {section.items.map((item: any) => {
                const lockedItem = kycUnderReview && !isUnlockedDuringReview(item.path);
                const isSupportItem = item.path === '/dashboard/support';
                return (
                <div key={item.path}>
                  <ListItem disablePadding sx={{ mb: 0.25 }}>
                    <Tooltip title={desktopCollapsed ? item.text : ''} placement="right" disableInteractive>
                      <ListItemButton
                        selected={isActive(item.path)}
                        disabled={lockedItem}
                        onClick={() =>
                          lockedItem
                            ? undefined
                            : router.push(item.path)
                        }
                        sx={{
                        borderRadius: '10px',
                        mx: 0.75,
                        py: 0.85,
                        px: desktopCollapsed ? 1 : 1.5,
                        minHeight: 44,
                        justifyContent: desktopCollapsed ? 'center' : 'flex-start',
                        position: 'relative',
                        transition: 'background-color 150ms ease, color 150ms ease',
                        '&.Mui-selected': {
                          backgroundColor: isDark
                            ? 'rgba(0, 231, 255, 0.12)'
                            : 'rgba(0, 231, 255, 0.08)',
                          color: isDark ? '#7ad9ff' : '#0098c7',
                          '&:hover': {
                            backgroundColor: isDark
                              ? 'rgba(0, 231, 255, 0.18)'
                              : 'rgba(0, 231, 255, 0.12)',
                          },
                          '& .MuiListItemIcon-root': {
                            color: isDark ? '#7ad9ff' : '#0098c7',
                          },
                        },
                        '&:hover': {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.04)'
                            : 'rgba(15, 23, 42, 0.04)',
                        },
                        '&.Mui-selected::before': {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 3,
                          height: 20,
                          borderRadius: '0 4px 4px 0',
                          backgroundColor: '#00e7ff',
                          transition: 'height 200ms ease',
                        },
                      }}
                    >
                      <ListItemIcon
                        sx={{
                          minWidth: desktopCollapsed ? 0 : 36,
                          color: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.45)',
                          '& .MuiSvgIcon-root': { fontSize: 20 },
                        }}
                      >
                        <Badge
                          badgeContent={isSupportItem ? unreadSupportCount : 0}
                          color="error"
                          invisible={!isSupportItem || unreadSupportCount === 0 || !desktopCollapsed}
                          max={99}
                          sx={{
                            '& .MuiBadge-badge': {
                              fontSize: '0.62rem',
                              height: 16,
                              minWidth: 16,
                            },
                          }}
                        >
                          {item.icon}
                        </Badge>
                      </ListItemIcon>
                      <ListItemText
                        primary={item.text}
                        sx={{ display: desktopCollapsed ? 'none' : 'block' }}
                        primaryTypographyProps={{
                          fontWeight: isActive(item.path) ? 800 : 700,
                          fontSize: '0.875rem',
                          letterSpacing: '-0.005em',
                          color: isActive(item.path)
                            ? (isDark ? '#7ad9ff' : '#0098c7')
                            : (isDark ? 'rgba(255, 255, 255, 0.84)' : 'rgba(15, 23, 42, 0.88)'),
                        }}
                      />
                      {isSupportItem && !desktopCollapsed && unreadSupportCount > 0 && (
                        <Box
                          component="span"
                          sx={{
                            mr: 0.75,
                            minWidth: 18,
                            height: 18,
                            px: 0.6,
                            borderRadius: 999,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'error.main',
                            color: 'error.contrastText',
                            fontSize: '0.68rem',
                            fontWeight: 900,
                            lineHeight: 1,
                          }}
                        >
                          {Math.min(unreadSupportCount, 99)}
                        </Box>
                      )}
                      {lockedItem && !desktopCollapsed && (
                        <LockOutlined sx={{ fontSize: 15, color: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.32)', mr: 0.5 }} />
                      )}
                      </ListItemButton>
                    </Tooltip>
                  </ListItem>
                </div>
              )})}
            </List>
          </Box>
        ))}
      </Box>

      {/* Sidebar Footer */}
      <Box
        sx={{
          p: 2,
          borderTop: '1px solid',
          borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.06)',
          textAlign: 'center',
          display: desktopCollapsed ? 'none' : 'block',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(15, 23, 42, 0.3)',
            fontSize: '0.65rem',
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}
        >
          Karhari Media Distribution
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <Box
        component="nav"
        sx={{
          width: { md: currentDrawerWidth },
          flexShrink: { md: 0 },
          transition: 'width 180ms ease',
        }}
        aria-label="navigation sidebar"
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              border: 'none',
              backgroundColor: isDark ? '#100725' : '#fafbfd',
            },
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: currentDrawerWidth,
              border: 'none',
              backgroundColor: 'transparent',
              transition: 'width 180ms ease',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Mobile menu button */}
      {isMobile && (
        <Box
          sx={{
            position: 'fixed',
            top: 14,
            left: 14,
            zIndex: theme.zIndex.drawer + 1,
            display: { md: 'none' },
          }}
        >
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{
              width: 40,
              height: 40,
              backgroundColor: isDark ? 'rgba(12, 17, 32, 0.9)' : 'rgba(255, 255, 255, 0.92)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              backdropFilter: 'blur(12px)',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
              '&:hover': {
                backgroundColor: isDark ? 'rgba(12, 17, 32, 0.95)' : 'rgba(255, 255, 255, 0.98)',
              },
            }}
          >
            <MenuIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}
