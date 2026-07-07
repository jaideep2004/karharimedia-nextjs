"use client";
import { useAuth } from '@/context/AppContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [authError, setAuthError] = useState(false);
  
  // Always call useAuth hook unconditionally - never wrap in try/catch
  const auth = useAuth();
  const { user, isLoading } = auth || { user: null, isLoading: true };

  useEffect(() => {
    setMounted(true);
    
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [isLoading, user, router]);

  // Always render the same structure to prevent hydration mismatch
  if (!mounted || authError || isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }
  
  // User is authenticated, render children
  return <>{children}</>;
}
