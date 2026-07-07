'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Box, CircularProgress } from '@mui/material';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '@/context/AppContext';
import { canAccessAdminPath, getFirstAllowedAdminPath, isAdminLike } from '@/lib/adminAccess';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const canAccessPath = !!user && canAccessAdminPath(user, pathname);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (!isAdminLike(user)) {
      router.replace('/dashboard');
      return;
    }

    if (!canAccessPath) {
      router.replace(getFirstAllowedAdminPath(user));
    }
  }, [canAccessPath, isLoading, pathname, router, user]);

  if (isLoading || !user || !canAccessPath) {
    return (
      <Box
        sx={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: theme.palette.mode === 'dark' ? '#08061a' : '#f3f8fb',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AdminSidebar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: theme.palette.mode === 'dark' ? '#08061a' : '#f3f8fb',
          backgroundImage:
            theme.palette.mode === 'dark'
              ? 'radial-gradient(circle at 16% 0%, rgba(242, 85, 107, 0.10), transparent 36%), radial-gradient(circle at 82% 10%, rgba(91, 95, 247, 0.08), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.02) 0 1px, transparent 1px)'
              : 'radial-gradient(circle at 16% 0%, rgba(242, 85, 107, 0.07), transparent 36%), radial-gradient(circle at 86% 8%, rgba(91, 95, 247, 0.08), transparent 34%), linear-gradient(135deg, rgba(17,24,39,0.02) 0 1px, transparent 1px)',
          backgroundSize: 'auto, auto, 42px 42px',
        }}
      >
        <AdminHeader />
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
          {children}
        </Box>
      </Box>
    </Box>
  );
}
