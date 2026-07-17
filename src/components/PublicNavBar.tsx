"use client";
import { useState } from 'react';
import Link from 'next/link';
import {
  AppBar,
  Box,
  Toolbar,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  useMediaQuery,
  useTheme,
  Button,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import { useColorMode } from '@/context/ColorModeContext';

const navItems = [
  { label: 'Login', href: '/login' },
  { label: 'Sign Up', href: '/signup' },
];

export default function PublicNavBar() {
  const theme = useTheme();
  const { mode, toggleColorMode } = useColorMode();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen((prev) => !prev);
  };

  const themeSwitch = (
    <IconButton
      aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
      onClick={(event) => {
        event.stopPropagation();
        toggleColorMode();
      }}
      sx={{
        width: 52,
        height: 30,
        mx: { xs: 0.5, md: 1.25 },
        borderRadius: 999,
        border: '1px solid',
        borderColor: mode === 'dark' ? alpha(theme.palette.primary.main, 0.42) : 'rgba(214,215,13,0.22)',
        background:
          mode === 'dark'
            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.18)}, rgba(214,215,13,0.16))`
            : 'linear-gradient(135deg, rgba(255,255,255,0.92), rgba(255,232,245,0.92))',
        boxShadow:
          mode === 'dark'
            ? `0 10px 24px ${alpha(theme.palette.primary.main, 0.16)}, inset 0 1px 0 rgba(255,255,255,0.12)`
            : '0 10px 24px rgba(214,215,13,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
        color: mode === 'dark' ? '#ffffff' : '#d6d70d',
        transition: 'background 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
        '&:hover': {
          background:
            mode === 'dark'
              ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.26)}, rgba(123,31,162,0.3))`
              : 'linear-gradient(135deg, #ffffff, rgba(255,220,240,0.96))',
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          width: 22,
          height: 22,
          borderRadius: '50%',
          left: mode === 'dark' ? 4 : 25,
          background: mode === 'dark' ? '#05050a' : '#ffffff',
          boxShadow: mode === 'dark' ? `0 0 16px ${alpha(theme.palette.primary.main, 0.55)}` : '0 6px 14px rgba(214,215,13,0.16)',
          transition: 'left 180ms ease, background 180ms ease, box-shadow 180ms ease',
        },
        '& svg': {
          position: 'relative',
          zIndex: 1,
          fontSize: 16,
          transform: mode === 'dark' ? 'translateX(-11px)' : 'translateX(11px)',
          transition: 'transform 180ms ease',
        },
      }}
    >
      {mode === 'dark' ? <DarkModeRoundedIcon /> : <LightModeRoundedIcon />}
    </IconButton>
  );

  const drawer = (
    <Box onClick={handleDrawerToggle} sx={{ textAlign: 'center' }}>
      <Box
        component="img"
        src={theme.palette.mode === 'dark' ? '/images/karhari-media-b1.png' : '/images/karhari-media-b1.png'}
        alt="Karhari Media Distribution"
        sx={{ width: 190, maxWidth: '80%', my: 2 }}
      />
      <Divider />
      <List>
        <ListItem sx={{ justifyContent: 'center', gap: 0.5, py: 1.5 }}>
            {themeSwitch}
            <ListItemText
              primary={mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
              primaryTypographyProps={{ fontWeight: 800 }}
            />
        </ListItem>
        {navItems.map((item) => (
          <ListItem key={item.label} disablePadding>
            <ListItemButton sx={{ textAlign: 'center' }} component={Link} href={item.href}>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        component="nav"
        position="static"
        elevation={0}
        sx={{
          bgcolor: theme.palette.mode === 'dark' ? '#05050a' : '#ffffff',
          color: theme.palette.mode === 'dark' ? '#ffffff' : '#05050a',
          borderBottom: '1px solid',
          borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(5,5,10,0.10)',
        }}
      >
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Box
            component={Link}
            href="/login"
            sx={{
              flexGrow: 1,
              display: 'inline-flex',
              justifyContent: { xs: 'center', md: 'flex-start' },
              alignItems: 'center',
              minWidth: 0,
            }}
          >
            <Box
              component="img"
              src={theme.palette.mode === 'dark' ? '/images/karhari-media-b1.png' : '/images/karhari-media-b1.png'}
              alt="Karhari Media Distribution"
              sx={{ width: { xs: 180, sm: 220 }, maxHeight: 44, objectFit: 'contain' }}
            />
          </Box>
          {!isMobile && (
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
              {themeSwitch}
              {navItems.map((item) => (
                <Button key={item.label} color="inherit" component={Link} href={item.href}>
                  {item.label}
                </Button>
              ))}
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <Box component="nav">
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 240 },
          }}
        >
          {drawer}
        </Drawer>
      </Box>
    </Box>
  );
}
