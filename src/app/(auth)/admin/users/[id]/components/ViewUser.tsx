'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Paper,
  Stack,
} from '@mui/material';
import { 
  Edit, 
  Block, 
  CheckCircle,
  Email,
  Person,
  CalendarToday,
  VerifiedUser,
  Cancel,
  Visibility,
  FactCheck,
} from '@mui/icons-material';
import { adminAPI } from '@/services/api';
import { useColorMode } from '@/context/ColorModeContext';
import { resolveMediaUrl } from '@/lib/urlConfig';
import Link from 'next/link';
import AdminKycFileDialog from './AdminKycFileDialog';

const toAssetUrl = (value?: string) => {
  return resolveMediaUrl(value);
};

export default function ViewUser({ user, onUserUpdate, onEdit }: { user: any; onUserUpdate: () => void; onEdit?: () => void }) {
  const { mode } = useColorMode();
  
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [reviewingKyc, setReviewingKyc] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);

  const handleStatusToggle = async () => {
    try {
      setUpdatingStatus(true);
      const newStatus = !user.isActive;
      
      const response = await adminAPI.updateUser(user._id, {
        isActive: newStatus
      });
      
      if (response.success) {
        onUserUpdate();
      }
    } catch (err: any) {
      console.error('Error updating user status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleKycReview = async (status: 'approved' | 'rejected') => {
    try {
      setReviewingKyc(true);
      const response = await adminAPI.reviewUserVerification(user._id, {
        status,
        rejectionReason: status === 'rejected' ? 'KYC details need correction. Please resubmit with valid information.' : undefined,
      });
      if (response.success) onUserUpdate();
    } catch (err: any) {
      console.error('Error updating KYC status:', err);
    } finally {
      setReviewingKyc(false);
    }
  };

  const openKycFile = () => {
    setKycOpen(true);
  };

  const verificationStatus = user.verification?.status || 'pending';
  const verificationColor =
    verificationStatus === 'approved' ? 'success' :
    verificationStatus === 'rejected' ? 'error' :
    verificationStatus === 'submitted' ? 'warning' :
    'info';
  const profilePicture = toAssetUrl(user.profilePicture);

  return (  
    <Box>
      {/* User Header */}   
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        {profilePicture ? (
          <Box
            component="img"
            src={profilePicture}
            alt={`${user.name} profile`}
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              objectFit: 'cover',
              mr: 3,
            }}
          />
        ) : (
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
        )}
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
          <Chip
            label={`KYC ${verificationStatus}`}
            color={verificationColor as any}
            size="small"
            sx={{ ml: 1 }}
          />
        </Box>
      </Box>

      {user.role !== 'admin' && (
        <Paper variant="outlined" sx={{ p: 2.5, mb: 4, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="h6" fontWeight={700}>KYC Review</Typography>
              <Typography variant="body2" color="text.secondary">
                Provider: {user.verification?.kycProvider || 'Not selected'} | Mobile: {user.verification?.mobileProvider || 'Not selected'}
              </Typography>
              {user.verification?.rejectionReason && (
                <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                  {user.verification.rejectionReason}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="contained"
                color="info"
                startIcon={<FactCheck />}
                onClick={openKycFile}
              >
                Review KYC File
              </Button>
              <Button
                component={Link}
                href={`/admin/users/${user._id}/preview`}
                variant="outlined"
                startIcon={<Visibility />}
              >
                View As User
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={reviewingKyc ? <CircularProgress size={18} /> : <VerifiedUser />}
                disabled={reviewingKyc || verificationStatus === 'approved'}
                onClick={() => handleKycReview('approved')}
              >
                Approve KYC
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<Cancel />}
                disabled={reviewingKyc || verificationStatus === 'rejected'}
                onClick={() => handleKycReview('rejected')}
              >
                Reject
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      <AdminKycFileDialog
        open={kycOpen}
        user={user}
        onClose={() => setKycOpen(false)}
        onSaved={onUserUpdate}
      />

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

      {/* Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<Edit />}
          onClick={onEdit}
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
    </Box>
  );
}
