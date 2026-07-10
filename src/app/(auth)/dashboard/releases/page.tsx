"use client";
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Alert,
  Avatar,
  Tooltip,
  Skeleton,
  useTheme,
  Button,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TablePagination,
} from '@mui/material';
import {
  Album as AlbumIcon,
  CloudUpload,
  ArrowForward,
  EditNote,
  DeleteOutline,
} from '@mui/icons-material';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import { DspLogo } from '@/components/dsp/DspLogo';
import RouteTabs from '@/components/navigation/RouteTabs';
import { getDspDisplayName } from '@/lib/platforms';
import { useAuth } from '@/context/AppContext';
import { getNormalizedReleaseStatus } from '@/lib/releaseStatus';

const RELEASE_DRAFT_PREFIX = 'karharimedia.releaseDraft.v1.';
const RELEASE_DRAFT_BACKUP_KEY = `${RELEASE_DRAFT_PREFIX}latest`;

const getDraftArtist = (draft: any) => {
  const firstTrack = Array.isArray(draft?.trackInfos) ? draft.trackInfos[0] : null;
  const contributor = Array.isArray(firstTrack?.contributors)
    ? firstTrack.contributors.find((item: any) => item?.role === 'artist' && item?.name)
    : null;
  return contributor?.name || firstTrack?.artist || draft?.primaryArtist || 'Draft artist';
};

const hasDraftContent = (draft: any) =>
  Boolean(
    draft?.releaseTitle ||
      draft?.label ||
      draft?.artworkUploadedUrl ||
      (Array.isArray(draft?.trackInfos) && draft.trackInfos.length > 0) ||
      (Array.isArray(draft?.audioUploadedUrls) && draft.audioUploadedUrls.some(Boolean))
  );

