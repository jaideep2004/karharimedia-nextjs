'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SyncIcon from '@mui/icons-material/Sync';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { DspLogo } from '@/components/dsp/DspLogo';
import { getDspDisplayName } from '@/lib/platforms';
import { adminAPI } from '@/services/api';
import useAdminAuth from '@/hooks/useAdminAuth';
import { PremiumHeader } from '@/components/premium/PremiumSurface';
import { toast } from 'sonner';

type Provider = {
  key: string;
  displayName: string;
  enabled?: boolean;
  maintenanceMode?: boolean;
  integrationMode?: 'shell' | 'sandbox' | 'live';
  readiness?: string;
  config?: {
    baseUrl?: string;
    accountId?: string | number;
    createdCountryId?: string;
  };
  configuredCredentialKeys?: string[];
  missingCredentialKeys?: string[];
  readinessReport?: {
    state: string;
    missing: string[];
    warnings: string[];
    canDispatch: boolean;
  };
  requirement?: {
    docsStatus: string;
    docsUrl?: string;
    payloadStandard: string;
    readinessChecks: string[];
  };
};

type DeliveryJob = {
  _id: string;
  targetType?: 'track' | 'release';
  releaseId?: string;
  providerKey: string;
  state: string;
  operation: string;
  retryCount: number;
  deadLettered: boolean;
  hiddenFromOps?: boolean;
  errorMessage?: string;
  createdAt: string;
  externalId?: string;
  lockedBy?: string;
  lockExpiresAt?: string;
  attempts?: Array<{
    attemptNo: number;
    status: string;
    responseCode?: string;
    responseBody?: unknown;
    errorMessage?: string;
    retryable: boolean;
    createdAt: string;
  }>;
  events?: Array<{
    state: string;
    message: string;
    source: string;
    createdAt: string;
  }>;
  metadata?: {
    releaseTitle?: string;
    payloadHash?: string;
    bromaStep?: string;
    bromaModerationStatus?: string;
    bromaReleaseId?: string;
    bromaStatusSource?: string;
    bromaLastStatusAt?: string;
    bromaOutletIds?: string[];
    bromaOutletMappings?: Array<{
      store?: string;
      outletId?: string;
      name?: string;
    }>;
    deliverySnapshot?: {
      upc?: string;
      trackCount?: number;
    };
  };
  trackId?: { title?: string; artistName?: string; isrc?: string };
};

type BromaConfigForm = {
  baseUrl: string;
  accountId: string;
  createdCountryId: string;
  email: string;
  password: string;
  integrationMode: 'sandbox' | 'live';
};

type BromaOutlet = {
  outletId: string;
  name: string;
  aliases?: string[];
  releaseTypes?: string[];
  active?: boolean;
  syncedAt?: string;
};

const DEFAULT_BROMA_BASE_URL = 'https://api-rod.broma16.com/api';
const DEFAULT_BROMA_COUNTRY_ID = '32';
const BROMA_STEP_ORDER = [
  'create_release',
  'upload_recordings',
  'update_recordings',
  'add_compositions',
  'upload_cover',
  'update_distribution',
  'send_moderation',
  'poll_status',
  'done',
] as const;

const BROMA_STEP_LABELS: Record<string, string> = {
  create_release: 'Create release',
  upload_recordings: 'Upload audio',
  update_recordings: 'Track metadata',
  add_compositions: 'Compositions',
  upload_cover: 'Cover upload',
  update_distribution: 'Distribution',
  send_moderation: 'Moderation sent',
  poll_status: 'Broma review',
  done: 'Live/done',
};

const BROMA_DONE_STATUSES = new Set([
  'live',
  'published',
  'delivered',
  'processed',
  'done',
  'accepted',
  'active',
  'success',
  'moderated',
  'approved',
  'shipped',
]);

const BROMA_BLOCKED_STATUSES = new Set(['rejected', 'declined', 'failed', 'error', 'cancelled', 'not_ready']);

