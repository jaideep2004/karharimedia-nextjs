'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
  Breadcrumbs,
  Link as MuiLink,
  Divider,
  useTheme,
} from '@mui/material';
import { 
  ArrowBack, 
  Edit, 
  Block, 
  CheckCircle,
  Email,
  Person,
  CalendarToday,
  Work
} from '@mui/icons-material';
import Link from 'next/link';
import { adminAPI } from '@/services/api';
import useAdminAuth from '@/hooks/useAdminAuth';
import { useColorMode } from '@/context/ColorModeContext';

export default function ViewUserPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const theme = useTheme();
  const { mode } = useColorMode();
  const { isAdmin } = useAdminAuth();
  const userId = params.id;
  
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (isAdmin && userId) {
      fetchUser();
    }
  }, [isAdmin, userId]);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getUserById(userId);
      
      if (response.success && response.data) {
        setUser(response.data);
      } else {
        throw new Error(response.message || 'Failed to fetch user');
      }
    } catch (err: any) {
      console.error('Error fetching user:', err);
      setError(err.message || 'Failed to fetch user');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!user) return;
    
    try {
      setUpdatingStatus(true);
      const newStatus = !user.isActive;
      
      const response = await adminAPI.updateUser(userId, {
        isActive: newStatus
      });
      
      if (response.success) {
        setUser((prev: any | null) => (prev ? { ...prev, isActive: newStatus } : prev));
      } else {
        throw new Error(response.message || `Failed to ${newStatus ? 'activate' : 'deactivate'} user`);
      }
    } catch (err: any) {
      console.error('Error updating user status:', err);
      setError(err.message || 'Failed to update user status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (isAdmin === null || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isAdmin === false) {
    router.push('/login');
    return null;
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <Typography>User not found</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Breadcrumbs aria-label="breadcrumb">
          <MuiLink component={Link} href="/admin/dashboard">
            Dashboard
          </MuiLink>
          <MuiLink component={Link} href="/admin/users">
            Users
          </MuiLink>
          <Typography color="text.primary">View User</Typography>
        </Breadcrumbs>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
          <Typography variant="h4" component="h1">
            User Details
          </Typography>
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            component={Link}
            href="/admin/users"
          >
            Back to Users
          </Button>
        </Box>
      </Box>

      <Paper 
        sx={{ 
          p: 4,
          borderRadius: 2,
          border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
          backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
        }}
      >
        {/* User Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              backgroundColor: mode === 'dark' ? 'primary.dark' : 'primary.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 3,
              color: 'white',
              fontWeight: 600,
              fontSize: '2rem',
            }}
          >
            {user.name.charAt(0).toUpperCase()}
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
              {user.name}
            </Typography>
            {user.artistName && user.artistName !== user.name && (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
                Artist Name: {user.artistName}
              </Typography>
            )}
            <Chip
              label={user.role}
              color={user.role === 'admin' ? 'primary' : 'secondary'}
              size="small"
              sx={{ mr: 1 }}
            />
            <Chip
              label={user.isActive ? 'Active' : 'Inactive'}
              color={user.isActive ? 'success' : 'default'}
              size="small"
            />
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* User Details */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            User Information
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Email sx={{ mr: 2, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Email Address
                </Typography>
                <Typography variant="body1">{user.email}</Typography>
              </Box>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Person sx={{ mr: 2, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Role
                </Typography>
                <Typography variant="body1" textTransform="capitalize">
                  {user.role}
                </Typography>
              </Box>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CalendarToday sx={{ mr: 2, color: 'text.secondary' }} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Joined Date
                </Typography>
                <Typography variant="body1">
                  {new Date(user.createdAt).toLocaleDateString()} at {new Date(user.createdAt).toLocaleTimeString()}
                </Typography>
              </Box>
            </Box>
            
            {user.lastLogin && (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <CalendarToday sx={{ mr: 2, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Last Login
                  </Typography>
                  <Typography variant="body1">
                    {new Date(user.lastLogin).toLocaleDateString()} at {new Date(user.lastLogin).toLocaleTimeString()}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Actions */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<Edit />}
            component={Link}
            href={`/admin/users/${userId}`}
          >
            Edit User
          </Button>
          
          <Button
            variant="contained"
            startIcon={updatingStatus ? <CircularProgress size={20} /> : user.isActive ? <Block /> : <CheckCircle />}
            onClick={handleStatusToggle}
            disabled={updatingStatus}
            color={user.isActive ? 'error' : 'success'}
          >
            {updatingStatus 
              ? 'Updating...' 
              : user.isActive 
                ? 'Deactivate User' 
                : 'Activate User'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