const normalizeReleaseDateKey = (value?: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const getReleaseDedupKey = (release: any) => {
  const title = String(release?.releaseTitle || release?.title || '').trim().toLowerCase();
  const type = String(release?.releaseType || release?.type || '').trim().toLowerCase();
  const date = normalizeReleaseDateKey(release?.releaseDate || release?.createdAt);
  const trackCount = Number(
    release?.trackCount ?? (Array.isArray(release?.tracks) ? release.tracks.length : 0)
  );

  if (!title || !date || trackCount <= 0) return '';
  return [title, type, date, trackCount].join('|');
};

export default function ReleasesPage() {
  return (
    <AuthGuard>
      <ReleasesContent />
    </AuthGuard>
  );
}

function ReleasesContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [releases, setReleases] = useState<any[]>([]);
  const [draftReleases, setDraftReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [counts, setCounts] = useState({
    all: 0,
    pending: 0,
    in_process: 0,
    approved: 0,
    rejected: 0,
    other: 0,
  });
  const [draftDeleteTarget, setDraftDeleteTarget] = useState<any | null>(null);
  const [deletingDraft, setDeletingDraft] = useState(false);

  const currentStatus = searchParams.get('status') || '';

  useEffect(() => {
    setPage(0);
  }, [currentStatus]);

  useEffect(() => {
    const fetchReleases = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          summary: '1',
          page: String(currentStatus === 'draft' ? 1 : page + 1),
          limit: String(currentStatus === 'draft' ? 1 : rowsPerPage),
        });
        if (currentStatus && currentStatus !== 'draft') params.set('status', currentStatus);
        const res = await fetch(`/api/releases?${params.toString()}`);
        const data = await res.json();
        if (data.success) {
          setReleases(currentStatus === 'draft' ? [] : data.releases || data.data || []);
          setPaginationTotal(Number(data.pagination?.total || 0));
          if (data.counts) {
            setCounts({
              all: Number(data.counts.all || 0),
              pending: Number(data.counts.pending || 0),
              in_process: Number(data.counts.in_process || 0),
              approved: Number(data.counts.approved || 0),
              rejected: Number(data.counts.rejected || 0),
              other: Number(data.counts.other || 0),
            });
          }
        } else {
          setError(data.error || 'Failed to fetch releases');
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchReleases();
  }, [currentStatus, page, rowsPerPage]);

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return;
    let cancelled = false;

    const buildDraftRow = (draft: any, key: string) => {
        if (draft?.status !== 'draft' || !hasDraftContent(draft)) return [];
        return [{
          ...draft,
          _id: draft.draftId || key,
          draftId: draft.draftId || key,
          status: 'draft',
          isLocalDraft: true,
          primaryArtist: getDraftArtist(draft),
          artworkUrl: draft.artworkUploadedUrl,
          releaseDate: draft.releaseDate || draft.updatedAt,
          stores: draft.selectedDSPs || [],
          trackCount: Math.max(
            Array.isArray(draft.trackInfos) ? draft.trackInfos.length : 0,
            Array.isArray(draft.audioUploadedUrls) ? draft.audioUploadedUrls.length : 0
          ),
        }];
    };

    const loadDrafts = async () => {
      const seenDrafts = new Set<string>();
      const nextDrafts: any[] = [];

      try {
        const response = await fetch('/api/releases/draft', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.success && Array.isArray(payload?.drafts)) {
          payload.drafts.forEach((draft: any) => {
            nextDrafts.push(...buildDraftRow(draft, draft.draftId || 'server-release-draft'));
          });
          if (nextDrafts.length) {
            if (!cancelled) setDraftReleases(nextDrafts);
            return;
          }
        }
      } catch {}

      const keys = Object.keys(localStorage).filter(
        key =>
          key.startsWith(`${RELEASE_DRAFT_PREFIX}${user.id}.`) ||
          key === `${RELEASE_DRAFT_PREFIX}${user.id}` ||
          key === RELEASE_DRAFT_BACKUP_KEY ||
          key === `${RELEASE_DRAFT_PREFIX}anonymous`
      );
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw || seenDrafts.has(raw)) continue;
        try {
          const draft = JSON.parse(raw);
          seenDrafts.add(raw);
          nextDrafts.push(...buildDraftRow(draft, key));
        } catch {}
      }

      if (!cancelled) setDraftReleases(nextDrafts);
    };

    void loadDrafts();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleDeleteDraft = async () => {
    const draftId = String(draftDeleteTarget?.draftId || '').trim();
    if (!draftId) return;

    setDeletingDraft(true);
    setError('');
    try {
      const response = await fetch(`/api/releases/draft?id=${encodeURIComponent(draftId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to delete draft');
      }

      setDraftReleases(current => current.filter(draft => draft.draftId !== draftId));
      Object.keys(localStorage)
        .filter(key => key.endsWith(`.${draftId}`))
        .forEach(key => localStorage.removeItem(key));
      setDraftDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete draft');
    } finally {
      setDeletingDraft(false);
    }
  };

  const catalogReleases = useMemo(() => {
    const submittedReleaseKeys = new Set(
      releases
        .filter(release => getNormalizedReleaseStatus(release.status) !== 'draft')
        .map(getReleaseDedupKey)
        .filter(Boolean)
    );
    const visibleDrafts = draftReleases.filter(draft => {
      const key = getReleaseDedupKey(draft);
      return !key || !submittedReleaseKeys.has(key);
    });
    return [...visibleDrafts, ...releases];
  }, [draftReleases, releases]);

  const pagedDraftReleases = draftReleases.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const filteredReleases = currentStatus === 'draft'
    ? pagedDraftReleases
    : currentStatus
      ? releases
      : page === 0
        ? catalogReleases
        : releases;
  const tableTotal = currentStatus === 'draft'
    ? draftReleases.length
    : currentStatus
      ? paginationTotal
      : paginationTotal + draftReleases.length;
  const getTrackCount = (release: any) =>
    Number(release.trackCount ?? (Array.isArray(release.tracks) ? release.tracks.length : 0));

  const getStatusChip = (status: string) => {
    const normalized = getNormalizedReleaseStatus(status);
    const map: Record<string, { color: string; bg: string }> = {
      draft: { color: '#94a3b8', bg: isDark ? 'rgba(148,163,184,0.14)' : 'rgba(100,116,139,0.10)' },
      approved: { color: '#10b981', bg: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)' },
      in_process: { color: '#0ea5e9', bg: isDark ? 'rgba(14,165,233,0.14)' : 'rgba(14,165,233,0.09)' },
      pending: { color: '#f59e0b', bg: isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.08)' },
      rejected: { color: '#ef4444', bg: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)' },
    };
    const s = map[normalized] || map.pending;
    const label = status
      ? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'Unknown';
    return (
      <Box
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          px: 1.25, py: 0.35, borderRadius: '6px',
          bgcolor: s.bg, color: s.color,
          fontSize: '0.72rem', fontWeight: 600,
        }}
      >
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: s.color }} />
        {label}
      </Box>
    );
  };

  const renderDSPIcons = (stores: string[]) => {
    if (!Array.isArray(stores) || stores.length === 0) return null;
    const maxShow = 5;
    const shown = stores.slice(0, maxShow);
    const remaining = stores.length - maxShow;

    return (
      <Box sx={{ display: 'flex', gap: 0.35, alignItems: 'center' }}>
        {shown.map((store, i) => {
          const dspName = getDspDisplayName(store);

          return (
            <Tooltip key={`${store}-${i}`} title={dspName}>
              <Box component="span">
                <DspLogo value={store} alt={dspName} size={22} padding={0.25} />
              </Box>
            </Tooltip>
          );
        })}
        {remaining > 0 && (
          <Typography sx={{ fontSize: '0.68rem', color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.4)', ml: 0.25 }}>
            +{remaining}
          </Typography>
        )}
      </Box>
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const tabCounts = {
    '': counts.all + draftReleases.length,
    pending: counts.pending,
    in_process: counts.in_process,
    approved: counts.approved,
    rejected: counts.rejected,
    draft: draftReleases.length,
  };

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <PremiumHeader
        eyebrow="Distribution"
        title="Releases"
        description="Manage your release pipeline across drafts, review, approval, delivery, and takedown states."
      />

      <RouteTabs
        ariaLabel="release catalog sections"
        action={
          <Button
            component={Link}
            href="/dashboard/upload"
            variant="contained"
            size="small"
            startIcon={<CloudUpload />}
            sx={{ borderRadius: '12px', fontWeight: 900, minHeight: 40 }}
          >
            New Release
          </Button>
        }
        items={[
          { label: `All (${tabCounts['']})`, href: '/dashboard/releases' },
          { label: `Pending (${tabCounts.pending})`, href: '/dashboard/releases?status=pending' },
          { label: `In Process (${tabCounts.in_process})`, href: '/dashboard/releases?status=in_process' },
          { label: `Approved (${tabCounts.approved})`, href: '/dashboard/releases?status=approved' },
          { label: `Rejected (${tabCounts.rejected})`, href: '/dashboard/releases?status=rejected' },
          { label: `Drafts (${tabCounts.draft})`, href: '/dashboard/releases?status=draft' },
          { label: 'Tracks', href: '/dashboard/tracks' },
        ]}
      />

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: '12px' }} />
          ))}
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ borderRadius: '12px' }}>{error}</Alert>
      ) : filteredReleases.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center', py: 6,
            borderRadius: '14px',
            bgcolor: isDark ? '#111827' : '#ffffff',
            border: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
          }}
        >
          <AlbumIcon sx={{ fontSize: 48, color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)', mb: 1.5 }} />
          <Typography sx={{ fontWeight: 600, color: isDark ? '#e2e8f0' : '#1e293b', mb: 0.5 }}>
            No {currentStatus || ''} releases found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            {currentStatus === 'pending' ? 'No releases awaiting review' :
             currentStatus === 'rejected' ? 'No rejected releases' :
             currentStatus === 'draft' ? 'No saved draft releases' :
             'Upload your first release to get started'}
          </Typography>
          <Button
            component={Link}
            href="/dashboard/upload"
            variant="contained"
            size="small"
            startIcon={<CloudUpload />}
            sx={{
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #00e7ff 0%, #7b93f9 100%)',
            }}
          >
            Create New Release
          </Button>
        </Box>
      ) : (
        <Box
          sx={{
            ...premiumSurfaceSx(theme),
            overflow: 'hidden',
          }}
        >
          {/* Table Header */}
          <Box
            sx={{
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: '2fr 1fr 0.7fr 1fr 0.8fr',
              gap: 2,
              px: 2.5,
              py: 1.5,
              bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.02)',
              borderBottom: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
            }}
          >
            {['Release', 'Type / Date', 'Tracks', 'Stores', 'Status'].map(h => (
              <Typography
                key={h}
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.4)',
                }}
              >
                {h}
              </Typography>
            ))}
          </Box>

          {/* Rows */}
          {filteredReleases.map((release, idx) => (
            <Box
              key={release._id || idx}
              sx={{
                display: { xs: 'flex', md: 'grid' },
                gridTemplateColumns: { md: '2fr 1fr 0.7fr 1fr 0.8fr' },
                flexDirection: { xs: 'column' },
                gap: { xs: 1, md: 2 },
                px: 2.5,
                py: 2,
                alignItems: { md: 'center' },
                color: 'inherit',
                borderTop: idx > 0 ? '1px solid' : 'none',
                borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                transition: 'background 150ms ease',
                '&:hover': {
                  bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.015)',
                },
              }}
            >
              {/* Release Info */}
              <Box
                component={Link}
                href={
                  release.isLocalDraft
                    ? `/dashboard/upload?draft=${encodeURIComponent(release.draftId)}`
                    : `/dashboard/releases/${release._id}`
                }
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  minWidth: 0,
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <Avatar
                  variant="rounded"
                  src={release.artworkUrl}
                  sx={{
                    width: 44, height: 44,
                    borderRadius: '8px',
                    bgcolor: isDark ? '#1e293b' : '#e2e8f0',
                    flexShrink: 0,
                  }}
                >
                  {release.isLocalDraft ? <EditNote sx={{ fontSize: 20 }} /> : <AlbumIcon sx={{ fontSize: 20 }} />}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontWeight: 600, fontSize: '0.88rem',
                      color: isDark ? '#e2e8f0' : '#1e293b',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {release.releaseTitle || 'Untitled Release'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.4)' }}>
                    {release.primaryArtist || 'Unknown Artist'}
                  </Typography>
                </Box>
              </Box>

              {/* Type / Date */}
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <Typography sx={{ fontSize: '0.82rem', color: isDark ? '#e2e8f0' : '#1e293b', fontWeight: 500 }}>
                  {release.releaseType || 'Single'}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.4)' }}>
                  {formatDate(release.releaseDate)}
                </Typography>
              </Box>

              {/* Tracks */}
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: isDark ? '#e2e8f0' : '#1e293b' }}>
                  {getTrackCount(release)}
                </Typography>
              </Box>

              {/* Stores */}
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                {renderDSPIcons(release.stores || [])}
              </Box>

              {/* Status */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'flex-start' }, gap: 1 }}>
                {getStatusChip(release.status)}
                {release.isLocalDraft ? (
                  <Tooltip title="Delete draft">
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Delete draft ${release.releaseTitle || 'Untitled Release'}`}
                      onClick={() => setDraftDeleteTarget(release)}
                      sx={{ width: 32, height: 32 }}
                    >
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <IconButton
                    component={Link}
                    href={`/dashboard/releases/${release._id}`}
                    size="small"
                    aria-label={`Open ${release.releaseTitle || 'release'}`}
                    sx={{ width: 32, height: 32 }}
                  >
                    <ArrowForward sx={{ fontSize: 14 }} />
                  </IconButton>
                )}
              </Box>

              {/* Mobile: extra info */}
              <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 2, alignItems: 'center', mt: 0.5 }}>
                <Typography sx={{ fontSize: '0.72rem', color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.45)' }}>
                  {release.releaseType} · {getTrackCount(release)} tracks · {formatDate(release.releaseDate)}
                </Typography>
              </Box>
            </Box>
          ))}
          <TablePagination
            component="div"
            count={tableTotal}
            page={page}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[5, 10, 25, 50]}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(Number(event.target.value));
              setPage(0);
            }}
          />
        </Box>
      )}
      <Dialog
        open={Boolean(draftDeleteTarget)}
        onClose={() => !deletingDraft && setDraftDeleteTarget(null)}
        aria-labelledby="delete-draft-title"
      >
        <DialogTitle id="delete-draft-title">Delete draft?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently deletes “{draftDeleteTarget?.releaseTitle || 'Untitled Release'}”.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraftDeleteTarget(null)} disabled={deletingDraft}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteDraft}
            disabled={deletingDraft}
          >
            {deletingDraft ? 'Deleting…' : 'Delete draft'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
