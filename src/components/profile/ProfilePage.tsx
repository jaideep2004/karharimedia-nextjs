'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import {
  AccountBalance,
  Badge,
  Business,
  LocationOn,
  LockOutlined,
  Mail,
  Person,
  PhotoCamera,
  Save,
  Shield,
} from '@mui/icons-material';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import { useAuth } from '@/context/AppContext';
import { toast } from 'sonner';

interface ProfilePageProps {
  audience: 'admin' | 'dashboard';
}

const roleLabel = (role?: string) => {
  if (!role) return 'User';
  return role
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const displayValue = (value: unknown): string => {
  if (value === undefined || value === null || String(value).trim() === '') return '-';
  if (Array.isArray(value))
    return (
      value
        .map(displayValue)
        .filter(item => item !== '-')
        .join(', ') || '-'
    );
  if (typeof value === 'object') {
    return (
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined && item !== null && String(item).trim() !== '')
        .map(([key, item]) => `${roleLabel(key)}: ${displayValue(item)}`)
        .join(', ') || '-'
    );
  }
  return String(value);
};

const DetailGrid = ({ items }: { items: Array<[string, unknown]> }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
    {items.map(([label, value]) => (
      <Box
        key={label}
        sx={{
          p: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1.5,
          bgcolor: 'background.default',
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
          {label}
        </Typography>
        <Typography sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>
          {displayValue(value)}
        </Typography>
      </Box>
    ))}
  </Box>
);

const LockedChip = () => <Chip icon={<LockOutlined />} label="Locked" size="small" color="info" />;

export default function ProfilePage({ audience }: ProfilePageProps) {
  const theme = useTheme();
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [profilePicture, setProfilePicture] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const onboarding = user?.onboarding || {};
  const payoutMethod = user?.payoutMethod || onboarding?.payoutMethod;
  const payoutDetails = payoutMethod?.details || {};
  const location = onboarding?.location || {};
  const isLabel = user?.accountType === 'label' || user?.role === 'label';

  const initials = useMemo(() => {
    const source = displayName || artistName || user?.email || 'SA';
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('');
  }, [artistName, displayName, user?.email]);

  useEffect(() => {
    setDisplayName(user?.name || '');
    setArtistName(user?.artistName || '');
    setProfilePicture(user?.profilePicture || '');
  }, [user]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.put('/auth/me', {
        name: displayName.trim(),
        ...(audience === 'dashboard' ? { artistName: artistName.trim() } : {}),
      });
      await refreshUser();
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleProfileImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append('profilePicture', file);
      const response = await axios.put('/auth/me/profile-picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const nextImage = response.data?.data?.profilePicture || '';
      setProfilePicture(nextImage);
      await refreshUser();
      toast.success('Profile image updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload profile image');
    } finally {
      setUploadingImage(false);
    }
  };

  const tabs = [
    { key: 'user', label: 'User Info', icon: <Person fontSize="small" /> },
    ...(audience === 'dashboard'
      ? [
          { key: 'address', label: 'Address', icon: <LocationOn fontSize="small" /> },
          { key: 'verification', label: 'Verification', icon: <Shield fontSize="small" /> },
        ]
      : []),
    ...(audience === 'dashboard' && isLabel
      ? [{ key: 'company', label: 'Company Info', icon: <Business fontSize="small" /> }]
      : []),
    ...(audience === 'dashboard'
      ? [{ key: 'bank', label: 'Bank Details', icon: <AccountBalance fontSize="small" /> }]
      : []),
  ];
  const activeTabKey = tabs[tab]?.key || 'user';

  const profileSummary = (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, md: 2 },
        width: '100%',
        maxWidth: '100%',
        borderRadius: { xs: '15px', md: '35px' },
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)',
        border: '1px solid',
        borderColor:
          theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)',
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 18px 50px rgba(0,0,0,0.34)'
            : '0 18px 50px rgba(27,39,68,0.12)',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'center', sm: 'center' }}
        justifyContent="space-between"
        textAlign={{ xs: 'center', sm: 'left' }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems="center"
          sx={{ minWidth: 0 }}
        >
          <Stack spacing={1} alignItems="center" sx={{ flex: '0 0 auto' }}>
            <Avatar
              src={profilePicture || undefined}
              sx={{
                width: 84,
                height: 84,
                fontSize: 30,
                fontWeight: 900,
                bgcolor: audience === 'admin' ? '#ffffff' : '#ffffff',
                '& img': {
                  objectFit: 'contain',
                },
              }}
            >
              {initials || 'SA'}
            </Avatar>
            <Button
              component="label"
              size="small"
              variant="outlined"
              startIcon={uploadingImage ? <CircularProgress size={16} /> : <PhotoCamera />}
              disabled={uploadingImage}
              sx={{ borderRadius: 999, px: 1.5 }}
            >
              {uploadingImage ? 'Uploading' : 'Profile Image'}
              <input
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleProfileImageUpload}
              />
            </Button>
          </Stack>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={900} sx={{ overflowWrap: 'anywhere' }}>
              {displayName || user?.email || 'Profile'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {user?.email || 'No email available'}
            </Typography>
          </Box>
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          justifyContent={{ xs: 'center', sm: 'flex-end' }}
        >
          <Chip icon={<Shield />} label={roleLabel(user?.role)} size="small" />
          {user?.accountType && user.accountType !== user?.role && (
            <Chip
              icon={<Badge />}
              label={roleLabel(user.accountType)}
              size="small"
              variant="outlined"
            />
          )}
          {user?.verification?.status && (
            <Chip
              label={`KYC ${user.verification.status}`}
              size="small"
              color={
                user.verification.status === 'approved'
                  ? 'success'
                  : user.verification.status === 'rejected'
                    ? 'error'
                    : 'warning'
              }
            />
          )}
        </Stack>
      </Stack>
    </Paper>
  );

  return (
    <Box sx={{ width: '100%' }}>
      <PremiumHeader eyebrow="Account" title="Profile" action={profileSummary} />

      <Stack spacing={3}>
        <Paper
          elevation={0}
          sx={{ ...premiumSurfaceSx(theme), borderRadius: 3, overflow: 'hidden' }}
        >
          <Tabs
            value={tab}
            onChange={(_event, value) => setTab(value)}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{ px: 1, pt: 1, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            {tabs.map((item, index) => (
              <Tab
                key={item.label}
                icon={item.icon}
                iconPosition="start"
                label={
                  audience === 'dashboard' && item.key !== 'user' ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <span>{item.label}</span>
                      <LockedChip />
                    </Stack>
                  ) : (
                    item.label
                  )
                }
                value={index}
                sx={{ textTransform: 'none', fontWeight: 850, minHeight: 54 }}
              />
            ))}
          </Tabs>

          <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            {activeTabKey === 'user' && (
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="h6" fontWeight={900}>
                    User Info
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Keep visible account information current.
                  </Typography>
                </Box>
                <Divider />
                {audience === 'admin' && (
                  <Alert severity="info" sx={{ borderRadius: 2 }}>
                    Admin login email is changed from User Management. Open the admin user record
                    and edit Email Address.
                  </Alert>
                )}
                <TextField
                  label="Display Name"
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                  fullWidth
                  autoComplete="name"
                  InputProps={{
                    startAdornment: <Person sx={{ mr: 1, color: 'text.secondary' }} />,
                  }}
                />
                {audience === 'dashboard' && (
                  <TextField
                    label={isLabel ? 'Representative / Public Name' : 'Artist Name'}
                    value={artistName}
                    onChange={event => setArtistName(event.target.value)}
                    fullWidth
                    autoComplete="organization-title"
                  />
                )}
                <TextField
                  label="Email"
                  value={user?.email || ''}
                  fullWidth
                  disabled
                  helperText="Email changes require admin support."
                  InputProps={{ startAdornment: <Mail sx={{ mr: 1, color: 'text.secondary' }} /> }}
                />
                <TextField label="Role" value={roleLabel(user?.role)} fullWidth disabled />
                {audience === 'dashboard' && (
                  <DetailGrid
                    items={[
                      ['Account Type', onboarding.accountType || user?.accountType],
                      ['Region', onboarding.region],
                      ['Legal Name', onboarding.legalName || onboarding.labelLegalName],
                      ['Phone Number', onboarding.phoneNumber || user?.verification?.phoneNumber],
                      ['Number Of Tracks', onboarding.numberOfTracks],
                      ['Number Of Releases', onboarding.numberOfReleases],
                    ]}
                  />
                )}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<Save />}
                    onClick={handleSave}
                    disabled={saving || !displayName.trim()}
                  >
                    {saving ? 'Saving…' : 'Save Profile'}
                  </Button>
                  {audience === 'admin' && (
                    <Button component={Link} href="/admin/users" variant="outlined">
                      Open User Management
                    </Button>
                  )}
                </Stack>
              </Stack>
            )}

            {activeTabKey === 'address' && (
              <Stack spacing={2.5}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6" fontWeight={900}>
                      Address
                    </Typography>
                    <LockedChip />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Address submitted during KYC.
                  </Typography>
                </Box>
                <Divider />
                <DetailGrid
                  items={[
                    ['Country', location.country],
                    ['State', location.state],
                    ['City', location.city],
                    ['Pincode', location.pincode],
                    ['Address', location.address || onboarding.legalAddress],
                  ]}
                />
              </Stack>
            )}

            {activeTabKey === 'verification' && (
              <Stack spacing={2.5}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6" fontWeight={900}>
                      Verification
                    </Typography>
                    <LockedChip />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    KYC review status and identity numbers. Document images stay hidden.
                  </Typography>
                </Box>
                <Divider />
                <DetailGrid
                  items={[
                    ['KYC Status', user?.verification?.status],
                    ['Aadhaar Number', onboarding.aadhaarNumber],
                    ['PAN Number', onboarding.panNumber],
                    ['Consent', user?.verification?.consent ? 'Yes' : 'No'],
                    [
                      'Submitted',
                      user?.verification?.submittedAt
                        ? new Date(user.verification.submittedAt).toLocaleString()
                        : undefined,
                    ],
                    [
                      'Reviewed',
                      user?.verification?.reviewedAt
                        ? new Date(user.verification.reviewedAt).toLocaleString()
                        : undefined,
                    ],
                    ['Rejection Reason', user?.verification?.rejectionReason],
                    ['Notes', user?.verification?.notes],
                  ]}
                />
              </Stack>
            )}

            {activeTabKey === 'company' && (
              <Stack spacing={2.5}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6" fontWeight={900}>
                      Company Info
                    </Typography>
                    <LockedChip />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Label and company details from KYC onboarding.
                  </Typography>
                </Box>
                <Divider />
                <DetailGrid
                  items={[
                    ['Label Name', onboarding.labelName || user?.artistName],
                    ['Representative Name', onboarding.legalName || user?.name],
                    ['Registration Type', onboarding.registrationType],
                    ['Legal Entity Name', onboarding.legalEntityName],
                    ['Company Type', onboarding.companyType],
                    ['Total Artists', onboarding.totalArtists],
                    ['Catalog Size', onboarding.catalogSize],
                    ['Total Revenue', onboarding.totalRevenue],
                    ['Rights Type', onboarding.rightsType],
                    ['Website', onboarding.companyWebsite],
                    ['Social Links', onboarding.socialLinks],
                    ['Address', onboarding.location?.address || onboarding.legalAddress],
                  ]}
                />
              </Stack>
            )}

            {activeTabKey === 'bank' && (
              <Stack spacing={2.5}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6" fontWeight={900}>
                      Bank Details
                    </Typography>
                    <LockedChip />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Saved payout details are read-only. Contact admin to change payout method or
                    bank details.
                  </Typography>
                </Box>
                <Divider />
                <DetailGrid
                  items={[
                    ['Method', payoutMethod?.method ? roleLabel(payoutMethod.method) : 'Not saved'],
                    ['Account Holder', payoutDetails.accountHolderName],
                    ['Account Number', payoutDetails.accountNumber],
                    ['IFSC', payoutDetails.ifscCode],
                    ['Bank', payoutDetails.bankName],
                    ['Branch', payoutDetails.branch || payoutDetails.branchName],
                    ['PayPal Email', payoutDetails.paypalEmail],
                    [
                      'Updated',
                      payoutMethod?.updatedAt
                        ? new Date(payoutMethod.updatedAt).toLocaleString()
                        : undefined,
                    ],
                  ]}
                />
              </Stack>
            )}
          </Box>
        </Paper>
      </Stack>
    </Box>
  );
}
