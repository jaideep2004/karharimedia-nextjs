'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Divider, Stack, Typography, useTheme } from '@mui/material';
import {
  AccountBalance,
  ArrowBack,
  Album,
  CheckCircle,
  Edit,
  Paid,
  Person,
  Phone,
  RequestQuote,
  Security,
} from '@mui/icons-material';
import { adminAPI } from '@/services/api';
import { PremiumHeader, PremiumPanel, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import AdminKycFileDialog from '../components/AdminKycFileDialog';
import { getNormalizedReleaseStatus, getReleaseStatusLabel } from '@/lib/releaseStatus';

export default function UserPreviewPage() {
  const params = useParams<{ id: string }>();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [user, setUser] = useState<any>(null);
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);
  const [actionRailPinned, setActionRailPinned] = useState(false);
  const [actionRailFrame, setActionRailFrame] = useState({ left: 0, width: 0, height: 0 });
  const actionRailRef = useRef<HTMLDivElement | null>(null);
  const releasesRef = useRef<HTMLDivElement | null>(null);
  const payoutsRef = useRef<HTMLDivElement | null>(null);

  const surfaceSx = {
    ...premiumSurfaceSx(theme),
    borderRadius: '16px',
    bgcolor: isDark ? '#111827' : '#ffffff',
    backgroundImage: 'none',
    boxShadow: isDark ? '0 18px 44px rgba(0,0,0,0.18)' : '0 18px 44px rgba(15,23,42,0.06)',
  };
  const headingText = isDark ? '#f1f5f9' : '#0f172a';
  const mutedText = isDark ? 'rgba(255,255,255,0.54)' : 'rgba(15,23,42,0.54)';
  const releasesStats = useMemo(() => {
    const approved = releases.filter((release) => getNormalizedReleaseStatus(release.status) === 'approved').length;
    const rejected = releases.filter((release) => getNormalizedReleaseStatus(release.status) === 'rejected').length;
    const pending = releases.filter((release) => getNormalizedReleaseStatus(release.status) === 'pending').length;
    const tracks = releases.reduce((sum, release) => sum + Number(release.trackCount ?? (Array.isArray(release.tracks) ? release.tracks.length : 0)), 0);
    const revenue = releases.reduce(
      (sum, release) => sum + Number(release.revenue || release.totalRevenue || release.royaltyAmount || release.earnings || 0),
      0
    );
    return { approved, rejected, pending, tracks, revenue };
  }, [releases]);
  const payout = user?.payoutMethod || user?.onboarding?.payoutMethod || {};
  const payoutDetails = payout.details || {};
  const location = user?.onboarding?.location || {};

  const handleStatusToggle = async () => {
    if (!user?._id) return;
    try {
      setStatusSaving(true);
      const response = await adminAPI.updateUser(user._id, { isActive: !user.isActive });
      if (response.success) {
        setUser((current: any) => ({ ...current, isActive: !current.isActive }));
      }
    } finally {
      setStatusSaving(false);
    }
  };

  const scrollToSection = (target: HTMLDivElement | null) => {
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const syncActionRail = () => {
      const element = actionRailRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setActionRailFrame({
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
      setActionRailPinned(rect.top <= 0);
    };

    syncActionRail();
    window.addEventListener('scroll', syncActionRail, { passive: true });
    window.addEventListener('resize', syncActionRail);
    return () => {
      window.removeEventListener('scroll', syncActionRail);
      window.removeEventListener('resize', syncActionRail);
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await adminAPI.getUserById(params.id);
        if (!response.success) throw new Error(response.message || 'Failed to load user');
        setUser(response.data);
        void fetch(`/api/admin/users/${params.id}/preview-audit`, { method: 'POST' });
        const releaseResponse = await fetch(`/api/releases?userId=${encodeURIComponent(params.id)}&summary=1`, { cache: 'no-store' });
        const releasePayload = await releaseResponse.json().catch(() => null);
        setReleases(Array.isArray(releasePayload?.releases) ? releasePayload.releases : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load user');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [params.id]);

  if (loading) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 420 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Alert
        severity="info"
        icon={<Security />}
        sx={{
          mb: 2.5,
          borderRadius: '999px',
          bgcolor: isDark ? 'rgba(14,165,233,0.10)' : 'rgba(236,253,255,0.92)',
          border: '1px solid',
          borderColor: isDark ? 'rgba(125,211,252,0.16)' : 'rgba(14,165,233,0.14)',
          color: isDark ? '#dff6ff' : '#164e63',
          '& .MuiAlert-icon': { color: '#38bdf8' },
        }}
      >
        Admin operations view. Profile edits, release review, status control, and payout review actions are enabled from here.
      </Alert>
      <PremiumHeader
        eyebrow="View As User"
        title={user?.artistName || user?.name || 'User Preview'}
        description={`Inspecting ${user?.email || 'user'} profile, catalog, payouts, and account state.`}
        action={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button onClick={() => setKycOpen(true)} variant="contained" startIcon={<Edit />} sx={{ borderRadius: '12px', fontWeight: 900 }}>
              Edit User
            </Button>
            <Button component={Link} href={`/admin/users/${params.id}`} variant="outlined" startIcon={<ArrowBack />} sx={{ borderRadius: '12px', fontWeight: 900 }}>
              Back
            </Button>
          </Stack>
        }
      />
      <Box
        ref={actionRailRef}
        sx={{
          mb: 2.5,
          minHeight: actionRailPinned ? `${actionRailFrame.height}px` : undefined,
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.25}
          sx={{
            position: actionRailPinned ? 'fixed' : 'relative',
            top: actionRailPinned ? 0 : 'auto',
            left: actionRailPinned ? actionRailFrame.left : 'auto',
            width: actionRailPinned ? actionRailFrame.width : 'auto',
            zIndex: (theme) => theme.zIndex.appBar + 5,
            py: 1,
            px: 0.75,
            borderRadius: actionRailPinned ? '0 0 18px 18px' : '18px',
            bgcolor: isDark ? 'rgba(11,16,32,0.94)' : 'rgba(238,243,248,0.96)',
            backdropFilter: 'blur(14px)',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
            boxShadow: actionRailPinned
              ? isDark ? '0 18px 44px rgba(0,0,0,0.28)' : '0 18px 44px rgba(15,23,42,0.14)'
              : 'none',
          }}
        >
          <Button
            variant={user?.isActive ? 'outlined' : 'contained'}
            color={user?.isActive ? 'error' : 'success'}
            onClick={handleStatusToggle}
            disabled={statusSaving}
            startIcon={statusSaving ? <CircularProgress size={16} /> : <Security />}
            sx={{ borderRadius: '12px', fontWeight: 900 }}
          >
            {user?.isActive ? 'Deactivate User' : 'Activate User'}
          </Button>
          <Button variant="outlined" startIcon={<Edit />} onClick={() => setKycOpen(true)} sx={{ borderRadius: '12px', fontWeight: 900 }}>
            Edit User
          </Button>
          <Button onClick={() => scrollToSection(releasesRef.current)} variant="outlined" startIcon={<Album />} sx={{ borderRadius: '12px', fontWeight: 900 }}>
            Review Releases
          </Button>
          <Button onClick={() => scrollToSection(payoutsRef.current)} variant="outlined" startIcon={<Paid />} sx={{ borderRadius: '12px', fontWeight: 900 }}>
            Payout Tools
          </Button>
        </Stack>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2.5 }}>
        {[
          { icon: <Person />, title: 'Profile', text: `${user?.role || 'artist'} account`, meta: `${user?.verification?.status || 'pending'} KYC · ${user?.accountType || 'artist'}`, color: '#00e7ff' },
          { icon: <Album />, title: 'Releases', text: `${releases.length} matched`, meta: `${releasesStats.approved} approved · ${releasesStats.rejected} rejected · ${releasesStats.pending} pending`, color: '#f59e0b' },
          { icon: <RequestQuote />, title: 'Payouts', text: user?.payoutMethod?.method ? 'Method Saved' : 'No Method', meta: user?.payoutMethod?.method ? user.payoutMethod.method.replace('_', ' ') : 'No saved payout method yet', color: '#10b981' },
          { icon: <Phone />, title: 'Contact', text: user?.onboarding?.phoneNumber || user?.verification?.phoneNumber || 'No phone', meta: user?.email || 'No email', color: '#0ea5e9' },
          { icon: <Paid />, title: 'Revenue', text: `$${releasesStats.revenue.toFixed(2)}`, meta: `${releasesStats.tracks} total tracks`, color: '#ec4899' },
          { icon: <AccountBalance />, title: 'Bank', text: payoutDetails.bankName || payoutDetails.accountNumber ? 'Details Saved' : 'No Bank', meta: payoutDetails.accountHolderName || payout.method || 'No payout method', color: '#14b8a6' },
        ].map((item) => (
          <Box key={item.title} sx={{ ...surfaceSx, p: 3, minHeight: 170 }}>
            <Stack spacing={1.75}>
              <Avatar sx={{ width: 46, height: 46, borderRadius: '12px', bgcolor: `${item.color}18`, color: item.color }}>
                {item.icon}
              </Avatar>
              <Box>
                <Typography sx={{ color: mutedText, fontSize: '0.78rem', fontWeight: 900 }}>{item.title}</Typography>
                <Typography variant="h5" sx={{ color: headingText, fontWeight: 900, mt: 0.25 }}>{item.text}</Typography>
                <Typography sx={{ color: mutedText, mt: 0.35 }}>{item.meta}</Typography>
              </Box>
            </Stack>
          </Box>
        ))}
      </Box>

      <PremiumPanel sx={{ mt: 2.5, p: { xs: 3, md: 4 }, borderRadius: '16px' }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900, color: headingText }}>Profile Snapshot</Typography>
            <Typography sx={{ color: mutedText, mt: 0.5 }}>Core user identity and verification state.</Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {[
              ['Name', user?.name || '-'],
              ['Email', user?.email || '-'],
              ['Artist / Label', user?.artistName || user?.onboarding?.labelName || '-'],
              ['KYC', user?.verification?.status || 'pending'],
              ['Mobile', user?.onboarding?.phoneNumber || user?.verification?.phoneNumber || '-'],
              ['Joined', user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'],
              ['Legal name', user?.onboarding?.legalName || '-'],
              ['Country', location.country || '-'],
              ['State', location.state || '-'],
              ['City', location.city || '-'],
              ['Address', location.address || user?.onboarding?.legalAddress || '-'],
              ['PAN', user?.onboarding?.panNumber || '-'],
              ['Aadhaar', user?.onboarding?.aadhaarNumber || '-'],
            ].map(([label, value]) => (
              <Box
                key={label}
                sx={{
                  p: 2.25,
                  borderRadius: '14px',
                  bgcolor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(248,250,252,0.86)',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)',
                }}
              >
                <Typography variant="caption" sx={{ color: mutedText, fontWeight: 900 }}>{label}</Typography>
                <Typography sx={{ fontWeight: 900, color: headingText, wordBreak: 'break-word', mt: 0.35 }}>{value}</Typography>
              </Box>
            ))}
          </Box>
        </Stack>
      </PremiumPanel>

      <Box ref={payoutsRef} sx={{ scrollMarginTop: 150 }}>
      <PremiumPanel sx={{ mt: 2.5, p: { xs: 3, md: 4 }, borderRadius: '16px' }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900, color: headingText }}>Bank and Permissions</Typography>
            <Typography sx={{ color: mutedText, mt: 0.5 }}>Payout identity plus writable admin controls for this account.</Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {[
              ['Payout method', payout.method || '-'],
              ['Account holder', payoutDetails.accountHolderName || '-'],
              ['Account number', payoutDetails.accountNumber || '-'],
              ['IFSC', payoutDetails.ifscCode || '-'],
              ['Bank name', payoutDetails.bankName || '-'],
              ['Branch', payoutDetails.branch || '-'],
              ['PayPal', payoutDetails.paypalEmail || '-'],
              ['Status write', user?.isActive ? 'Can deactivate' : 'Can activate'],
              ['Release write', 'Can review and change status'],
            ].map(([label, value]) => (
              <Box
                key={label}
                sx={{
                  p: 2.25,
                  borderRadius: '14px',
                  bgcolor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(248,250,252,0.86)',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)',
                }}
              >
                <Typography variant="caption" sx={{ color: mutedText, fontWeight: 900 }}>{label}</Typography>
                <Typography sx={{ fontWeight: 900, color: headingText, wordBreak: 'break-word', mt: 0.35 }}>{value}</Typography>
              </Box>
            ))}
          </Box>
        </Stack>
      </PremiumPanel>
      </Box>

      <Box ref={releasesRef} sx={{ scrollMarginTop: 150 }}>
      <PremiumPanel sx={{ mt: 2.5, p: { xs: 3, md: 4 }, borderRadius: '16px' }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 900, color: headingText }}>Release Preview</Typography>
            <Typography sx={{ color: mutedText, mt: 0.5 }}>Matched catalog entries visible to this account.</Typography>
          </Box>
          <Divider sx={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }} />
          {releases.length === 0 ? (
            <Box sx={{ minHeight: 180, display: 'grid', placeItems: 'center', borderRadius: '14px', border: '1px dashed', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)' }}>
              <Stack alignItems="center" spacing={1}>
                <CheckCircle sx={{ color: '#10b981' }} />
                <Typography sx={{ color: mutedText, fontWeight: 800 }}>No releases matched this user profile yet.</Typography>
              </Stack>
            </Box>
          ) : (
            releases.slice(0, 8).map((release) => (
              <Box
                key={release._id}
                component={Link}
                href={`/admin/releases/${release._id}`}
                sx={{
                  display: 'block',
                  textDecoration: 'none',
                  p: 2,
                  borderRadius: '14px',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                  bgcolor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(248,250,252,0.72)',
                  transition: 'border-color 160ms ease, transform 160ms ease, background-color 160ms ease',
                  '&:hover': {
                    borderColor: '#00e7ff',
                    transform: 'translateY(-1px)',
                    bgcolor: isDark ? 'rgba(0,231,255,0.10)' : 'rgba(91,95,247,0.06)',
                  },
                }}
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={2}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar src={release.artworkUrl || undefined} variant="rounded" sx={{ width: 54, height: 54, borderRadius: 2 }}>
                      <Album />
                    </Avatar>
                    <Box>
                      <Typography sx={{ fontWeight: 900, color: headingText }}>{release.releaseTitle || 'Untitled Release'}</Typography>
                      <Typography variant="body2" sx={{ color: mutedText }}>
                        {release.primaryArtist || 'Unknown artist'} · {Number(release.trackCount ?? (Array.isArray(release.tracks) ? release.tracks.length : 0))} tracks
                      </Typography>
                    </Box>
                  </Stack>
                  <Chip
                    label={getReleaseStatusLabel(release.status)}
                    size="small"
                    sx={{ borderRadius: '999px', fontWeight: 900 }}
                    color={getNormalizedReleaseStatus(release.status) === 'approved' ? 'success' : getNormalizedReleaseStatus(release.status) === 'rejected' ? 'error' : 'warning'}
                  />
                </Stack>
              </Box>
            ))
          )}
        </Stack>
      </PremiumPanel>
      </Box>
      <AdminKycFileDialog
        open={kycOpen}
        user={user}
        onClose={() => setKycOpen(false)}
        onSaved={(updatedUser) => {
          if (updatedUser) setUser((current: any) => ({ ...current, ...updatedUser }));
        }}
      />
    </Box>
  );
}