const formatAttemptResponse = (value: unknown) => {
  if (!value) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > 900 ? `${text.slice(0, 900)}...` : text;
};

const normalizeBromaStatusText = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const humanizeBromaStatus = (value: unknown) => {
  const text = normalizeBromaStatusText(value);
  if (!text) return 'Awaiting Broma';
  return text.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const getBromaReleaseId = (job: DeliveryJob) =>
  String(job.externalId || job.metadata?.bromaReleaseId || '').trim();

const getBromaProgress = (job: DeliveryJob) => {
  if (job.providerKey !== 'broma') {
    return {
      value: job.state === 'delivered' ? 100 : ['failed', 'needs_attention'].includes(job.state) ? 100 : 20,
      label: job.state,
      detail: 'Non-Broma job',
      color: job.state === 'delivered' ? 'success' : ['failed', 'needs_attention'].includes(job.state) ? 'error' : 'primary',
    } as const;
  }

  const status = normalizeBromaStatusText(job.metadata?.bromaModerationStatus);
  const step = String(job.metadata?.bromaStep || (getBromaReleaseId(job) ? 'poll_status' : 'create_release'));
  const stepIndex = Math.max(0, BROMA_STEP_ORDER.indexOf(step as (typeof BROMA_STEP_ORDER)[number]));
  const baseValue = Math.round(((stepIndex + 1) / BROMA_STEP_ORDER.length) * 100);
  const blocked = job.state === 'needs_attention' || job.state === 'failed' || BROMA_BLOCKED_STATUSES.has(status);
  const done = job.state === 'delivered' || step === 'done' || BROMA_DONE_STATUSES.has(status);
  const label = status ? humanizeBromaStatus(status) : BROMA_STEP_LABELS[step] || humanizeBromaStatus(job.state);
  const source = job.metadata?.bromaStatusSource ? ` via ${job.metadata.bromaStatusSource}` : '';
  const checked = job.metadata?.bromaLastStatusAt
    ? `Checked ${new Date(job.metadata.bromaLastStatusAt).toLocaleString()}${source}`
    : getBromaReleaseId(job)
      ? 'Broma status not refreshed yet'
      : 'Waiting for Broma release id';

  return {
    value: done ? 100 : blocked ? Math.max(baseValue, 92) : Math.min(baseValue, 96),
    label,
    detail: `${BROMA_STEP_LABELS[step] || step}${checked ? ` | ${checked}` : ''}`,
    color: done ? 'success' : blocked ? 'error' : 'primary',
  } as const;
};

export default function AdminDspDeliveriesPage() {
  const { isAdmin } = useAdminAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [jobDetails, setJobDetails] = useState<Record<string, DeliveryJob>>({});
  const [bromaOutlets, setBromaOutlets] = useState<BromaOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerFilter, setProviderFilter] = useState('broma');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [paginationTotal, setPaginationTotal] = useState(0);
  const [processingDue, setProcessingDue] = useState(false);
  const [processingAll, setProcessingAll] = useState(false);
  const [syncingOutlets, setSyncingOutlets] = useState(false);
  const [savingBroma, setSavingBroma] = useState(false);
  const [refreshingStatusId, setRefreshingStatusId] = useState<string | null>(null);
  const [clearingLogsId, setClearingLogsId] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [loadingJobDetailsId, setLoadingJobDetailsId] = useState<string | null>(null);
  const [bromaForm, setBromaForm] = useState<BromaConfigForm>({
    baseUrl: DEFAULT_BROMA_BASE_URL,
    accountId: '',
    createdCountryId: DEFAULT_BROMA_COUNTRY_ID,
    email: '',
    password: '',
    integrationMode: 'sandbox',
  });
  const providerMap = useMemo(() => new Map(providers.map((p) => [p.key, p.displayName])), [providers]);
  const visibleProviders = useMemo(
    () => {
      const filtered = providers.filter((provider) => provider.key !== 'mock_dsp');
      return filtered.some((provider) => provider.key === 'broma')
        ? filtered
        : [
            {
              key: 'broma',
              displayName: 'Broma',
              enabled: false,
              integrationMode: 'sandbox',
              configuredCredentialKeys: [],
              config: {},
            },
            ...filtered,
          ];
    },
    [providers]
  );
  const bromaProvider = useMemo(() => providers.find((provider) => provider.key === 'broma'), [providers]);
  const bromaCredentialKeys = bromaProvider?.configuredCredentialKeys || [];
  const hasBromaEmail = bromaCredentialKeys.includes('email');
  const hasBromaPassword = bromaCredentialKeys.includes('password');
  const load = async () => {
    try {
      setLoading(true);
      const [providerRes, jobsRes, outletRes] = await Promise.all([
        adminAPI.listDspProviders(),
        adminAPI.listDspDeliveries({
          providerKey: providerFilter !== 'all' ? providerFilter : '',
          state: statusFilter !== 'all' ? statusFilter : '',
          limit: rowsPerPage,
          page: page + 1,
        }),
        adminAPI.listBromaOutlets(),
      ]);

      const nextJobs = jobsRes?.data?.data || [];
      setProviders(providerRes?.data || []);
      setJobs(nextJobs);
      setPaginationTotal(Number(jobsRes?.data?.pagination?.total || nextJobs.length || 0));
      setJobDetails({});
      setBromaOutlets(outletRes?.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load DSP data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, providerFilter, statusFilter, page, rowsPerPage]);

  useEffect(() => {
    setPage(0);
  }, [providerFilter, statusFilter]);

  useEffect(() => {
    if (!bromaProvider) return;
    setBromaForm((current) => ({
      ...current,
      baseUrl: String(bromaProvider.config?.baseUrl || current.baseUrl || DEFAULT_BROMA_BASE_URL),
      accountId: bromaProvider.config?.accountId ? String(bromaProvider.config.accountId) : current.accountId,
      createdCountryId: String(bromaProvider.config?.createdCountryId || current.createdCountryId || DEFAULT_BROMA_COUNTRY_ID),
      integrationMode: bromaProvider.integrationMode === 'live' ? 'live' : 'sandbox',
      password: '',
    }));
  }, [bromaProvider]);

  const handleSaveBromaConfig = async () => {
    const baseUrl = bromaForm.baseUrl.trim();
    const accountId = bromaForm.accountId.trim();
    const createdCountryId = bromaForm.createdCountryId.trim();
    const email = bromaForm.email.trim();
    const password = bromaForm.password.trim();
    const hasStoredCredentials = hasBromaEmail && hasBromaPassword;
    const credentialsChanged = Boolean(email || password);

    if (!/^https:\/\/|^http:\/\//i.test(baseUrl)) {
      toast.error('Broma base URL must start with http:// or https://');
      return;
    }
    if (!accountId) {
      toast.error('Broma account ID required');
      return;
    }
    if (!createdCountryId || !Number.isInteger(Number(createdCountryId))) {
      toast.error('Broma created country ID must be a numeric dictionary id');
      return;
    }
    if (!hasStoredCredentials && (!email || !password)) {
      toast.error('Broma email and password required for first setup');
      return;
    }
    if (credentialsChanged && (!email || !password)) {
      toast.error('Enter both email and password to update Broma credentials');
      return;
    }

    try {
      setSavingBroma(true);
      const payload: Parameters<typeof adminAPI.registerDspProvider>[0] = {
        key: 'broma',
        displayName: 'Broma',
        enabled: true,
        integrationMode: bromaForm.integrationMode,
        config: {
          baseUrl,
          accountId,
          createdCountryId,
          distributeToAllOutlets: true,
        },
      };
      if (credentialsChanged) {
        payload.credentials = { email, password };
      }

      await adminAPI.registerDspProvider(payload);
      setBromaForm((current) => ({ ...current, password: '' }));
      toast.success('Broma provider saved');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Broma provider save failed');
    } finally {
      setSavingBroma(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      await adminAPI.retryDspDelivery(jobId);
      toast.success('Retry queued');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Retry failed');
    }
  };

  const handleToggleJob = async (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      return;
    }

    setExpandedJobId(jobId);
    if (jobDetails[jobId]) return;

    try {
      setLoadingJobDetailsId(jobId);
      const response = await adminAPI.getDspDelivery(jobId);
      if (!response?.success || !response?.data) {
        throw new Error(response?.error || response?.message || 'Failed to load delivery details');
      }
      setJobDetails((current) => ({ ...current, [jobId]: response.data }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load delivery details');
    } finally {
      setLoadingJobDetailsId(null);
    }
  };

  const handleRefreshStatus = async (jobId: string) => {
    try {
      setRefreshingStatusId(jobId);
      const response = await adminAPI.refreshDspDeliveryStatus(jobId);
      const state = response?.data?.state || 'updated';
      const bromaStatus = response?.data?.metadata?.bromaModerationStatus;
      toast.success(`Broma status loaded: ${bromaStatus || state}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Status refresh failed');
    } finally {
      setRefreshingStatusId(null);
    }
  };

  const handleClearLogs = async (jobId: string) => {
    if (!window.confirm('Clear this delivery log and move the release back to pending?')) return;
    try {
      setClearingLogsId(jobId);
      const response = await adminAPI.clearDspDeliveryLogs(jobId);
      setJobs((current) => current.filter((job) => job._id !== jobId));
      setJobDetails((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
      if (expandedJobId === jobId) setExpandedJobId(null);
      const result = response?.data || {};
      if (result.releaseMissing) {
        toast.warning('Delivery log cleared. Release record no longer exists.');
      } else if (result.releaseReset) {
        toast.success('Delivery log cleared. Release moved back to pending.');
      } else {
        toast.success('Delivery log cleared.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Log clear failed');
    } finally {
      setClearingLogsId(null);
    }
  };

  const handleProcessDue = async () => {
    try {
      setProcessingDue(true);
      const response = await adminAPI.processDueDspDeliveries({ dispatchOnly: true });
      const processedItems = response?.data?.processed || [];
      const processed = processedItems.length || 0;
      const issue = processedItems.find((item: any) => ['failed', 'needs_attention'].includes(item.state) && item.error);
      const processing = processedItems.filter((item: any) => item.state === 'processing').length;
      if (issue?.error) toast.error(`Broma delivery issue: ${String(issue.error).slice(0, 220)}`);
      else if (processing > 0) toast.success(`${processing} release${processing === 1 ? '' : 's'} started processing`);
      else toast.success(`Started ${processed} delivery job${processed === 1 ? '' : 's'}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Worker run failed');
    } finally {
      setProcessingDue(false);
    }
  };

  const handleProcessAll = async () => {
    try {
      setProcessingAll(true);
      const response = await adminAPI.processAllDspDeliveries();
      const p = response?.data?.processed || [];
      toast.success(`Processed ${p.length} queued job${p.length === 1 ? '' : 's'} sequentially`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Process all failed');
    } finally {
      setProcessingAll(false);
    }
  };

  const handleSyncBromaOutlets = async () => {
    try {
      setSyncingOutlets(true);
      const response = await adminAPI.syncBromaOutlets();
      setBromaOutlets(response?.data?.outlets || []);
      toast.success(`Synced ${response?.data?.synced || 0} Broma outlet${response?.data?.synced === 1 ? '' : 's'}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Broma outlet sync failed');
    } finally {
      setSyncingOutlets(false);
    }
  };

  if (isAdmin === null) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={420}>
        <CircularProgress />
      </Box>
    );
  }

  if (isAdmin === false) {
    return <Alert severity="error">Admin access required</Alert>;
  }

  return (
    <Box>
      <PremiumHeader
        eyebrow="Broma Delivery Ops"
        title="Mediator Delivery"
        description="Queue release deliveries through Broma, sync outlets, monitor moderation, and retry failed attempts."
        action={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="provider-filter">Provider</InputLabel>
              <Select
                labelId="provider-filter"
                label="Provider"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
              >
                <MenuItem value="all">All providers</MenuItem>
                {visibleProviders.map((provider) => (
                  <MenuItem key={provider.key} value={provider.key}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <DspLogo value={provider.key} alt={provider.displayName} size={20} padding={0.25} />
                      <span>{provider.displayName}</span>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="status-filter">Status</InputLabel>
              <Select
                labelId="status-filter"
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All states</MenuItem>
                <MenuItem value="queued">Queued</MenuItem>
                <MenuItem value="processing">Processing</MenuItem>
                <MenuItem value="delivered">Delivered</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
                <MenuItem value="needs_attention">Needs Attention</MenuItem>
              </Select>
            </FormControl>
            <Button startIcon={<SyncIcon />} variant="outlined" onClick={handleSyncBromaOutlets} disabled={syncingOutlets}>
              {syncingOutlets ? 'Syncing...' : 'Sync Outlets'}
            </Button>
            <Button startIcon={<PlayArrowIcon />} variant="contained" onClick={handleProcessDue} disabled={processingDue}>
              {processingDue ? 'Processing...' : 'Run Worker'}
            </Button>
            <Button startIcon={<PlayArrowIcon />} variant="outlined" color="warning" onClick={handleProcessAll} disabled={processingAll}>
              {processingAll ? 'Processing All...' : 'Process All'}
            </Button>
            <Button startIcon={<RefreshIcon />} variant="outlined" onClick={load}>
              Refresh
            </Button>
          </Stack>
        }
      />

      <Paper sx={{ p: { xs: 1.5, md: 2 }, mb: 2.5 }}>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ md: 'center' }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={800}>
                Configure Broma
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Credentials are encrypted on the backend and never returned to this screen.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={bromaProvider?.enabled ? 'enabled' : 'not enabled'} color={bromaProvider?.enabled ? 'success' : 'default'} />
              <Chip size="small" label={hasBromaEmail ? 'email saved' : 'email missing'} color={hasBromaEmail ? 'success' : 'warning'} variant="outlined" />
              <Chip size="small" label={hasBromaPassword ? 'password saved' : 'password missing'} color={hasBromaPassword ? 'success' : 'warning'} variant="outlined" />
            </Stack>
          </Stack>

          <Alert severity="info" sx={{ py: 0.75 }}>
            Leave password blank to keep existing encrypted credentials. Enter email and password together to replace them.
          </Alert>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5}>
            <TextField
              size="small"
              label="Base URL"
              value={bromaForm.baseUrl}
              onChange={(e) => setBromaForm((current) => ({ ...current, baseUrl: e.target.value }))}
              fullWidth
              name="bromaBaseUrl"
              autoComplete="off"
              inputProps={{ 'aria-label': 'Broma API base URL' }}
            />
            <TextField
              size="small"
              label="Account ID"
              value={bromaForm.accountId}
              onChange={(e) => setBromaForm((current) => ({ ...current, accountId: e.target.value }))}
              fullWidth
              name="bromaAccountId"
              autoComplete="off"
              inputProps={{ 'aria-label': 'Broma account ID' }}
            />
            <TextField
              size="small"
              label="Created Country ID"
              value={bromaForm.createdCountryId}
              onChange={(e) => setBromaForm((current) => ({ ...current, createdCountryId: e.target.value }))}
              fullWidth
              name="bromaCreatedCountryId"
              autoComplete="off"
              helperText="Use the numeric country id from Broma dictionaries. India is 32."
              inputProps={{ 'aria-label': 'Broma created country ID' }}
            />
            <FormControl fullWidth size="small">
              <InputLabel id="broma-mode-select">Mode</InputLabel>
              <Select
                labelId="broma-mode-select"
                label="Mode"
                value={bromaForm.integrationMode}
                onChange={(e) =>
                  setBromaForm((current) => ({ ...current, integrationMode: e.target.value as BromaConfigForm['integrationMode'] }))
                }
              >
                <MenuItem value="sandbox">Sandbox</MenuItem>
                <MenuItem value="live">Live</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField
              size="small"
              label="Broma Email"
              value={bromaForm.email}
              onChange={(e) => setBromaForm((current) => ({ ...current, email: e.target.value }))}
              fullWidth
              type="email"
              name="bromaEmail"
              autoComplete="off"
              placeholder={hasBromaEmail ? 'Saved. Enter only to replace.' : ''}
              inputProps={{ 'aria-label': 'Broma email' }}
            />
            <TextField
              size="small"
              label="Broma Password"
              value={bromaForm.password}
              onChange={(e) => setBromaForm((current) => ({ ...current, password: e.target.value }))}
              fullWidth
              type="password"
              name="bromaPassword"
              autoComplete="new-password"
              placeholder={hasBromaPassword ? 'Saved. Leave blank to keep.' : ''}
              inputProps={{ 'aria-label': 'Broma password' }}
            />
            <Button
              variant="contained"
              onClick={handleSaveBromaConfig}
              disabled={savingBroma}
              sx={{ minWidth: { md: 180 }, minHeight: 40 }}
            >
              {savingBroma ? 'Saving...' : 'Save Broma'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ md: 'center' }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={800}>
                Synced Broma Outlets
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Active Broma outlet dictionary used when mapping selected stores into one release delivery.
              </Typography>
            </Box>
            <Chip size="small" color="primary" variant="outlined" label={`${bromaOutlets.length} active outlets`} />
          </Stack>
          {bromaOutlets.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              No synced outlets yet. Click Sync Outlets.
            </Typography>
          ) : (
            <Box sx={{ maxHeight: 260, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Outlet ID</TableCell>
                    <TableCell>Release Types</TableCell>
                    <TableCell>Synced</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bromaOutlets.map((outlet) => (
                    <TableRow key={outlet.outletId}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {outlet.name}
                        </Typography>
                        {!!outlet.aliases?.length && (
                          <Typography variant="caption" color="text.secondary">
                            {outlet.aliases.join(', ')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{outlet.outletId}</TableCell>
                      <TableCell>{outlet.releaseTypes?.join(', ') || '-'}</TableCell>
                      <TableCell>{outlet.syncedAt ? new Date(outlet.syncedAt).toLocaleString() : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </Paper>

      <Paper sx={{ overflow: 'hidden' }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={5}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
              <TableRow>
                <TableCell width={44} />
                <TableCell>Track</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Operation</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Broma Progress</TableCell>
                <TableCell>Retries</TableCell>
                <TableCell>Error</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.map((listJob) => {
                const job = jobDetails[listJob._id] || listJob;
                const isExpanded = expandedJobId === listJob._id;
                const isLoadingDetails = loadingJobDetailsId === listJob._id && !jobDetails[listJob._id];
                const bromaProgress = getBromaProgress(job);
                const canRefreshBromaStatus = job.providerKey === 'broma';

                return (
                <Fragment key={listJob._id}>
                  <TableRow>
                    <TableCell>
                      <Tooltip title={isExpanded ? 'Collapse job details' : 'Expand job details'}>
                        <IconButton
                          size="small"
                          onClick={() => handleToggleJob(listJob._id)}
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} delivery job ${listJob._id}`}
                        >
                          {isExpanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {job.targetType === 'release'
                          ? job.metadata?.releaseTitle || 'Release delivery'
                          : job.trackId?.title || 'Unknown track'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {job.targetType === 'release'
                          ? `${job.metadata?.deliverySnapshot?.trackCount || 0} tracks${job.metadata?.deliverySnapshot?.upc ? ` | UPC ${job.metadata.deliverySnapshot.upc}` : ''}`
                          : `${job.trackId?.artistName || 'Unknown artist'} ${job.trackId?.isrc ? `| ${job.trackId.isrc}` : ''}`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <DspLogo
                          value={job.providerKey}
                          alt={providerMap.get(job.providerKey) || getDspDisplayName(job.providerKey)}
                          size={26}
                          padding={0.25}
                        />
                        <Typography variant="body2" fontWeight={600}>
                          {providerMap.get(job.providerKey) || getDspDisplayName(job.providerKey)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{job.operation}</TableCell>
                    <TableCell>
                      <Chip label={job.state} color={job.state === 'delivered' ? 'success' : job.state === 'failed' ? 'error' : 'default'} size="small" />
                    </TableCell>
                    <TableCell sx={{ width: 168, minWidth: 150, maxWidth: 180 }}>
                      <Stack spacing={0.35}>
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                          <Typography variant="caption" fontWeight={800} noWrap sx={{ fontSize: '0.68rem', maxWidth: 112 }}>
                            {bromaProgress.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums' }}>
                            {bromaProgress.value}%
                          </Typography>
                        </Stack>
                        <Tooltip title={bromaProgress.detail}>
                          <LinearProgress
                            variant="determinate"
                            value={bromaProgress.value}
                            color={bromaProgress.color}
                            sx={{
                              height: 4,
                              borderRadius: 999,
                              bgcolor: 'action.hover',
                              '& .MuiLinearProgress-bar': { borderRadius: 999 },
                            }}
                          />
                        </Tooltip>
                      </Stack>
                    </TableCell>
                    <TableCell>{job.retryCount}</TableCell>
                    <TableCell sx={{ maxWidth: 240 }}>
                      <Typography variant="caption" color={job.errorMessage ? 'error.main' : 'text.secondary'}>
                        {job.errorMessage || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.75} justifyContent="flex-end" alignItems="center">
                        <Tooltip
                          title={
                            canRefreshBromaStatus
                              ? (getBromaReleaseId(job) ? 'Fetch fresh Broma status' : 'Load latest saved Broma job state')
                              : 'Broma release id missing. Run worker first.'
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              disabled={!canRefreshBromaStatus || refreshingStatusId === job._id}
                              onClick={() => handleRefreshStatus(job._id)}
                              aria-label={`Refresh Broma status for delivery job ${job._id}`}
                            >
                              {refreshingStatusId === job._id ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Clear log and move release back to pending">
                          <span>
                            <IconButton
                              size="small"
                              color="warning"
                              disabled={clearingLogsId === job._id}
                              onClick={() => handleClearLogs(job._id)}
                              aria-label={`Clear delivery logs for job ${job._id}`}
                            >
                              {clearingLogsId === job._id ? <CircularProgress size={18} /> : <DeleteSweepIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={!['failed', 'needs_attention'].includes(job.state)}
                          onClick={() => handleRetry(job._id)}
                          startIcon={<ReplayIcon />}
                          aria-label={`Retry delivery job ${job._id}`}
                        >
                          Retry
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={10} sx={{ p: 0, borderBottom: isExpanded ? undefined : 0 }}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        {isLoadingDetails ? (
                          <Box display="flex" justifyContent="center" py={3} bgcolor="action.hover">
                            <CircularProgress size={22} />
                          </Box>
                        ) : (
                        <Box sx={{ px: 3, py: 2, bgcolor: 'action.hover' }}>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
                            <Box>
                              <Typography variant="overline" color="text.secondary">External ID</Typography>
                              <Typography variant="body2">{job.externalId || '-'}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="overline" color="text.secondary">Worker</Typography>
                              <Typography variant="body2">{job.lockedBy || '-'}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="overline" color="text.secondary">Lock Expires</Typography>
                              <Typography variant="body2">{job.lockExpiresAt ? new Date(job.lockExpiresAt).toLocaleString() : '-'}</Typography>
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="overline" color="text.secondary">Payload Hash</Typography>
                              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{job.metadata?.payloadHash || '-'}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="overline" color="text.secondary">Broma Step</Typography>
                              <Typography variant="body2">{job.metadata?.bromaStep || '-'}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="overline" color="text.secondary">Broma Status</Typography>
                              <Typography variant="body2">{job.metadata?.bromaModerationStatus || '-'}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="overline" color="text.secondary">Last Status At</Typography>
                              <Typography variant="body2">
                                {job.metadata?.bromaLastStatusAt ? new Date(job.metadata.bromaLastStatusAt).toLocaleString() : '-'}
                              </Typography>
                            </Box>
                          </Stack>
                          <Box mb={2}>
                            <Typography variant="overline" color="text.secondary">
                              Selected Broma Outlets
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={0.5}>
                              {(job.metadata?.bromaOutletMappings || []).map((mapping, index) => (
                                <Chip
                                  key={`${job._id}-outlet-${mapping.store || index}-${mapping.outletId || index}`}
                                  size="small"
                                  variant="outlined"
                                  label={`${mapping.store || 'store'} -> ${mapping.name || mapping.outletId || 'outlet'}`}
                                />
                              ))}
                              {(!job.metadata?.bromaOutletMappings || job.metadata.bromaOutletMappings.length === 0) && (
                                <Typography variant="caption" color="text.secondary">
                                  No outlet mappings stored.
                                </Typography>
                              )}
                            </Stack>
                          </Box>
                          <Divider sx={{ mb: 2 }} />
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                            <Box flex={1} minWidth={0}>
                              <Typography variant="subtitle2" fontWeight={800} mb={1}>Attempts</Typography>
                              <Stack spacing={1}>
                                {(job.attempts || []).slice(-4).map((attempt) => {
                                  const responseBody = formatAttemptResponse(attempt.responseBody);
                                  return (
                                    <Stack key={`${job._id}-attempt-${attempt.attemptNo}`} spacing={0.75}>
                                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                        <Chip size="small" label={`#${attempt.attemptNo}`} variant="outlined" />
                                        <Chip size="small" label={attempt.status} color={attempt.status === 'success' ? 'success' : 'error'} />
                                        <Typography variant="caption" color="text.secondary">
                                          {attempt.responseCode || attempt.errorMessage || '-'}
                                        </Typography>
                                      </Stack>
                                      {responseBody && (
                                        <Typography
                                          component="pre"
                                          variant="caption"
                                          sx={{
                                            m: 0,
                                            p: 1,
                                            borderRadius: 1,
                                            bgcolor: 'grey.100',
                                            color: 'text.secondary',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                          }}
                                        >
                                          {responseBody}
                                        </Typography>
                                      )}
                                    </Stack>
                                  );
                                })}
                                {(!job.attempts || job.attempts.length === 0) && (
                                  <Typography variant="caption" color="text.secondary">No attempts yet.</Typography>
                                )}
                              </Stack>
                            </Box>
                            <Box flex={1.4} minWidth={0}>
                              <Typography variant="subtitle2" fontWeight={800} mb={1}>Events</Typography>
                              <Stack spacing={1}>
                                {(job.events || []).slice(-5).map((event, index) => (
                                  <Box key={`${job._id}-event-${index}`}>
                                    <Typography variant="caption" color="text.secondary">
                                      {new Date(event.createdAt).toLocaleString()} | {event.source} | {event.state}
                                    </Typography>
                                    <Typography variant="body2">{event.message}</Typography>
                                  </Box>
                                ))}
                                {(!job.events || job.events.length === 0) && (
                                  <Typography variant="caption" color="text.secondary">No events yet.</Typography>
                                )}
                              </Stack>
                            </Box>
                          </Stack>
                        </Box>
                        )}
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
                );
              })}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center">
                    No delivery jobs yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            </Table>
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
          </>
        )}
      </Paper>
    </Box>
  );
}
