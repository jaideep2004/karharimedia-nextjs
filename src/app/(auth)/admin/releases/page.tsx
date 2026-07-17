'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Typography,
  Paper,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Box,
  Button,
  Tabs,
  Tab,
  useTheme,
  useMediaQuery,
  Tooltip,
  Avatar,
  InputAdornment,
  MenuItem,
  Stack,
  TablePagination,
  TextField,
  alpha,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  InputLabel,
  FormControl,
  Select,
  SelectChangeEvent,
} from '@mui/material';
import StatusBadge from '@/components/StatusBadge';
import {
  Album,
  Sync,
  Link as LinkIcon,
  CheckCircle,
  Pending,
  Cancel,
  MusicNote,
  Search,

  UploadFile,
  Delete as DeleteIcon,
  DeleteSweep as DeleteSweepIcon,
  ArrowUpward,
  ArrowDownward,
  EditNote,
} from '@mui/icons-material';
import Link from 'next/link';
import { adminAPI, releaseAPI } from '@/services/api';
import { useColorMode } from '@/context/ColorModeContext';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import { useRouter } from 'next/navigation';
import { DspLogo } from '@/components/dsp/DspLogo';
import { getDspDisplayName } from '@/lib/platforms';
import { getNormalizedReleaseStatus, getReleaseStatusLabel } from '@/lib/releaseStatus';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`releases-tabpanel-${index}`}
      aria-labelledby={`releases-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 2.5 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `releases-tab-${index}`,
    'aria-controls': `releases-tabpanel-${index}`,
  };
}

export default function AdminReleasesPage() {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
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
  const [pendingExporting, setPendingExporting] = useState(false);
  const [pendingExportMessage, setPendingExportMessage] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [drafts, setDrafts] = useState<any[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [deleteOldDialogOpen, setDeleteOldDialogOpen] = useState(false);
  const [deleteOldDays, setDeleteOldDays] = useState(90);
  const { mode } = useColorMode();

  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Set initial tab based on status filter
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setStatusFilter(new URLSearchParams(window.location.search).get('status'));
    }
  }, []);

  useEffect(() => {
    if (statusFilter === 'pending') {
      setTabValue(1);
    } else if (statusFilter === 'in_process') {
      setTabValue(2);
    } else if (statusFilter === 'approved') {
      setTabValue(3);
    } else if (statusFilter === 'rejected') {
      setTabValue(4);
    } else if (statusFilter === 'drafts') {
      setTabValue(5);
      void fetchDrafts();
    } else {
      setTabValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const statusKeys = ['', 'pending', 'in_process', 'approved', 'rejected'];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (tabValue === 5) {
      void fetchDrafts();
      return;
    }
    void fetchReleases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, tabValue, typeFilter, debouncedSearchTerm, sortOrder, dateFrom, dateTo]);

  const fetchReleases = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await releaseAPI.getReleases({
        summary: '1',
        page: page + 1,
        limit: rowsPerPage,
        status: statusKeys[tabValue] || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        search: debouncedSearchTerm || undefined,
        sort: sortOrder,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (response && response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        setReleases(data);
        setPaginationTotal(response.pagination?.total ?? data.length);
        if (response.counts) {
          setCounts({
            all: Number(response.counts.all || 0),
            pending: Number(response.counts.pending || 0),
            in_process: Number(response.counts.in_process || 0),
            approved: Number(response.counts.approved || 0),
            rejected: Number(response.counts.rejected || 0),
            other: Number(response.counts.other || 0),
          });
        }
      } else {
        setError('Failed to load releases');
        setReleases([]);
        setPaginationTotal(0);
      }
    } catch {
      setError('An error occurred while fetching releases');
      setReleases([]);
      setPaginationTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchDrafts = async () => {
    try {
      setDraftsLoading(true);
      const response = await adminAPI.getDrafts();
      if (response?.success) {
        setDrafts(response.drafts || []);
      }
    } catch {
      setDrafts([]);
    } finally {
      setDraftsLoading(false);
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    setDeletingDraftId(draftId);
    try {
      await adminAPI.deleteDraft(draftId);
      setDrafts((prev) => prev.filter((d) => d._id !== draftId));
    } catch {
      // ignore
    } finally {
      setDeletingDraftId(null);
    }
  };

  const handleDeleteOldDrafts = async () => {
    try {
      setDeleteOldDialogOpen(false);
      const response = await adminAPI.deleteOldDrafts(deleteOldDays);
      if (response?.success) {
        await fetchDrafts();
      }
    } catch {
      // ignore
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    if (newValue === 6) {
      router.push('/admin/export');
      return;
    }
    if (newValue === 5) {
      setTabValue(5);
      setPage(0);
      router.push('/admin/releases?status=drafts');
      void fetchDrafts();
      return;
    }
    setTabValue(newValue);
    setPage(0);
    const nextStatus = ['', 'pending', 'in_process', 'approved', 'rejected'][newValue];
    setStatusFilter(nextStatus || null);
    router.push(nextStatus ? `/admin/releases?status=${nextStatus}` : '/admin/releases');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getTrackCount = (release: any) =>
    Number(release.trackCount ?? (Array.isArray(release.tracks) ? release.tracks.length : 0));
  const getReleaseArtwork = (release: any) =>
    release.artworkUrl || release.artwork || release.coverArt || release.artworkFile || '';
  const pendingCount = counts.pending;
  const inProcessCount = counts.in_process;
  const approvedCount = counts.approved;
  const rejectedCount = counts.rejected;

  const releaseTypeOptions = useMemo(() => ['single', 'ep', 'album'], []);
  const paginatedReleases = releases;

  const resetPage = () => setPage(0);
  const handlePendingExport = async () => {
    try {
      setPendingExporting(true);
      setPendingExportMessage('');
      const response = await fetch('/api/admin/export/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'status',
          statuses: ['pending', 'pending_review'],
          zipGrouping: 'per_release',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to start pending export');
      }
      setPendingExportMessage('Pending catalog export started. Downloads will appear in Export.');
    } catch (err) {
      setPendingExportMessage(err instanceof Error ? err.message : 'Failed to start pending export');
    } finally {
      setPendingExporting(false);
    }
  };

  const tabItems = [
    { label: 'All', count: counts.all, icon: <Album fontSize="small" />, color: theme.palette.primary.main },
    { label: 'Pending', count: pendingCount, icon: <Pending fontSize="small" />, color: '#f59e0b' },
    { label: 'In Process', count: inProcessCount, icon: <Sync fontSize="small" />, color: '#0ea5e9' },
    { label: 'Approved', count: approvedCount, icon: <CheckCircle fontSize="small" />, color: '#10b981' },
    { label: 'Rejected', count: rejectedCount, icon: <Cancel fontSize="small" />, color: '#ef4444' },
    { label: 'Drafts', count: drafts.length || null, icon: <EditNote fontSize="small" />, color: '#8b5cf6' },
    { label: 'Export Catalog', count: null, icon: <UploadFile fontSize="small" />, color: '#0ea5e9' },
  ];

  // Render DSP chips with icons
  const renderDSPChips = (stores: string[]) => {
    if (!Array.isArray(stores) || stores.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          N/A
        </Typography>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {stores.slice(0, 3).map((store, index) => {
          const dspName = getDspDisplayName(store);

          return (
            <Tooltip key={`${store}-${index}`} title={dspName}>
              <Box component="span">
                <DspLogo value={store} alt={dspName} size={24} padding={0.25} />
              </Box>
            </Tooltip>
          );
        })}
        {stores.length > 3 && (
          <Chip
            label={`+${stores.length - 3}`}
            size="small"
            sx={{ height: 24, fontSize: '0.7rem' }}
          />
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <PremiumHeader
        eyebrow="Admin Review"
        title="Release Management"
        description="Review, approve, reject, and inspect delivery-ready releases across all DSPs."
      />

      <Paper
        elevation={0}
        sx={{
          ...premiumSurfaceSx(theme),
          mb: 4,
          padding:"10px"
        }}
      >
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="releases tabs"
          variant={isMobile ? 'scrollable' : 'fullWidth'}
          scrollButtons="auto"
          sx={{
            px: 1,
            pt: 1,
            borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'}`,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 850,
              minHeight: 54,
              borderRadius: 2,
              mx: 0.5,
              color: mode === 'dark' ? 'rgba(255,255,255,0.74)' : 'rgba(15,23,42,0.72)',
              '&.Mui-selected': {
                color: '#fff',
              },
            },
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: 999,
              backgroundColor: '#fff',
            },
          }}
        >
          {tabItems.map((item, index) => (
            <Tab
              key={item.label}
              icon={item.icon}
              iconPosition="start"
              label={item.count === null ? item.label : `${item.label} (${item.count})`}
              {...a11yProps(index)}
              sx={{
                minHeight: 46,
                mx: 0.5,
                mb: 0.75,
                borderRadius: '14px',
                bgcolor: tabValue === index
                  ? item.color
                  : mode === 'dark'
                    ? 'rgba(255,255,255,0.045)'
                    : 'rgba(15,23,42,0.045)',
                color: tabValue === index
                  ? mode === 'dark' && index === 0
                    ? '#000'
                    : '#fff'
                  : mode === 'dark'
                    ? 'rgba(255,255,255,0.78)'
                    : 'rgba(15,23,42,0.76)',
                opacity: 1,
                boxShadow: tabValue === index ? `0 14px 28px ${alpha(item.color, 0.34)}` : 'none',
                transition: 'transform 160ms ease, background-color 160ms ease, color 160ms ease, box-shadow 160ms ease',
                '&.Mui-selected': {
                  bgcolor: item.color,
                  color: mode === 'dark' && index === 0 ? '#000' : '#fff',
                  opacity: 1,
                },
                '&:hover': {
                  bgcolor: tabValue === index ? item.color : alpha(item.color, mode === 'dark' ? 0.18 : 0.11),
                  transform: 'translateY(-1px)',
                },
                '& .MuiTab-iconWrapper': { mr: 0.75 },
              }}
            />
          ))}
        </Tabs>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          sx={{ p: 1.5, alignItems: { md: 'center' } }}
        >
          <TextField
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              resetPage();
            }}
            placeholder="Search all releases by title, artist, label, UPC..."
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          {tabValue < 5 ? (
            <>
              <Button
                variant="outlined"
                onClick={() => setSortOrder((s) => (s === 'newest' ? 'oldest' : 'newest'))}
                startIcon={sortOrder === 'newest' ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />}
                size="small"
                sx={{ minHeight: 40, whiteSpace: 'nowrap', px: 2, minWidth: 150 }}
              >
                {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
              </Button>
              <TextField
                type="date"
                label="From"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 130, '& input': { fontSize: '0.8rem', py: 0.75 } }}
              />
              <TextField
                type="date"
                label="To"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 130, '& input': { fontSize: '0.8rem', py: 0.75 } }}
              />
            </>
          ) : null}
          <TextField
            select
            label="Type"
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              resetPage();
            }}
            size="small"
            sx={{ minWidth: { xs: '100%', md: 170 } }}
          >
            <MenuItem value="all">All types</MenuItem>
            {releaseTypeOptions.map((type) => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </TextField>
          {tabValue === 1 ? (
            <Button
              variant="contained"
              startIcon={pendingExporting ? <CircularProgress size={16} color="inherit" /> : <UploadFile />}
              onClick={handlePendingExport}
              disabled={pendingExporting}
              sx={{
                minHeight: 40,
                whiteSpace: 'nowrap',
                px: 2,
                bgcolor: '#0ea5e9',
                '&:hover': { bgcolor: '#0284c7' },
              }}
              style={{padding:"10px 20px"}}
            >
              {pendingExporting ? 'Starting' : 'Export Pending'}
            </Button>
          ) : null}
        </Stack>

        {pendingExportMessage ? (
          <Alert
            severity={pendingExportMessage.toLowerCase().includes('started') ? 'success' : 'error'}
            sx={{ mx: 1.5, mb: 1.5 }}
            onClose={() => setPendingExportMessage('')}
          >
            {pendingExportMessage}
          </Alert>
        ) : null}

        <TabPanel value={tabValue} index={0}>
          {renderReleasesTable()}
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          {renderReleasesTable()}
        </TabPanel>
        <TabPanel value={tabValue} index={2}>
          {renderReleasesTable()}
        </TabPanel>
        <TabPanel value={tabValue} index={3}>
          {renderReleasesTable()}
        </TabPanel>
        <TabPanel value={tabValue} index={4}>
          {renderReleasesTable()}
        </TabPanel>
        <TabPanel value={tabValue} index={5}>
          {renderDraftsTable()}
        </TabPanel>
      </Paper>
    </Box>
  );

  function renderDraftsTable() {
    if (draftsLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (drafts.length === 0) {
      return (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <EditNote sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No drafts found</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            There are no saved drafts across all users.
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ px: 0 }}>
        <Stack direction="row" spacing={1.5} sx={{ mb: 2, justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteSweepIcon />}
            onClick={() => setDeleteOldDialogOpen(true)}
            size="small"
          >
            Delete Old Drafts
          </Button>
        </Stack>
        <TableContainer
          sx={{
            border: '1px solid',
            borderColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
            borderRadius: '22px',
            overflowX: 'auto',
            bgcolor: mode === 'dark' ? 'rgba(11,16,32,0.32)' : 'rgba(255,255,255,0.72)',
          }}
        >
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Title</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Updated</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {drafts.map((draft) => (
                <TableRow
                  key={draft._id}
                  sx={{
                    '&:hover': {
                      backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                    },
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {draft.ownerName || 'Unknown'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {draft.ownerEmail || ''}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{draft.title || 'Untitled'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {draft.createdAt ? formatDate(draft.createdAt) : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {draft.updatedAt ? formatDate(draft.updatedAt) : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteDraft(draft._id)}
                      disabled={deletingDraftId === draft._id}
                    >
                      {deletingDraftId === draft._id ? <CircularProgress size={18} /> : <DeleteIcon fontSize="small" />}
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={deleteOldDialogOpen} onClose={() => setDeleteOldDialogOpen(false)}>
          <DialogTitle>Delete old drafts</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Delete drafts that haven&apos;t been updated in more than the specified number of days.
            </DialogContentText>
            <TextField
              autoFocus
              label="Older than (days)"
              type="number"
              fullWidth
              value={deleteOldDays}
              onChange={(e) => setDeleteOldDays(Number(e.target.value))}
              slotProps={{ htmlInput: { min: 1 } }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteOldDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleDeleteOldDrafts}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  function renderReleasesTable() {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography color="error">{error}</Typography>
        </Box>
      );
    }

    if (releases.length === 0) {
      return (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <MusicNote sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No releases found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {tabValue === 1
              ? 'There are no pending release at the moment.'
              : tabValue === 2
                ? 'No releases are in process at the moment.'
                : tabValue === 3
                  ? 'No releases have been approved yet.'
                  : tabValue === 4
                    ? 'No releases have been rejected.'
                    : 'No releases match your current filters.'}
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ px: 0 }}>
        {/* Releases Table */}
        <TableContainer
          sx={{
            border: '1px solid',
            borderColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
            borderRadius: '22px',
            overflowX: 'auto',
            bgcolor: mode === 'dark' ? 'rgba(11,16,32,0.32)' : 'rgba(255,255,255,0.72)',
          }}
        >
          <Table size="small" sx={{ minWidth: 1060 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Release</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Artist</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Label</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>DSPs</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Tracks</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Updated</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  Action
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedReleases.map(release => (
                <TableRow
                  key={release._id}
                  sx={{
                    '&:last-child td, &:last-child th': { border: 0 },
                    '&:hover': {
                      backgroundColor:
                        mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                    },
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Avatar
                        src={getReleaseArtwork(release) || undefined}
                        alt={release.releaseTitle || release.title || 'Release artwork'}
                        variant="rounded"
                        sx={{
                          width: 40,
                          height: 40,
                          mr: 1.5,
                          bgcolor: mode === 'dark' ? 'primary.dark' : 'primary.light',
                        }}
                      >
                        <MusicNote sx={{ fontSize: 20 }} />
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {release.releaseTitle || release.title || 'Untitled Release'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {release.upc || 'No UPC'}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>
                      {release.ownerName || release.ownerArtistName || 'Unknown user'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {release.ownerEmail || 'No email'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {release.primaryArtist || 'Unknown Artist'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {release.label || 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell><StatusBadge status={release.status} /></TableCell>
                  <TableCell>{renderDSPChips(release.stores || [])}</TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {getTrackCount(release)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(release.updatedAt)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      component={Link}
                      href={`/admin/releases/${release._id}`}
                      size="small"
                      variant="outlined"
                      startIcon={<LinkIcon />}
                      sx={{
                        borderColor:
                          mode === 'dark' ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.23)',
                        minWidth: 'auto',
                        px: 1.5,
                        py: 0.5,
                      }}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={paginationTotal}
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
    );
  }
}
