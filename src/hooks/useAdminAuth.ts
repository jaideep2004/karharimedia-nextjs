'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AppContext';
import { UserRole } from '../types/user';

export default function useAdminAuth() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  
  // Try to use the auth context, but handle the case where it might not be available
  let user = null;
  let authLoading = true;
  
  try {
    const auth = useAuth();
    user = auth.user;
    authLoading = auth.isLoading;
  } catch (error) {
    console.error("Auth context not available in useAdminAuth:", error);
  }

  useEffect(() => {
    const verifyAdminRole = () => {
      // Wait for auth context to be ready
      if (authLoading) {
        return;
      }
      
      setIsLoading(true);
      setError(null);

      try {
        if (!user) {
          console.log('No user found, redirecting to login');
          setIsAdmin(false);
          router.push('/login');
          return;
        }

        if (user.role === 'admin' || user.role === 'subadmin') {
          console.log('Admin role verified');
          setIsAdmin(true);
        } else {
          console.log('User is not admin, redirecting to dashboard');
          setIsAdmin(false);
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Admin authentication error:', error);
        setError('Authentication failed');
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };

    verifyAdminRole();
  }, [router, user, authLoading]);

  return { isAdmin, isLoading, error };
} 
