'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import TopNavigation from '@/components/TopNavigation';
import UserSidebar from '@/components/UserSidebar';
import KycGate, { userKycUnderReview, userNeedsKyc } from '@/components/kyc/KycGate';
import { useAuth } from '@/context/AppContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const pathname = usePathname();
  const { user } = useAuth();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const needsKycForm = userNeedsKyc(user);
  const underReview = userKycUnderReview(user);
  const reviewAllowed = pathname === '/dashboard' || pathname.startsWith('/dashboard/profile') || pathname.startsWith('/dashboard/support');
  const maintenanceApplies = maintenanceMode && !!user && !['admin', 'subadmin'].includes(String(user.role || ''));

  useEffect(() => {
    let mounted = true;
    const loadMaintenanceMode = async () => {
      try {
        const response = await fetch('/api/settings/maintenance-mode', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (mounted) setMaintenanceMode(payload?.enabled === true);
      } catch {
        if (mounted) setMaintenanceMode(false);
      }
    };
    void loadMaintenanceMode();
    return () => {
      mounted = false;
    };
  }, []);
  
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {!needsKycForm && !maintenanceApplies && (
        <Suspense fallback={null}>
          <UserSidebar />
        </Suspense>
      )}
      <Box 
        component="main" 
        sx={{ 
          flexGrow: 1,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: theme.palette.mode === 'dark' ? '#08061a' : '#f3f8fb',
          backgroundImage: theme.palette.mode === 'dark'
            ? 'radial-gradient(circle at 18% 0%, rgba(91, 95, 247, 0.18), transparent 34%), radial-gradient(circle at 85% 12%, rgba(245, 165, 36, 0.10), transparent 28%), linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px)'
            : 'radial-gradient(circle at 18% 0%, rgba(91, 95, 247, 0.12), transparent 34%), radial-gradient(circle at 90% 6%, rgba(245, 165, 36, 0.12), transparent 30%), linear-gradient(135deg, rgba(17,24,39,0.035) 0 1px, transparent 1px)',
          backgroundSize: 'auto, auto, 42px 42px',
        }}
      >
        <TopNavigation title="Karhari Media Distribution" />
        <Box 
          component="div" 
          sx={{ 
            flexGrow: 1,
            width: '100%',
            pt: { xs: 2, sm: 2.5 },
            pb: { xs: 4, lg: 5 },
            px: { xs: 1.5, sm: 2.5, lg: 3 },
            maxWidth: 1680,
            mx: 'auto',
          }}
        >
          {maintenanceApplies ? (
            <Paper
              variant="outlined"
              sx={{
                p: { xs: 3, md: 5 },
                borderRadius: 3,
                maxWidth: 760,
                mx: 'auto',
                mt: { xs: 4, md: 8 },
                textAlign: 'center',
                bgcolor: 'background.paper',
                borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
                boxShadow: theme.palette.mode === 'dark'
                  ? '0 24px 70px rgba(0,0,0,0.32)'
                  : '0 24px 70px rgba(15,23,42,0.10)',
              }}
            >
              <Stack spacing={2.25} alignItems="center">
                <Typography variant="overline" color="primary" fontWeight={900}>
                  Scheduled Maintenance
                </Typography>
                <Typography variant="h4" fontWeight={950}>
                  We are tuning the dashboard.
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: 560 }}>
                  User tools are temporarily paused while the Karhari Media Distribution team completes maintenance. Your catalog, payouts, and profile data remain safe.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Please check back shortly.
                </Typography>
              </Stack>
            </Paper>
          ) : (
          <>
          {!needsKycForm && underReview && (
            <Alert severity="info" sx={{ mt: 2, mb: 2, borderRadius: 2 }}>
              KYC verification under progress. Dashboard actions unlock after admin approval.
            </Alert>
          )}
          {!needsKycForm && underReview && !reviewAllowed ? (
            <Paper
              variant="outlined"
              sx={{
                p: { xs: 3, md: 4 },
                borderRadius: 3,
                maxWidth: 720,
                mx: 'auto',
                textAlign: 'center',
                bgcolor: 'background.paper',
              }}
            >
              <Stack spacing={2} alignItems="center">
                <Typography variant="h5" fontWeight={900}>KYC Verification Under Progress</Typography>
                <Typography color="text.secondary">
                  This section is locked until admin approves your KYC. You can still view dashboard status and profile details.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Button component={Link} href="/dashboard" variant="contained">Open Dashboard</Button>
                  <Button component={Link} href="/dashboard/profile" variant="outlined">Open Profile</Button>
                </Stack>
              </Stack>
            </Paper>
          ) : (
            <KycGate>{children}</KycGate>
          )}
          </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
