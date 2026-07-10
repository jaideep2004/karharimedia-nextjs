'use client';

import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Slide,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SyncIcon from '@mui/icons-material/Sync';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ListAltIcon from '@mui/icons-material/ListAlt';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import BugReportIcon from '@mui/icons-material/BugReport';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import BuildIcon from '@mui/icons-material/Build';
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
  config?: { baseUrl?: string; accountId?: string | number; createdCountryId?: string };
  configuredCredentialKeys?: string[];
  missingCredentialKeys?: string[];
  readinessReport?: { state: string; missing: string[]; warnings: string[]; canDispatch: boolean };
  requirement?: { docsStatus: string; docsUrl?: string; payloadStandard: string; readinessChecks: string[] };
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
  updatedAt?: string;
  externalId?: string;
  lockedBy?: string;
  lockExpiresAt?: string;
  attempts?: Array<{ attemptNo: number; status: string; responseCode?: string; responseBody?: unknown; errorMessage?: string; retryable: boolean; createdAt: string }>;
  events?: Array<{ state: string; message: string; source: string; createdAt: string }>;
  metadata?: {
    releaseTitle?: string;
    payloadHash?: string;
    bromaStep?: string;
    bromaModerationStatus?: string;
    bromaReleaseId?: string;
    bromaStatusSource?: string;
    bromaLastStatusAt?: string;
    bromaIsModeration?: boolean;
    bromaIsDspProcessing?: boolean;
    bromaRawStatus?: string;
    bromaErrorDetails?: string;
    bromaOutletIds?: string[];
    bromaOutletMappings?: Array<{ store?: string; outletId?: string; name?: string }>;
    deliverySnapshot?: { upc?: string; trackCount?: number };
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

type BromaOutlet = { outletId: string; name: string; aliases?: string[]; releaseTypes?: string[]; active?: boolean; syncedAt?: string };

type DraftEntry = { bromaDraftId: string; releaseTitle: string; bromaStep: string; jobState: string; jobId: string | null; releaseId: string; createdAt: string; completed: boolean };

const DEFAULT_BROMA_BASE_URL = 'https://api-rod.broma16.com/api';
const DEFAULT_BROMA_COUNTRY_ID = '32';
const BROMA_STEP_ORDER = ['create_release', 'upload_recordings', 'update_recordings', 'add_compositions', 'upload_cover', 'update_distribution', 'send_moderation', 'poll_status', 'done'] as const;
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
const BROMA_DONE_STATUSES = new Set(['live', 'published', 'delivered', 'processed', 'done', 'accepted', 'active', 'success', 'moderated', 'approved', 'shipped', 'completed']);
const BROMA_BLOCKED_STATUSES = new Set(['rejected', 'declined', 'failed', 'error', 'cancelled', 'not_ready']);

const formatAttemptResponse = (value: unknown) => {
  if (!value) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > 900 ? `${text.slice(0, 900)}...` : text;
};

const normalizeBromaStatusText = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const humanizeBromaStatus = (value: unknown) => {
  const text = normalizeBromaStatusText(value);
  if (!text) return 'Awaiting Broma';
  return text.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const getBromaReleaseId = (job: DeliveryJob) => String(job.externalId || job.metadata?.bromaReleaseId || '').trim();

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
  const checked = job.metadata?.bromaLastStatusAt ? `Checked ${new Date(job.metadata.bromaLastStatusAt).toLocaleString()}${source}` : getBromaReleaseId(job) ? 'Broma status not refreshed yet' : 'Waiting for Broma release id';
  return {
    value: done ? 100 : blocked ? Math.max(baseValue, 92) : Math.min(baseValue, 96),
    label,
    detail: `${BROMA_STEP_LABELS[step] || step}${checked ? ` | ${checked}` : ''}`,
    color: done ? 'success' : blocked ? 'error' : 'primary',
  } as const;
};

const StepChip = ({ step }: { step: string }) => {
  if (!step || step === 'done') return null;
  const isStuckEarly = step === 'create_release' || step === 'upload_recordings';
  return (
    <Chip
      size="small"
      label={BROMA_STEP_LABELS[step] || step}
      color={isStuckEarly ? 'warning' : 'default'}
      variant={isStuckEarly ? 'filled' : 'outlined'}
      sx={isStuckEarly ? { animation: 'pulse 2s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } } } : undefined}
    />
  );
};

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
  return (
    <Paper sx={{ p: 2, flex: '1 1 140px', minWidth: 120, bgcolor: color ? `${color}.dark` : undefined }}>
      <Stack spacing={0.5} alignItems="center">
        {icon}
        <Typography variant="h4" fontWeight={800}>{value}</Typography>
        <Typography variant="caption" color="text.secondary" textAlign="center">{label}</Typography>
      </Stack>
    </Paper>
  );
}

export default function AdminDspDeliveriesPage() {
  const { isAdmin } = useAdminAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [jobDetails, setJobDetails] = useState<Record<string, DeliveryJob>>({});
  const [bromaOutlets, setBromaOutlets] = useState<BromaOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerFilter, setProviderFilter] = useState('broma');
  const [totalCounts, setTotalCounts] = useState<Record<string, number>>({});

  const [processingDue, setProcessingDue] = useState(false);
  const [retryingDrafts, setRetryingDrafts] = useState(false);
  const [forceProcessing, setForceProcessing] = useState(false);
  const [bromaDrafts, setBromaDrafts] = useState<DraftEntry[] | null>(null);
  const [bromaDraftsTotal, setBromaDraftsTotal] = useState<number | null>(null);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftPage, setDraftPage] = useState(0);
  const [draftRowsPerPage, setDraftRowsPerPage] = useState(10);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [syncingOutlets, setSyncingOutlets] = useState(false);
  const [savingBroma, setSavingBroma] = useState(false);
  const [refreshingStatusId, setRefreshingStatusId] = useState<string | null>(null);
  const [clearingLogsId, setClearingLogsId] = useState<string | null>(null);
  const [retryingIndividualId, setRetryingIndividualId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [loadingJobDetailsId, setLoadingJobDetailsId] = useState<string | null>(null);

  const [configOpen, setConfigOpen] = useState(false);
  const [releaseTab, setReleaseTab] = useState('all');

  const [requeuing, setRequeuing] = useState(false);
  const [forceSyncing, setForceSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ total: number; processed: number; errors: number; current: string; done: boolean; startTime: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<any>(null);
  const [cleaningUp, setCleaningUp] = useState<'idle' | 'listing' | 'deleting' | 'resuming'>('idle');
  const [cleanupResult, setCleanupResult] = useState<any>(null);
  const [draftCleanupOpen, setDraftCleanupOpen] = useState(false);

  const [bromaForm, setBromaForm] = useState<BromaConfigForm>({
    baseUrl: DEFAULT_BROMA_BASE_URL,
    accountId: '',
    createdCountryId: DEFAULT_BROMA_COUNTRY_ID,
    email: '',
    password: '',
    integrationMode: 'sandbox',
  });

  const providerMap = useMemo(() => new Map(providers.map((p) => [p.key, p.displayName])), [providers]);
  const visibleProviders = useMemo(() => {
    const filtered = providers.filter((p) => p.key !== 'mock_dsp');
    return filtered.some((p) => p.key === 'broma') ? filtered : [{ key: 'broma', displayName: 'Broma', enabled: false, integrationMode: 'sandbox', configuredCredentialKeys: [], config: {} }, ...filtered];
  }, [providers]);
  const bromaProvider = useMemo(() => providers.find((p) => p.key === 'broma'), [providers]);
  const bromaCredentialKeys = bromaProvider?.configuredCredentialKeys || [];
  const hasBromaEmail = bromaCredentialKeys.includes('email');
  const hasBromaPassword = bromaCredentialKeys.includes('password');

  const totalCountsAll = totalCounts.all ?? jobs.length;
  const totalCountsProcessing = totalCounts.processing ?? jobs.filter((j) => j.state === 'processing').length;
  const totalCountsDelivered = totalCounts.delivered ?? jobs.filter((j) => j.state === 'delivered').length;
  const totalCountsFailed = totalCounts.failed ?? jobs.filter((j) => ['failed', 'needs_attention'].includes(j.state)).length;
  const totalCountsQueued = totalCounts.queued ?? jobs.filter((j) => j.state === 'queued').length;

  const tabStateFilter = releaseTab === 'failed' ? 'needs_attention' : (['processing', 'delivered', 'queued'].includes(releaseTab) ? releaseTab : '');
  const tabFilteredJobs = releaseTab === 'drafts' ? [] : jobs;

  const searchTermRef = useRef(searchTerm);
  searchTermRef.current = searchTerm;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const term = searchTermRef.current;
      const [providerRes, jobsRes] = await Promise.all([
        adminAPI.listDspProviders(),
        adminAPI.listDspDeliveries({ providerKey: providerFilter !== 'all' ? providerFilter : '', state: tabStateFilter, search: term, limit: 50, page: 1 }),
      ]);
      const nextJobs = jobsRes?.data?.data || [];
      setProviders(providerRes?.data || []);
      setJobs(nextJobs);
      setTotalCounts(jobsRes?.data?.counts || {});
      setJobDetails({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load DSP data');
    } finally {
      setLoading(false);
    }
  }, [providerFilter, tabStateFilter]);

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const loadDraftsBackground = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const res = await adminAPI.listBromaDrafts();
      if (res?.data?.drafts) {
        setBromaDrafts(res.data.drafts);
        setBromaDraftsTotal(res.data.total ?? res.data.drafts.length);
      }
    } catch (e) {
      console.error('[Drafts] Failed to load:', e);
      toast.error(e instanceof Error ? e.message : 'Failed to load Broma drafts');
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  useEffect(() => {
    if (!isAdmin || releaseTab !== 'processing') return;
    const id = setInterval(() => load(), 15000);
    return () => clearInterval(id);
  }, [isAdmin, releaseTab, load]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadDraftsBackground();
  }, [isAdmin, loadDraftsBackground]);

  useEffect(() => {
    if (isAdmin && releaseTab === 'drafts') {
      void loadDraftsBackground();
    }
  }, [isAdmin, releaseTab, loadDraftsBackground]);

  useEffect(() => { setDraftPage(0); }, [providerFilter, releaseTab]);

  useEffect(() => {
    if (!bromaProvider) return;
    setBromaForm((c) => ({
      ...c,
      baseUrl: String(bromaProvider.config?.baseUrl || c.baseUrl || DEFAULT_BROMA_BASE_URL),
      accountId: bromaProvider.config?.accountId ? String(bromaProvider.config.accountId) : c.accountId,
      createdCountryId: String(bromaProvider.config?.createdCountryId || c.createdCountryId || DEFAULT_BROMA_COUNTRY_ID),
      integrationMode: bromaProvider.integrationMode === 'live' ? 'live' : 'sandbox',
      password: '',
    }));
  }, [bromaProvider]);

  const handleOpenConfig = useCallback(async () => {
    setConfigOpen(true);
    try {
      const outletRes = await adminAPI.listBromaOutlets();
      setBromaOutlets(outletRes?.data || []);
    } catch {
      // Outlets are non-critical for config dialog
    }
  }, []);

  const handleSaveBromaConfig = async () => {
    const { baseUrl, accountId, createdCountryId, email, password, integrationMode } = bromaForm;
    const bt = baseUrl.trim(), ai = accountId.trim(), ci = createdCountryId.trim();
    const hasStored = hasBromaEmail && hasBromaPassword;
    const credChanged = Boolean(email || password);
    if (!/^https?:\/\//i.test(bt)) { toast.error('Broma base URL must start with http:// or https://'); return; }
    if (!ai) { toast.error('Broma account ID required'); return; }
    if (!ci || !Number.isInteger(Number(ci))) { toast.error('Broma created country ID must be numeric'); return; }
    if (!hasStored && (!email || !password)) { toast.error('Email and password required for first setup'); return; }
    if (credChanged && (!email || !password)) { toast.error('Enter both email and password to update'); return; }
    try {
      setSavingBroma(true);
      const payload: any = { key: 'broma', displayName: 'Broma', enabled: true, integrationMode, config: { baseUrl: bt, accountId: ai, createdCountryId: ci, distributeToAllOutlets: true } };
      if (credChanged) payload.credentials = { email, password };
      await adminAPI.registerDspProvider(payload);
      setBromaForm((c) => ({ ...c, password: '' }));
      toast.success('Broma provider saved');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally { setSavingBroma(false); }
  };

  const handleRetry = async (jobId: string) => {
    try { await adminAPI.retryDspDelivery(jobId); toast.success('Retry queued'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Retry failed'); }
  };

  const handleRetryIndividual = async (jobId: string) => {
    setRetryingIndividualId(jobId);
    try {
      await adminAPI.retryIndividualDspDelivery(jobId);
      toast.success('Fix & Retry: Broma draft recreated with current data');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Fix & Retry failed');
    } finally {
      setRetryingIndividualId(null);
    }
  };

  const handleToggleJob = async (jobId: string) => {
    if (expandedJobId === jobId) { setExpandedJobId(null); return; }
    setExpandedJobId(jobId);
    if (jobDetails[jobId]) return;
    try {
      setLoadingJobDetailsId(jobId);
      const response = await adminAPI.getDspDelivery(jobId);
      if (!response?.success || !response?.data) throw new Error(response?.error || response?.message || 'Failed to load details');
      setJobDetails((c) => ({ ...c, [jobId]: response.data }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load details');
    } finally { setLoadingJobDetailsId(null); }
  };

  const handleRefreshStatus = async (jobId: string) => {
    try {
      setRefreshingStatusId(jobId);
      const response = await adminAPI.refreshDspDeliveryStatus(jobId);
      toast.success(`Broma status: ${response?.data?.metadata?.bromaModerationStatus || response?.data?.state || 'updated'}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Status refresh failed');
    } finally { setRefreshingStatusId(null); }
  };

  const handleClearLogs = async (jobId: string) => {
    if (!window.confirm('Clear delivery log and move release back to pending?')) return;
    try {
      setClearingLogsId(jobId);
      const response = await adminAPI.clearDspDeliveryLogs(jobId);
      setJobs((c) => c.filter((j) => j._id !== jobId));
      setJobDetails((c) => { const n = { ...c }; delete n[jobId]; return n; });
      if (expandedJobId === jobId) setExpandedJobId(null);
      const r = response?.data || {};
      if (r.releaseMissing) toast.warning('Log cleared. Release record gone.');
      else if (r.releaseReset) toast.success('Log cleared. Release back to pending.');
      else toast.success('Log cleared.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Log clear failed');
    } finally { setClearingLogsId(null); }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!window.confirm('Permanently delete this delivery job?')) return;
    setDeletingId(jobId);
    try {
      await adminAPI.deleteDspDelivery(jobId);
      setJobs((c) => c.filter((j) => j._id !== jobId));
      setJobDetails((c) => { const n = { ...c }; delete n[jobId]; return n; });
      if (expandedJobId === jobId) setExpandedJobId(null);
      toast.success('Delivery job deleted permanently');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally { setDeletingId(null); }
  };

  const handleProcessDue = async () => {
    try {
      setProcessingDue(true);
      const response = await adminAPI.processDueDspDeliveries({ dispatchOnly: true });
      const processed = response?.data?.processed || [];
      const errors = processed.filter((p: any) => ['failed', 'needs_attention'].includes(p.state) && p.error);
      const processing = processed.filter((p: any) => p.state === 'processing').length;
      if (errors[0]) toast.error(`Issue: ${String(errors[0].error).slice(0, 220)}`);
      else if (processing > 0) toast.success(`${processing} started`);
      else toast.success(`Started ${processed.length}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Worker failed');
    } finally { setProcessingDue(false); }
  };

  const handleRequeueStuck = async () => {
    try {
      setRequeuing(true);
      const response = await adminAPI.requeueStuckBromaJobs({ maxJobs: 500, olderThanMinutes: 15 });
      const r = response?.data || {};
      toast.success(`Re-queued ${r.requeued || 0} stuck jobs`);
      if (r.requeued > 0) {
        await adminAPI.processDueDspDeliveries({ dispatchOnly: true, maxJobs: Math.min(r.requeued, 25) });
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Requeue failed');
    } finally { setRequeuing(false); }
  };

  useEffect(() => {
    const stored = sessionStorage.getItem('bromaSyncId');
    if (stored && isAdmin) {
      setForceSyncing(true);
      setSyncProgress(null);
      const poll = async () => {
        let refreshCount = 0;
        while (true) {
          await new Promise(r => setTimeout(r, 800));
          try {
            const res = await fetch(`/api/admin/broma-release-statuses-sync/${stored}/progress`, { credentials: 'include' });
            const json = await res.json();
            if (json?.data) setSyncProgress(json.data);
            if (json?.data?.done) { sessionStorage.removeItem('bromaSyncId'); break; }
            if (++refreshCount % 5 === 0) { void load(); }
          } catch { sessionStorage.removeItem('bromaSyncId'); break; }
        }
        await load();
        setForceSyncing(false);
        setSyncProgress(null);
      };
      poll();
    }
  }, [isAdmin]);

  const handleForceSync = async () => {
    try {
      setForceSyncing(true);
      setSyncProgress(null);
      const syncId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const response = await adminAPI.syncBromaReleaseStatuses({ limit: 10000, syncId });
      if (!response?.data?.syncId) { toast.error('Failed to start sync'); setForceSyncing(false); return; }
      sessionStorage.setItem('bromaSyncId', syncId);
      let refreshCount = 0;
      while (true) {
        await new Promise(r => setTimeout(r, 800));
        try {
          const res = await fetch(`/api/admin/broma-release-statuses-sync/${syncId}/progress`, { credentials: 'include' });
          const json = await res.json();
          if (json?.data) setSyncProgress(json.data);
          if (json?.data?.done) { sessionStorage.removeItem('bromaSyncId'); break; }
          if (++refreshCount % 5 === 0) { void load(); }
        } catch { sessionStorage.removeItem('bromaSyncId'); break; }
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Force sync failed');
    } finally { setForceSyncing(false); setSyncProgress(null); sessionStorage.removeItem('bromaSyncId'); }
  };

  const handleDiagnoseApi = async () => {
    try {
      setDiagnosing(true);
      const res = await fetch('/api/admin/dsp/broma/drafts/diagnose', { credentials: 'include' });
      const json = await res.json();
      setDiagnoseResult(json);
      toast.success('API diagnostic complete');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'API diagnostic failed');
    } finally { setDiagnosing(false); }
  };

  const handleListBromaDrafts = async () => {
    if (draftsOpen) { setDraftsOpen(false); return; }
    try {
      setCleaningUp('listing');
      const res = await adminAPI.listBromaDrafts();
      if (res?.data?.drafts) {
        setBromaDrafts(res.data.drafts);
        setBromaDraftsTotal(res.data.total ?? res.data.drafts.length);
      }
      setDraftsOpen(true);
      if (!res?.data?.drafts?.length) toast.success('No Broma drafts found');
      else toast.info(`${res.data.total || res.data.drafts.length} drafts in Broma`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to list drafts');
    } finally { setCleaningUp('idle'); }
  };

  const handleDraftCleanup = async (action: 'delete_orphans' | 'resume_orphans') => {
    try {
      setCleaningUp(action === 'delete_orphans' ? 'deleting' : 'resuming');
      const label = action === 'delete_orphans' ? 'Cleanup' : 'Resume';
      const response = await adminAPI.cleanupBromaDrafts({ action, maxDrafts: 200 });
      setCleanupResult(response?.data);
      const r = response?.data || {};
      toast.success(`${label}: ${r.deleted || 0} deleted, ${r.resumed || 0} resumed, ${r.errors?.length || 0} errors`);
      const draftsRes = await adminAPI.listBromaDrafts();
      if (draftsRes?.data?.drafts) {
        setBromaDrafts(draftsRes.data.drafts);
        setBromaDraftsTotal(draftsRes.data.total ?? draftsRes.data.drafts.length);
      }
      setDraftPage(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Draft ${action} failed`);
    } finally { setCleaningUp('idle'); }
  };

  const handleRetryBromaDrafts = async () => {
    try {
      setRetryingDrafts(true);
      const res = await adminAPI.retryAllBromaDrafts();
      const r = res?.data || {};
      toast.success([`Retried ${r.retried || 0}`, r.dispatched ? `dispatched ${r.dispatched}` : '', r.noJobDrafts ? `${r.noJobDrafts} no job` : ''].filter(Boolean).join('. '));
      await load();
      const draftsRes = await adminAPI.listBromaDrafts();
      if (draftsRes?.data?.drafts) {
        setBromaDrafts(draftsRes.data.drafts);
        setBromaDraftsTotal(draftsRes.data.total ?? draftsRes.data.drafts.length);
      }
      setDraftPage(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Draft retry failed');
    } finally { setRetryingDrafts(false); }
  };

  const handleForceProcess = async () => {
    try {
      setForceProcessing(true);
      const res = await adminAPI.forceProcessBromaDrafts();
      const r = res?.data || {};
      toast.success(`Requeued ${r.requeued || 0} — scheduler will process them automatically`);
      await load();
      const draftsRes = await adminAPI.listBromaDrafts();
      if (draftsRes?.data?.drafts) {
        setBromaDrafts(draftsRes.data.drafts);
        setBromaDraftsTotal(draftsRes.data.total ?? draftsRes.data.drafts.length);
      }
      setDraftPage(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Force process failed');
    } finally { setForceProcessing(false); }
  };

  const handleSyncBromaOutlets = async () => {
    try {
      setSyncingOutlets(true);
      const response = await adminAPI.syncBromaOutlets();
      setBromaOutlets(response?.data?.outlets || []);
      toast.success(`Synced ${response?.data?.synced || 0} outlets`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Outlet sync failed');
    } finally { setSyncingOutlets(false); }
  };

  if (isAdmin === null) return <Box display="flex" justifyContent="center" alignItems="center" minHeight={420}><CircularProgress /></Box>;
  if (isAdmin === false) return <Alert severity="error">Admin access required</Alert>;

  return (
    <Box>
      <PremiumHeader
        eyebrow="Broma Delivery Ops"
        title="Mediator Delivery"
        description="Monitor delivery pipeline, sync true status from Broma, clean up orphaned drafts, and manage provider configuration."
        action={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="pf">Provider</InputLabel>
              <Select labelId="pf" label="Provider" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
                <MenuItem value="all">All providers</MenuItem>
                {visibleProviders.map((p) => <MenuItem key={p.key} value={p.key}><Stack direction="row" spacing={1} alignItems="center"><DspLogo value={p.key} alt={p.displayName} size={20} padding={0.25} /><span>{p.displayName}</span></Stack></MenuItem>)}
              </Select>
            </FormControl>
            <Button startIcon={<PlayArrowIcon />} variant="contained" onClick={handleProcessDue} disabled={processingDue}>{processingDue ? 'Working...' : 'Run Worker'}</Button>
            <Button startIcon={<SyncIcon />} variant="outlined" onClick={handleSyncBromaOutlets} disabled={syncingOutlets}>{syncingOutlets ? 'Syncing...' : 'Sync Outlets'}</Button>
            <Button startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />} variant="outlined" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</Button>
            <Button startIcon={<SettingsIcon />} variant="text" onClick={handleOpenConfig}>Configure</Button>
          </Stack>
        }
      />

      {/* Quick Action Bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="small" variant="contained" color="warning" onClick={handleRequeueStuck} disabled={requeuing} startIcon={<ReplayIcon />}>
          {requeuing ? 'Working...' : 'Requeue Stuck'}
        </Button>
        <Button size="small" variant="contained" onClick={handleForceSync} disabled={forceSyncing} startIcon={forceSyncing ? <CircularProgress size={14} /> : <SyncIcon />}>
          {forceSyncing && syncProgress ? (syncProgress.total > 0 ? `${Math.round((syncProgress.processed / syncProgress.total) * 100)}%` : '0%') : forceSyncing ? 'Syncing...' : 'Force Sync All'}
        </Button>
        <TextField
          size="small"
          placeholder="Search by title, release ID, UPC…"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (searchTimer.current) clearTimeout(searchTimer.current);
            searchTimer.current = setTimeout(() => load(), 400);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (searchTimer.current) clearTimeout(searchTimer.current);
              load();
            }
          }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ minWidth: 240, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}
        />
        <Button size="small" variant="text" color="info" onClick={handleDiagnoseApi} disabled={diagnosing} startIcon={<BugReportIcon />}>
          {diagnosing ? '...' : 'Diagnose API'}
        </Button>
      </Paper>

      {forceSyncing && (
        <Paper sx={{ p: 1.5, mb: 2 }} variant="outlined">
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              {syncProgress?.total ? <CircularProgress variant="determinate" size={48} thickness={4} value={(syncProgress.processed / syncProgress.total) * 100} /> : <CircularProgress size={48} />}
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" fontWeight={800} fontSize={12}>{syncProgress?.total ? `${Math.round((syncProgress.processed / syncProgress.total) * 100)}` : '…'}%</Typography>
              </Box>
            </Box>
            <Box flex={1} minWidth={0}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" fontWeight={700}>Syncing Broma Statuses</Typography>
                <Typography variant="caption" color="text.secondary">{syncProgress?.processed ?? 0}/{syncProgress?.total ?? 0}{syncProgress?.errors ? ` (${syncProgress.errors} err)` : ''}</Typography>
              </Stack>
              <LinearProgress variant={syncProgress?.total ? 'determinate' : 'indeterminate'} sx={{ my: 0.5 }} value={syncProgress?.total ? (syncProgress.processed / syncProgress.total) * 100 : 0} />
              <Typography variant="caption" color="text.secondary" noWrap>{syncProgress?.current || 'Starting…'}</Typography>
            </Box>
          </Stack>
        </Paper>
      )}

      {/* API Diagnostic */}
      {diagnoseResult && (
        <Paper sx={{ p: { xs: 1.5, md: 2 }, mb: 2.5 }} elevation={3}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle2" fontWeight={800} color="info.main">Broma API Diagnostic</Typography>
            <Button size="small" variant="text" color="inherit" onClick={() => setDiagnoseResult(null)}>close</Button>
          </Stack>
          <Box sx={{ maxHeight: 400, overflow: 'auto', bgcolor: 'grey.900', color: 'limegreen', p: 1.5, borderRadius: 1, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(diagnoseResult, null, 2)}
          </Box>
        </Paper>
      )}

      {/* Config Dialog */}
      <Dialog open={configOpen} onClose={() => setConfigOpen(false)} fullWidth maxWidth="sm" TransitionComponent={Slide}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <SettingsIcon fontSize="small" />
            <Typography variant="h6" fontWeight={700}>Configure Broma</Typography>
          </Stack>
          <IconButton size="small" onClick={() => setConfigOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} pt={1}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={bromaProvider?.enabled ? 'enabled' : 'not enabled'} color={bromaProvider?.enabled ? 'success' : 'default'} />
              <Chip size="small" label={hasBromaEmail ? 'email saved' : 'email missing'} color={hasBromaEmail ? 'success' : 'warning'} variant="outlined" />
              <Chip size="small" label={hasBromaPassword ? 'password saved' : 'password missing'} color={hasBromaPassword ? 'success' : 'warning'} variant="outlined" />
            </Stack>
            <Alert severity="info" sx={{ py: 0.75 }}>Leave password blank to keep existing encrypted credentials.</Alert>
            <Stack spacing={1.5}>
              <TextField size="small" label="Base URL" value={bromaForm.baseUrl} onChange={(e) => setBromaForm((c) => ({ ...c, baseUrl: e.target.value }))} fullWidth name="bromaBaseUrl" autoComplete="off" />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField size="small" label="Account ID" value={bromaForm.accountId} onChange={(e) => setBromaForm((c) => ({ ...c, accountId: e.target.value }))} fullWidth name="bromaAccountId" autoComplete="off" />
                <TextField size="small" label="Created Country ID" value={bromaForm.createdCountryId} onChange={(e) => setBromaForm((c) => ({ ...c, createdCountryId: e.target.value }))} fullWidth name="bromaCreatedCountryId" autoComplete="off" helperText="India=32" />
              </Stack>
              <FormControl fullWidth size="small">
                <InputLabel id="bmi">Mode</InputLabel>
                <Select labelId="bmi" label="Mode" value={bromaForm.integrationMode} onChange={(e) => setBromaForm((c) => ({ ...c, integrationMode: e.target.value as BromaConfigForm['integrationMode'] }))}>
                  <MenuItem value="sandbox">Sandbox</MenuItem>
                  <MenuItem value="live">Live</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Divider />
            <Stack spacing={1.5}>
              <Typography variant="subtitle2" fontWeight={600}>Credentials</Typography>
              <TextField size="small" label="Broma Email" value={bromaForm.email} onChange={(e) => setBromaForm((c) => ({ ...c, email: e.target.value }))} fullWidth type="email" name="bromaEmail" autoComplete="off" placeholder={hasBromaEmail ? 'Saved. Enter to replace.' : ''} />
              <TextField size="small" label="Broma Password" value={bromaForm.password} onChange={(e) => setBromaForm((c) => ({ ...c, password: e.target.value }))} fullWidth type="password" name="bromaPassword" autoComplete="new-password" placeholder={hasBromaPassword ? 'Saved. Leave blank to keep.' : ''} />
            </Stack>
            <Divider />
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" fontWeight={600}>Synced Outlets</Typography>
                <Chip size="small" color="primary" variant="outlined" label={`${bromaOutlets.length}`} />
              </Stack>
              {bromaOutlets.length === 0
                ? <Typography variant="caption" color="text.secondary">No outlets synced yet.</Typography>
                : <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, maxHeight: 160, overflow: 'auto'}}>
                    {bromaOutlets.map((outlet) => (
                      <Tooltip key={outlet.outletId} title={((outlet.name || '') + ' \u00B7 ' + ((outlet.releaseTypes || []).join(', ') || '') + ' \u00B7 synced ' + (outlet.syncedAt ? new Date(outlet.syncedAt).toLocaleDateString() : '?'))}>
                        <Chip size="small" label={outlet.name} variant="outlined" />
                      </Tooltip>
                    ))}
                  </Box>
              }
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setConfigOpen(false)} color="inherit">Cancel</Button>
          <Button variant="contained" onClick={handleSaveBromaConfig} disabled={savingBroma}>{savingBroma ? 'Saving...' : 'Save Broma'}</Button>
        </DialogActions>
      </Dialog>


      {/* Release Tabs */}
      <Paper sx={{ mb: 1 }}>
        <Tabs value={releaseTab} onChange={(_, v) => { setReleaseTab(v); }} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.75 } }}>
          <Tab value="all" label={<Stack direction="row" spacing={0.5} alignItems="center"><Typography variant="body2">All</Typography><Chip size="small" label={totalCountsAll} variant="outlined" sx={{ height: 18, fontSize: 11 }} /></Stack>} />
          <Tab value="processing" label={<Stack direction="row" spacing={0.5} alignItems="center"><HourglassTopIcon sx={{ fontSize: 14, color: 'info.main' }} /><Typography variant="body2" fontWeight={600}>{totalCountsProcessing}</Typography><Typography variant="body2" color="text.secondary">Processing</Typography></Stack>} />
          <Tab value="delivered" label={<Stack direction="row" spacing={0.5} alignItems="center"><CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} /><Typography variant="body2" fontWeight={600}>{totalCountsDelivered}</Typography><Typography variant="body2" color="text.secondary">Delivered</Typography></Stack>} />
          <Tab value="failed" label={<Stack direction="row" spacing={0.5} alignItems="center"><CancelIcon sx={{ fontSize: 14, color: 'error.main' }} /><Typography variant="body2" fontWeight={600}>{totalCountsFailed}</Typography><Typography variant="body2" color="text.secondary">Failed</Typography></Stack>} />
          <Tab value="queued" label={<Stack direction="row" spacing={0.5} alignItems="center"><ListAltIcon sx={{ fontSize: 14 }} /><Typography variant="body2" fontWeight={600}>{totalCountsQueued}</Typography><Typography variant="body2" color="text.secondary">Queued</Typography></Stack>} />
          <Tab value="drafts" label={<Stack direction="row" spacing={0.5} alignItems="center"><ListAltIcon sx={{ fontSize: 14 }} /><Typography variant="body2" fontWeight={600}>{draftsLoading ? '-' : bromaDraftsTotal ?? bromaDrafts?.length ?? '-'}</Typography><Typography variant="body2" color="text.secondary">Drafts</Typography></Stack>} />
        </Tabs>
      </Paper>

      {/* Content: Jobs Table or Drafts Table */}
      {releaseTab === 'drafts' ? (
        <Paper sx={{ p: { xs: 1.5, md: 2 } }}>
          <Stack direction="row" spacing={1.5} mb={2} justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.secondary">Orphans have no delivery job. Terminal = already delivered/cancelled.</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button size="small" variant="outlined" color="error" onClick={() => handleDraftCleanup('delete_orphans')} disabled={cleaningUp !== 'idle'} startIcon={<CleaningServicesIcon />}>
                {cleaningUp === 'deleting' ? 'Deleting...' : 'Delete Orphans'}
              </Button>
              <Button size="small" variant="outlined" color="warning" onClick={() => handleDraftCleanup('resume_orphans')} disabled={cleaningUp !== 'idle'} startIcon={<ReplayIcon />}>
                {cleaningUp === 'resuming' ? 'Resuming...' : 'Resume Drafts'}
              </Button>
              <Button size="small" variant="outlined" onClick={handleRetryBromaDrafts} disabled={retryingDrafts || !bromaDrafts?.length}>
                {retryingDrafts ? 'Retrying...' : 'Retry All'}
              </Button>
              <Button size="small" variant="contained" color="success" onClick={handleForceProcess} disabled={forceProcessing || !bromaDrafts?.length} startIcon={<PlayArrowIcon />}>
                {forceProcessing ? 'Processing...' : 'Force Process'}
              </Button>
            </Stack>
          </Stack>
          {cleanupResult && (
            <Alert severity={cleanupResult.errors?.length ? 'warning' : 'success'} sx={{ mb: 1.5, py: 0.5 }}>
              {cleanupResult.action === 'delete_orphans' ? 'Cleanup' : 'Resume'} result: {cleanupResult.deleted || 0} deleted, {cleanupResult.resumed || 0} resumed, {cleanupResult.orphaned || 0} orphans, {cleanupResult.active || 0} active, {cleanupResult.terminal || 0} terminal
              {cleanupResult.errors?.length > 0 && <span>. Errors: {cleanupResult.errors.join('; ')}</span>}
            </Alert>
          )}
          {draftsLoading && !bromaDrafts ? (
            <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box>
          ) : !bromaDrafts?.length ? (
            <Typography variant="body2" color="text.secondary" py={3} textAlign="center">No drafts found in Broma.</Typography>
          ) : (
            <>{draftsLoading && <LinearProgress sx={{ borderRadius: 0 }} />}<Box sx={{ maxHeight: 480, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Step</TableCell>
                    <TableCell>Broma ID</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Draft Issue</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bromaDrafts.slice(draftPage * draftRowsPerPage, draftPage * draftRowsPerPage + draftRowsPerPage).map((d, i) => {
                    const isOrphan = d.jobState === 'no_job';
                    const isStuck = d.jobState === 'processing' || d.jobState === 'queued';
                    const isTerminal = d.completed;
                    return (
                      <TableRow key={d.bromaDraftId || i} hover sx={{ opacity: isTerminal ? 0.5 : 1 }}>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isOrphan ? 700 : undefined }}>{d.releaseTitle || d.bromaDraftId?.slice(-8) || '-'}</TableCell>
                        <TableCell><StepChip step={d.bromaStep} /></TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{d.bromaDraftId || '-'}</TableCell>
                        <TableCell>
                          {isTerminal ? <Chip size="small" label="delivered" color="success" />
                            : isOrphan ? <Chip size="small" label="orphan" color="error" variant="filled" />
                            : <Chip size="small" label={d.jobState} color={d.jobState === 'failed' ? 'error' : d.jobState === 'processing' ? 'info' : 'default'} />}
                        </TableCell>
                        <TableCell>
                          {isOrphan && <Chip size="small" label="no job record" color="warning" variant="outlined" />}
                          {isStuck && <StepChip step={d.bromaStep} />}
                        </TableCell>
                        <TableCell>{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box><TablePagination component="div" count={bromaDraftsTotal ?? 0} page={draftPage} rowsPerPage={draftRowsPerPage} rowsPerPageOptions={[10]} onPageChange={(_, np) => setDraftPage(np)} onRowsPerPageChange={(e) => { setDraftRowsPerPage(Number(e.target.value)); setDraftPage(0); }} /></>
          )}
        </Paper>
      ) : (
        <Paper sx={{ overflow: 'hidden' }}>
          {loading ? <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box> : (
            <>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={40} />
                    <TableCell>Track / Release</TableCell>
                    <TableCell>Provider</TableCell>
                    <TableCell>Op</TableCell>
                    <TableCell>State</TableCell>
                    <TableCell sx={{ minWidth: 160 }}>Progress</TableCell>
                    <TableCell>Retry</TableCell>
                    <TableCell sx={{ maxWidth: 240 }}>Error</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tabFilteredJobs.map((listJob) => {
                    const job = jobDetails[listJob._id] || listJob;
                    const isExpanded = expandedJobId === listJob._id;
                    const isLoadingDetails = loadingJobDetailsId === listJob._id && !jobDetails[listJob._id];
                    const bromaProgress = getBromaProgress(job);
                    const canRefresh = job.providerKey === 'broma';
                    const bromaStep = job.metadata?.bromaStep || '';
                    const isStuckEarly = job.providerKey === 'broma' && job.state === 'processing' && (bromaStep === 'create_release' || bromaStep === 'upload_recordings');

                    return (
                      <Fragment key={listJob._id}>
                        <TableRow sx={isStuckEarly ? { bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,152,0,0.08)' : 'rgba(255,152,0,0.04)' } : undefined}>
                          <TableCell>
                            <Tooltip title={isExpanded ? 'Collapse' : 'Expand details'}>
                              <IconButton size="small" onClick={() => handleToggleJob(listJob._id)}>
                                {isExpanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{job.targetType === 'release' ? job.metadata?.releaseTitle || 'Release delivery' : job.trackId?.title || 'Unknown'}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {job.targetType === 'release' ? `${job.metadata?.deliverySnapshot?.trackCount || 0} tracks${job.metadata?.deliverySnapshot?.upc ? ` | ${job.metadata.deliverySnapshot.upc}` : ''}` : `${job.trackId?.artistName || ''}`}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <DspLogo value={job.providerKey} alt={providerMap.get(job.providerKey) || getDspDisplayName(job.providerKey)} size={26} padding={0.25} />
                              <Typography variant="body2" fontWeight={600}>{providerMap.get(job.providerKey) || getDspDisplayName(job.providerKey)}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>{job.operation}</TableCell>
                          <TableCell>
                            <Chip
                              label={job.state}
                              color={job.state === 'delivered' ? 'success' : job.state === 'failed' || job.state === 'needs_attention' ? 'error' : job.state === 'processing' ? 'info' : 'default'}
                              size="small"
                              variant={isStuckEarly ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                          <TableCell>
                            <Stack spacing={0.35}>
                              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                <Typography variant="caption" fontWeight={800} noWrap sx={{ fontSize: '0.68rem', maxWidth: 120 }}>{bromaProgress.label}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums' }}>{bromaProgress.value}%</Typography>
                              </Stack>
                              <Tooltip title={bromaProgress.detail}>
                                <LinearProgress variant="determinate" value={bromaProgress.value} color={bromaProgress.color} sx={{ height: 4, borderRadius: 999, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { borderRadius: 999 } }} />
                              </Tooltip>
                            </Stack>
                          </TableCell>
                          <TableCell>{job.retryCount}</TableCell>
                          <TableCell sx={{ maxWidth: 220 }}>
                            <Typography variant="caption" color={job.errorMessage ? 'error.main' : 'text.secondary'} sx={{ wordBreak: 'break-word' }}>
                              {job.metadata?.bromaErrorDetails || job.errorMessage || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell><Typography variant="caption" color="text.secondary">{new Date(job.createdAt).toLocaleString()}</Typography></TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                              <Tooltip title={canRefresh ? 'Fetch fresh Broma status' : 'No Broma ID'}>
                                <span>
                                  <IconButton size="small" disabled={!canRefresh || refreshingStatusId === job._id} onClick={() => handleRefreshStatus(job._id)}>
                                    {refreshingStatusId === job._id ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Clear log, move release to pending">
                                <span>
                                  <IconButton size="small" color="warning" disabled={clearingLogsId === job._id} onClick={() => handleClearLogs(job._id)}>
                                    {clearingLogsId === job._id ? <CircularProgress size={18} /> : <DeleteSweepIcon fontSize="small" />}
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Delete Broma draft & rebuild snapshot with current release data">
                                <span>
                                  <Button size="small" color="warning" variant="outlined" disabled={!['failed', 'needs_attention'].includes(job.state) || retryingIndividualId === job._id} onClick={() => handleRetryIndividual(job._id)} startIcon={retryingIndividualId === job._id ? <CircularProgress size={14} /> : <BuildIcon />}>Fix & Retry</Button>
                                </span>
                              </Tooltip>
                              <Button size="small" variant="outlined" disabled={!['failed', 'needs_attention'].includes(job.state)} onClick={() => handleRetry(job._id)} startIcon={<ReplayIcon />}>Retry</Button>
                              {['failed', 'needs_attention'].includes(job.state) && (
                                <Button size="small" variant="outlined" color="error" disabled={deletingId === job._id} onClick={() => handleDeleteJob(job._id)} startIcon={deletingId === job._id ? <CircularProgress size={14} /> : undefined}>Delete</Button>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={10} sx={{ p: 0, borderBottom: isExpanded ? undefined : 0 }}>
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              {isLoadingDetails ? <Box display="flex" justifyContent="center" py={3} bgcolor="action.hover"><CircularProgress size={22} /></Box> : (
                                <Box sx={{ px: 3, py: 2, bgcolor: 'action.hover' }}>
                                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2} flexWrap="wrap">
                                    <Box><Typography variant="overline" color="text.secondary">External ID</Typography><Typography variant="body2">{job.externalId || '-'}</Typography></Box>
                                    <Box><Typography variant="overline" color="text.secondary">Worker</Typography><Typography variant="body2">{job.lockedBy || '-'}</Typography></Box>
                                    <Box><Typography variant="overline" color="text.secondary">Lock Expires</Typography><Typography variant="body2">{job.lockExpiresAt ? new Date(job.lockExpiresAt).toLocaleString() : '-'}</Typography></Box>
                                    <Box sx={{ minWidth: 0 }}><Typography variant="overline" color="text.secondary">Payload Hash</Typography><Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{job.metadata?.payloadHash || '-'}</Typography></Box>
                                    <Box><Typography variant="overline" color="text.secondary">Broma Step</Typography><Typography variant="body2">{job.metadata?.bromaStep || '-'}</Typography></Box>
                                    <Box><Typography variant="overline" color="text.secondary">Broma Status</Typography><Chip size="small" label={job.metadata?.bromaModerationStatus || '-'} color={BROMA_DONE_STATUSES.has(String(job.metadata?.bromaModerationStatus || '')) ? 'success' : BROMA_BLOCKED_STATUSES.has(String(job.metadata?.bromaModerationStatus || '')) ? 'error' : 'default'} /></Box>
                                    <Box><Typography variant="overline" color="text.secondary">Last Status At</Typography><Typography variant="body2">{job.metadata?.bromaLastStatusAt ? new Date(job.metadata?.bromaLastStatusAt).toLocaleString() : '-'}</Typography></Box>
                                    <Box><Typography variant="overline" color="text.secondary">Raw Status</Typography><Typography variant="body2">{job.metadata?.bromaRawStatus || '-'}</Typography></Box>
                                  </Stack>
                                  <Box mb={2}>
                                    <Typography variant="overline" color="text.secondary">Selected Outlets</Typography>
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={0.5}>
                                      {(job.metadata?.bromaOutletMappings || []).map((m, i) => <Chip key={`${job._id}-om-${i}`} size="small" variant="outlined" label={`${m.store || 'store'} -> ${m.name || m.outletId || 'outlet'}`} />)}
                                      {(!job.metadata?.bromaOutletMappings || !job.metadata?.bromaOutletMappings.length) && <Typography variant="caption" color="text.secondary">None stored.</Typography>}
                                    </Stack>
                                  </Box>
                                  <Divider sx={{ mb: 2 }} />
                                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                                    <Box flex={1} minWidth={0}>
                                      <Typography variant="subtitle2" fontWeight={800} mb={1}>Attempts</Typography>
                                      <Stack spacing={1}>
                                        {(job.attempts || []).slice(-4).map((a) => {
                                          const body = formatAttemptResponse(a.responseBody);
                                          return (
                                            <Stack key={`${job._id}-a-${a.attemptNo}`} spacing={0.75}>
                                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                                <Chip size="small" label={`#${a.attemptNo}`} variant="outlined" />
                                                <Chip size="small" label={a.status} color={a.status === 'success' ? 'success' : 'error'} />
                                                <Typography variant="caption" color="text.secondary">{a.responseCode || a.errorMessage || '-'}</Typography>
                                              </Stack>
                                              {body && <Typography component="pre" variant="caption" sx={{ m: 0, p: 1, borderRadius: 1, bgcolor: 'grey.100', color: 'text.secondary', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{body}</Typography>}
                                            </Stack>
                                          );
                                        })}
                                        {(!job.attempts || !job.attempts.length) && <Typography variant="caption" color="text.secondary">No attempts yet.</Typography>}
                                      </Stack>
                                    </Box>
                                    <Box flex={1.4} minWidth={0}>
                                      <Typography variant="subtitle2" fontWeight={800} mb={1}>Events</Typography>
                                      <Stack spacing={1}>
                                        {(job.events || []).slice(-8).map((e, i) => (
                                          <Box key={`${job._id}-e-${i}`}>
                                            <Typography variant="caption" color="text.secondary">{new Date(e.createdAt).toLocaleString()} | {e.source} | {e.state}</Typography>
                                            <Typography variant="body2">{e.message}</Typography>
                                          </Box>
                                        ))}
                                        {(!job.events || !job.events.length) && <Typography variant="caption" color="text.secondary">No events.</Typography>}
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
                  {tabFilteredJobs.length === 0 && <TableRow><TableCell colSpan={10} align="center"><Typography variant="body2" color="text.secondary" py={3}>No delivery jobs found for this filter.</Typography></TableCell></TableRow>}
                </TableBody>
              </Table>
            </>
          )}
        </Paper>
      )}
    </Box>
  );
}
