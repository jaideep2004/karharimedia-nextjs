'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Autocomplete,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Paper,
  Button,
  Card,
  CardContent,
  Radio,
  FormControl,
  Divider,
  CircularProgress,
  TextField,
  MenuItem,
  Chip,
  IconButton,
  Alert,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Checkbox,
  InputAdornment,
  Tooltip,
  Fade,
  Slide,
  Avatar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  MusicNote,
  Album,
  LibraryMusic,
  ArrowForward,
  ArrowBack,
  CloudUpload,
  Delete,
  Add,
  ExpandMore,
  Info,
  CheckCircle,
  AudioFile,
  Image,
  PlayArrow,
  Stop,
  PlaylistAddCheck,
} from '@mui/icons-material';
import { useAuth } from '@/context/AppContext';
import Cookies from 'js-cookie';
import countries from '@/utils/countries';
import { ALL_DSP_KEYS, DSP_META, DspMeta, DspKey, SOCIAL_RIGHTS_DSP_KEYS } from '@/lib/platforms';
import { DspLogo } from '@/components/dsp/DspLogo';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import languagesData from '@/data/languages.json';
import genreTaxonomyData from '@/data/genreTaxonomy.json';
import {
  AcrCloudStatusLike,
  fetchAcrCloudScanResult,
  getAcrCloudColor,
  getAcrCloudLabel,
  getAcrCloudState,
  getAcrCloudSummary,
} from '@/lib/acrCloud';
import {
  FACEBOOK_RIGHTS_MANAGER_TERMS_URL,
  YOUTUBE_CONTENT_ID_TERMS_URL,
  requiresFacebookRightsPolicy,
  requiresYoutubePolicy,
} from '@/lib/releaseConsent';
import { getConfiguredApiBaseUrl } from '@/lib/urlConfig';
import { getReleaseRejectionReason } from '@/lib/releaseStatus';

// Helper: call Express API for uploads (uses NEXT_PUBLIC_API_URL in browser)
const API_BASE =
  getConfiguredApiBaseUrl()
    .replace(/\/+$/, '')
    .replace(/\/api$/, '') + '/api';
const VERCEL_FUNCTION_UPLOAD_LIMIT_BYTES = 4.5 * 1024 * 1024;
const VERCEL_FUNCTION_UPLOAD_SAFE_BYTES = 4.3 * 1024 * 1024;
const isVercelFunctionUploadTarget =
  typeof window !== 'undefined' && /^https:\/\/[^/]+\.vercel\.app\/api$/.test(API_BASE);

const assertVercelUploadSize = (file: File, type: 'artwork' | 'audio') => {
  if (!isVercelFunctionUploadTarget || file.size <= VERCEL_FUNCTION_UPLOAD_SAFE_BYTES) return;

  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  const limitMb = (VERCEL_FUNCTION_UPLOAD_LIMIT_BYTES / (1024 * 1024)).toFixed(1);
  throw new Error(
    `${type === 'audio' ? 'Audio' : 'Artwork'} file is ${sizeMb}MB. Vercel Functions only accept about ${limitMb}MB request bodies. Upload via direct storage or deploy the Express upload server on a non-serverless Node host.`
  );
};

type AcrCloudUploadState = AcrCloudStatusLike;

const resizeList = <T,>(items: T[], length: number, fallback: T): T[] => {
  if (items.length === length) return items;
  if (items.length > length) return items.slice(0, length);
  return [...items, ...Array.from({ length: length - items.length }, () => fallback)];
};

async function uploadArtworkToServer(file: File): Promise<{ url: string; filename: string }> {
  assertVercelUploadSize(file, 'artwork');
  const fd = new FormData();
  fd.append('artwork', file);
  const token = Cookies.get('token');
  const res = await fetch(`${API_BASE}/uploads/artwork`, {
    method: 'POST',
    body: fd,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Failed to upload artwork');
  }
  const data = await res.json();
  return { url: data.url, filename: data.filename };
}

async function uploadAudioToServer(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string; filename: string; acrCloud?: AcrCloudUploadState }> {
  assertVercelUploadSize(file, 'audio');
  const fd = new FormData();
  fd.append('audio', file);
  const token = Cookies.get('token');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/uploads/audio`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((100 * ev.loaded) / ev.total)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ url: data.url, filename: data.filename, acrCloud: data.acrCloud });
        } catch {
          reject(new Error('Invalid upload response'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err?.error || xhr.statusText || 'Failed to upload audio'));
        } catch {
          reject(new Error('Failed to upload audio'));
        }
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(fd);
  });
}

// Define release types

type ReleaseType = 'single' | 'ep' | 'album';

interface TrackData {
  id: string;
  title: string;
  version: string;
  primaryArtist: string;
  featuring: string;
  remixer: string;
  audioFile: File | null;
  duration: string;
  isrc: string;
  explicit: boolean;
  genre: string;
  subgenre: string;
  composers: string;
  publishers: string;
  producers: string;
  lyrics: string;
  copyrightC: string;
  copyrightP: string;
  recordingYear: string;
  language: string;
  instrumental: boolean;
}

interface ReleaseData {
  releaseType: ReleaseType;
  releaseTitle: string;
  primaryArtist: string;
  label: string;
  upc: string;
  releaseDate: string;
  artwork: File | null;
  territories: string[];
  stores: string[];
  tracks: TrackData[];
}

interface ReleaseTypeOption {
  value: ReleaseType;
  label: string;
  description: string;
  icon: React.ReactNode;
  minTracks: number;
  maxTracks: number;
  color: string;
}

const releaseTypes: ReleaseTypeOption[] = [
  {
    value: 'single',
    label: 'Single',
    description: '1 track only for focused promotion',
    icon: <MusicNote sx={{ fontSize: 40 }} />,
    minTracks: 1,
    maxTracks: 1,
    color: '#1976d2',
  },
  {
    value: 'ep',
    label: 'EP',
    description: '3-7 tracks for extended storytelling',
    icon: <Album sx={{ fontSize: 40 }} />,
    minTracks: 3,
    maxTracks: 7,
    color: '#ed6c02',
  },
  {
    value: 'album',
    label: 'Album',
    description: 'Up to 50 tracks for complete artistic vision',
    icon: <LibraryMusic sx={{ fontSize: 40 }} />,
    minTracks: 7,
    maxTracks: 50,
    color: '#2e7d32',
  },
];

type LanguageOption = { code: string; name: string };
type GenreOption = { name: string; subgenres: string[] };

const languages = languagesData as LanguageOption[];
const genreTaxonomy = genreTaxonomyData as GenreOption[];
const genres = genreTaxonomy.map(genre => genre.name);
const allSubgenres = Array.from(new Set(genreTaxonomy.flatMap(genre => genre.subgenres))).sort();
const getLanguageOption = (value?: string) =>
  languages.find(lang => lang.code === value || lang.name === value) || null;
const getSubgenreOptions = (genre?: string) =>
  genreTaxonomy.find(item => item.name === genre)?.subgenres || allSubgenres;

// Define steps (combined flow)
const steps = [
  'Select Release Type',
  'Artwork',
  'Tracks & Info',
  'Distribution Providers',
  'Territories & Rights',
  'Review & Submit',
];

// --- helpers: formatting for analysis data ---
const formatDuration = (seconds: number | string) => {
  const s = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  if (!Number.isFinite(s)) return '';
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatBitrate = (bpsOrKbps?: number) => {
  if (!bpsOrKbps || !Number.isFinite(bpsOrKbps)) return '';
  // Some analyzers return kbps already; if very large, treat as bps
  return bpsOrKbps > 10000
    ? `${Math.round(bpsOrKbps / 1000)} kbps`
    : `${Math.round(bpsOrKbps)} kbps`;
};

function AcrCloudResultPanel({
  acrCloud,
  progress,
}: {
  acrCloud?: AcrCloudUploadState | null;
  progress: number;
}) {
  if (!acrCloud) return null;

  const state = getAcrCloudState(acrCloud);
  const showProgress = state === 'pending' || (progress > 0 && progress < 100);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 1.5,
          alignItems: 'center',
          flexWrap: 'wrap',
          mb: 1.5,
        }}
      >
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>
            ACRCloud verification
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Scan details are available to admins during release review.
          </Typography>
        </Box>
        <Chip
          size="small"
          icon={
            state === 'pending' ? (
              <CircularProgress size={12} />
            ) : (
              <PlaylistAddCheck fontSize="small" />
            )
          }
          label={getAcrCloudLabel(acrCloud)}
          color={getAcrCloudColor(acrCloud) as any}
          variant="outlined"
        />
      </Box>

      {showProgress ? (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary">
              ACR scan progress
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {progress}%
            </Typography>
          </Box>
          <LinearProgress
            variant={state === 'pending' ? 'determinate' : 'determinate'}
            value={Math.min(100, Math.max(0, progress))}
            sx={{ height: 7, borderRadius: 4, '& .MuiLinearProgress-bar': { borderRadius: 4 } }}
          />
        </Box>
      ) : null}

      {acrCloud.lastError ? (
        <Alert severity={state === 'not_configured' ? 'info' : 'error'} sx={{ mb: 2 }}>
          {acrCloud.lastError}
        </Alert>
      ) : null}
    </Paper>
  );
}

import TerritoryManager, { TerritoryMode } from '@/components/territory/TerritoryManager';
import RightsManager, { RightsType } from '@/components/rights/RightsManager';
// --- TrackInfo type (inline, since not using TrackInfoForm) ---
type ContributorRole =
  | 'artist'
  | 'performer'
  | 'composer'
  | 'lyricist'
  | 'producer'
  | 'publisher'
  | 'remixer'
  | 'other';

interface TrackContributor {
  role: ContributorRole;
  name: string;
}

interface TrackInfo {
  title: string;
  version: string;
  artist: string;
  featuring: string;
  remixer: string;
  isrc: string;
  upc: string;
  language: string;
  metadataLanguage: string;
  audioLanguage: string;
  explicit: boolean;
  genre: string;
  subgenre: string;
  trackNumber: number;
  discNumber: number;
  duration: string;
  composers: string;
  publishers: string;
  producers: string;
  lyrics: string;
  copyrightC: string;
  copyrightP: string;
  copyrightCYear: string;
  copyrightPYear: string;
  recordingYear: string;
  originalReleaseDate: string;
  parentalAdvisory: string;
  instrumental: boolean;
  contributors: TrackContributor[];
}

const contributorRoles: { value: ContributorRole; label: string }[] = [
  { value: 'artist', label: 'Artist' },
  { value: 'performer', label: 'Performer' },
  { value: 'composer', label: 'Composer' },
  { value: 'lyricist', label: 'Lyricist' },
  { value: 'producer', label: 'Producer' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'remixer', label: 'Remixer' },
  { value: 'other', label: 'Other' },
];

const currentYear = new Date().getFullYear();
const copyrightYears = Array.from({ length: 80 }, (_, index) => String(currentYear - index));
const getLocalDateInputValue = (date = new Date()) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
};

const RELEASE_DRAFT_PREFIX = 'karharimedia.releaseDraft.v1.';
const RELEASE_DRAFT_BACKUP_KEY = `${RELEASE_DRAFT_PREFIX}latest`;
const createReleaseDraftId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const cloneTrackInfo = (info: TrackInfo): TrackInfo => ({
  ...info,
  contributors: info.contributors.map(contributor => ({ ...contributor })),
});

const createDefaultTrackInfo = (): TrackInfo => cloneTrackInfo(defaultTrackInfo);

const defaultTrackInfo: TrackInfo = {
  title: '',
  version: '',
  artist: '',
  featuring: '',
  remixer: '',
  isrc: '',
  upc: '',
  language: '',
  metadataLanguage: '',
  audioLanguage: '',
  explicit: false,
  genre: '',
  subgenre: '',
  trackNumber: 1,
  discNumber: 1,
  duration: '',
  composers: '',
  publishers: '',
  lyrics: '',
  producers: '',
  copyrightC: '',
  copyrightP: '',
  copyrightCYear: String(currentYear),
  copyrightPYear: String(currentYear),
  recordingYear: '',
  originalReleaseDate: '',
  parentalAdvisory: 'none',
  instrumental: false,
  contributors: [
    { role: 'artist', name: '' },
    { role: 'composer', name: '' },
    { role: 'lyricist', name: '' },
  ],
};

const splitNames = (value?: string) =>
  String(value || '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);

const namesToContributors = (role: ContributorRole, value?: string): TrackContributor[] =>
  splitNames(value).map(name => ({ role, name }));

const ensureRequiredContributorRows = (contributors: TrackContributor[]) => {
  const next = contributors.map(contributor => ({ ...contributor }));
  (['artist', 'composer', 'lyricist'] as ContributorRole[]).forEach(role => {
    if (!next.some(contributor => contributor.role === role)) {
      next.push({ role, name: '' });
    }
  });
  return next;
};

const toDateInputValue = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const trackToTrackInfo = (track: any, index: number): TrackInfo => {
  const contributors =
    Array.isArray(track?.contributors) && track.contributors.length
      ? track.contributors
          .filter((contributor: any) => contributor?.name)
          .map((contributor: any) => ({
            role: (contributor.role || 'performer') as ContributorRole,
            name: String(contributor.name || ''),
          }))
      : [
          ...namesToContributors('artist', track?.artist),
          ...namesToContributors('performer', track?.featuring),
          ...namesToContributors('composer', track?.composers),
          ...namesToContributors('publisher', track?.publishers),
          ...namesToContributors('producer', track?.producers),
          ...namesToContributors('remixer', track?.remixer),
        ];

  return {
    ...createDefaultTrackInfo(),
    title: track?.title || '',
    version: track?.version || '',
    artist: track?.artist || '',
    featuring: track?.featuring || '',
    remixer: track?.remixer || '',
    isrc: track?.isrc || '',
    upc: track?.upc || '',
    language: track?.language || track?.audioLanguage || '',
    metadataLanguage: track?.metadataLanguage || '',
    audioLanguage: track?.audioLanguage || track?.language || '',
    explicit: Boolean(track?.explicit),
    genre: track?.genre || '',
    subgenre: track?.subgenre || track?.subGenre || '',
    trackNumber: Number(track?.trackNumber || index + 1),
    discNumber: Number(track?.discNumber || 1),
    duration: String(track?.duration || ''),
    composers: track?.composers || '',
    publishers: track?.publishers || '',
    producers: track?.producers || '',
    lyrics: track?.lyrics || '',
    copyrightC: track?.copyrightC || '',
    copyrightP: track?.copyrightP || '',
    copyrightCYear: String(track?.copyrightCYear || currentYear),
    copyrightPYear: String(track?.copyrightPYear || currentYear),
    recordingYear: String(track?.recordingYear || ''),
    originalReleaseDate: toDateInputValue(track?.originalReleaseDate),
    parentalAdvisory: track?.parentalAdvisory || 'none',
    instrumental: Boolean(track?.instrumental),
    contributors: ensureRequiredContributorRows(
      contributors.length ? contributors : [{ role: 'artist', name: track?.artist || '' }]
    ),
  };
};

export default function UploadPage() {
  const theme = useTheme();
  const router = useRouter();
  // ...existing state
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success'>('idle');
  const submitSucceededRef = useRef(false);
  const [editReleaseId, setEditReleaseId] = useState('');
  const isEditMode = Boolean(editReleaseId);
  const [releaseTitle, setReleaseTitle] = useState('');
  const [label, setLabel] = useState('');
  const [upc, setUpc] = useState('');
  const [autoGenerateCodes, setAutoGenerateCodes] = useState(true);
  const [autoGenerateIsrcs, setAutoGenerateIsrcs] = useState(true);
  const [allowedDspKeys, setAllowedDspKeys] = useState<DspKey[] | null>(null);
  const [platformAccessError, setPlatformAccessError] = useState('');
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState(100);
  const [allowedAudioExtensions, setAllowedAudioExtensions] = useState([
    'mp3',
    'wav',
    'aac',
    'flac',
  ]);
  // ...existing state

  // All hooks must be at the top and called unconditionally
  const auth = useAuth();
  // All useState hooks declared at the top in consistent order
  const [mounted, setMounted] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [releaseType, setReleaseType] = useState<ReleaseType>('single');
  const [tracks, setTracks] = useState<File[]>([]);
  // Which track is being edited in the right-side form
  const [selectedTrackIdx, setSelectedTrackIdx] = useState<number>(0);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  // Step 1 track analysis state (must always be declared after tracks)
  const [analysisResults, setAnalysisResults] = useState<(any | null)[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState<boolean[]>([]);
  const [analysisErrors, setAnalysisErrors] = useState<(string | null)[]>([]);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  // Track upload progress indicator (indeterminate for now)
  const [trackUploading, setTrackUploading] = useState<boolean[]>([]);
  const [audioUploadPct, setAudioUploadPct] = useState<number[]>([]);
  const [acrCloudProgressPct, setAcrCloudProgressPct] = useState<number[]>([]);
  const appendTracksInputRef = useRef<HTMLInputElement | null>(null);
  const acrCloudPollRef = useRef<Record<number, string>>({});
  // Uploaded media (server) state
  const [artworkUploadedUrl, setArtworkUploadedUrl] = useState<string | null>(null);
  const [artworkUploadedFilename, setArtworkUploadedFilename] = useState<string | null>(null);
  const [audioUploadedUrls, setAudioUploadedUrls] = useState<(string | null)[]>([]);
  const [audioUploadedFilenames, setAudioUploadedFilenames] = useState<(string | null)[]>([]);
  const [audioAcrCloudStatuses, setAudioAcrCloudStatuses] = useState<
    (AcrCloudUploadState | null)[]
  >([]);
  const [territoryCountries, setTerritoryCountries] = useState<string[]>([]);
  const [territoryMode, setTerritoryMode] = useState<TerritoryMode>('allowed');
  const [rightsType, setRightsType] = useState<RightsType>('exclusive');
  const [rightsDescription, setRightsDescription] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState('');
  // Multi-track info state for Track Information step
  const [trackInfos, setTrackInfos] = useState<TrackInfo[]>([]);
  // Distribution Step State
  type DspItem = DspMeta;
  const visibleDSPs = useMemo(() => {
    const allow = new Set((allowedDspKeys ?? ALL_DSP_KEYS) as string[]);
    return DSP_META.filter((dsp: DspItem) => allow.has(dsp.key));
  }, [allowedDspKeys]);
  const socialRightsDspKeySet = useMemo(() => new Set(SOCIAL_RIGHTS_DSP_KEYS), []);
  const socialRightsDSPs = useMemo(
    () => visibleDSPs.filter((dsp: DspItem) => socialRightsDspKeySet.has(dsp.key)),
    [socialRightsDspKeySet, visibleDSPs]
  );

  const [selectedDSPs, setSelectedDSPs] = useState<DspKey[]>([]);
  const [releaseWorldwide, setReleaseWorldwide] = useState(true);
  const [releaseDate, setReleaseDate] = useState<string>('');
  const [originalReleaseDate, setOriginalReleaseDate] = useState<string>('');
  const [artworkValidating, setArtworkValidating] = useState<boolean>(false);
  const [artworkUploading, setArtworkUploading] = useState<boolean>(false);
  const [artworkDragActive, setArtworkDragActive] = useState(false);
  const [audioDragActive, setAudioDragActive] = useState(false);
  // Local audio preview URLs for each selected track
  const [trackPreviewUrls, setTrackPreviewUrls] = useState<(string | null)[]>([]);
  const [trackValidationAttempted, setTrackValidationAttempted] = useState(false);
  const [distributionTermsAccepted, setDistributionTermsAccepted] = useState(false);
  const [socialDistributionTermsAccepted, setSocialDistributionTermsAccepted] = useState(false);
  const [summaryDeclarationAccepted, setSummaryDeclarationAccepted] = useState(false);
  const [reviewTerritoriesExpanded, setReviewTerritoriesExpanded] = useState(false);
  const [applyingTrackInfoToAll, setApplyingTrackInfoToAll] = useState(false);
  const [editReleaseLoading, setEditReleaseLoading] = useState(false);
  const [editRejectReason, setEditRejectReason] = useState('');

  // Computed values (not state)
  const isPlatformAccessLoading = allowedDspKeys === null;
  const allSelected = visibleDSPs.length > 0 && selectedDSPs.length === visibleDSPs.length;
  const requiresYoutubeTerms = requiresYoutubePolicy(selectedDSPs);
  const requiresFacebookTerms = requiresFacebookRightsPolicy(selectedDSPs);
  const releaseDraftUserId = auth.user?.id || '';
  const [releaseDraftId, setReleaseDraftId] = useState('');
  const releaseDraftCreatedAtRef = useRef(new Date().toISOString());
  const releaseDraftKey = `${RELEASE_DRAFT_PREFIX}${releaseDraftUserId || 'anonymous'}.${releaseDraftId}`;
  const releaseDraftRestoredRef = useRef(false);
  const [releaseDraftReady, setReleaseDraftReady] = useState(false);
  const releaseDraftServerSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildReleaseDraft = () => ({
    status: 'draft',
    draftId: releaseDraftId,
    createdAt: releaseDraftCreatedAtRef.current,
    updatedAt: new Date().toISOString(),
    ownerUserId: releaseDraftUserId,
    activeStep,
    releaseType,
    releaseTitle,
    label,
    upc,
    autoGenerateCodes,
    autoGenerateIsrcs,
    releaseDate,
    originalReleaseDate,
    artworkUploadedUrl,
    artworkUploadedFilename,
    territoryCountries,
    territoryMode,
    rightsType,
    rightsDescription,
    selectedDSPs,
    releaseWorldwide,
    distributionTermsAccepted,
    socialDistributionTermsAccepted,
    summaryDeclarationAccepted,
    trackInfos,
    audioUploadedUrls,
    audioUploadedFilenames,
    audioAcrCloudStatuses,
  });

  const releaseDraftHasData = (draft = buildReleaseDraft()) =>
    Boolean(
      String(draft.releaseTitle || '').trim() ||
      String(draft.label || '').trim() ||
      String(draft.upc || '').trim() ||
      draft.releaseDate ||
      draft.originalReleaseDate ||
      draft.artworkUploadedUrl ||
      draft.trackInfos.some(track =>
        Object.values(track).some(value => {
          if (Array.isArray(value)) return value.some(item => Object.values(item).some(Boolean));
          return Boolean(value);
        })
      ) ||
      draft.audioUploadedUrls.some(Boolean)
    );

  const persistReleaseDraftLocally = (draft = buildReleaseDraft()) => {
    if (!draft.draftId) return '';
    const serializedDraft = JSON.stringify(draft);
    localStorage.setItem(releaseDraftKey, serializedDraft);
    return serializedDraft;
  };

  const saveReleaseDraftToServer = (draft = buildReleaseDraft(), keepalive = false) =>
    fetch('/api/releases/draft', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: draft.draftId, draft }),
      keepalive,
    }).catch(() => undefined);

  useEffect(() => {
    let mounted = true;
    const loadUploadLimit = async () => {
      try {
        const response = await fetch('/api/settings/upload-limit', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        const nextLimit = Math.min(200, Math.max(1, Number(payload?.maxUploadSize || 100)));
        if (mounted) {
          setMaxUploadSizeMb(nextLimit);
          setAllowedAudioExtensions(
            Array.isArray(payload?.allowedFileTypes) && payload.allowedFileTypes.length
              ? payload.allowedFileTypes.map((type: unknown) =>
                  String(type).trim().toLowerCase().replace(/^\./, '')
                )
              : ['mp3', 'wav', 'aac', 'flac']
          );
        }
      } catch {
        if (mounted) setMaxUploadSizeMb(100);
      }
    };
    void loadUploadLimit();
    return () => {
      mounted = false;
    };
  }, []);

  const ensureTrackStateLength = (length: number) => {
    setAnalysisResults(arr => resizeList(arr, length, null));
    setAnalysisLoading(arr => resizeList(arr, length, false));
    setAnalysisErrors(arr => resizeList(arr, length, null));
    setTrackUploading(arr => resizeList(arr, length, false));
    setAudioUploadPct(arr => resizeList(arr, length, 0));
    setAcrCloudProgressPct(arr => resizeList(arr, length, 0));
    setAudioUploadedUrls(arr => resizeList(arr, length, null));
    setAudioUploadedFilenames(arr => resizeList(arr, length, null));
    setAudioAcrCloudStatuses(arr => resizeList(arr, length, null));
    setTrackInfos(arr => {
      if (arr.length === length) return arr;
      if (arr.length > length) return arr.slice(0, length);
      return [
        ...arr,
        ...Array.from({ length: length - arr.length }, (_, offset) => ({
          ...createDefaultTrackInfo(),
          trackNumber: arr.length + offset + 1,
        })),
      ];
    });
  };

  const setTrackTitleFromFile = (index: number, file: File) => {
    const baseName = file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    if (!baseName) return;
    setTrackInfos(prev =>
      prev.map((info, i) =>
        i === index ? { ...info, title: info.title.trim() ? info.title : baseName } : info
      )
    );
  };

  const setAcrCloudPending = (index: number, progress = 5) => {
    setAudioAcrCloudStatuses(prev =>
      prev.map((status, i) => (i === index ? { ...(status || {}), state: 'pending' } : status))
    );
    setAcrCloudProgressPct(prev =>
      prev.map((pct, i) => (i === index ? Math.max(pct, progress) : pct))
    );
  };

  const getContributorNames = (track: TrackInfo, role: ContributorRole) =>
    track.contributors
      .filter(contributor => contributor.role === role && contributor.name.trim())
      .map(contributor => contributor.name.trim())
      .join(', ');

  useEffect(() => {
    if (!editReleaseId) return;

    let cancelled = false;
    const loadRejectedRelease = async () => {
      try {
        setEditReleaseLoading(true);
        const response = await fetch(`/api/releases/${editReleaseId}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !payload?.release) {
          throw new Error(payload?.error || 'Failed to load rejected release');
        }
        if (cancelled) return;

        const release = payload.release;
        const releaseTracks = Array.isArray(release.tracks) ? release.tracks : [];
        setEditRejectReason(getReleaseRejectionReason(release.rejectionReason || release.rejectReason || ''));
        setReleaseType((release.releaseType || 'single') as ReleaseType);
        setReleaseTitle(release.releaseTitle || release.title || '');
        setLabel(release.label || '');
        setUpc(release.upc || '');
        setAutoGenerateCodes(!release.upc);
        setReleaseDate(toDateInputValue(release.releaseDate));
        setOriginalReleaseDate(toDateInputValue(release.originalReleaseDate));
        const restoredArtworkUrl =
          release.artworkUrl || release.artwork || release.coverArt || release.coverArtUrl || null;
        setArtworkFile(null);
        setArtworkUploadedUrl(restoredArtworkUrl);
        setArtworkPreview(restoredArtworkUrl);
        setArtworkUploadedFilename(release.artworkFile || null);
        setTerritoryCountries(Array.isArray(release.territories) ? release.territories : []);
        setSelectedDSPs(Array.isArray(release.stores) ? release.stores : []);
        setTrackInfos(releaseTracks.map(trackToTrackInfo));
        setTracks(
          releaseTracks.map((track: any, index: number) => {
            const filename =
              track.audioFile || track.filename || `${track.title || `track-${index + 1}`}.mp3`;
            return new File([], filename, { type: 'audio/mpeg' });
          })
        );
        setAudioUploadedUrls(releaseTracks.map((track: any) => track.audioUrl || null));
        setAudioUploadedFilenames(
          releaseTracks.map((track: any) => track.audioFile || track.filename || null)
        );
        setAudioAcrCloudStatuses(releaseTracks.map((track: any) => track.acrCloud || null));
        setTrackPreviewUrls(releaseTracks.map((track: any) => track.audioUrl || null));
        setAudioUploadPct(releaseTracks.map((track: any) => (track.audioUrl ? 100 : 0)));
        setTrackUploading(releaseTracks.map(() => false));
        setAnalysisLoading(releaseTracks.map(() => false));
        setAcrCloudProgressPct(releaseTracks.map((track: any) => (track.acrCloud ? 100 : 0)));
        setActiveStep(0);
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load rejected release');
      } finally {
        if (!cancelled) setEditReleaseLoading(false);
      }
    };

    void loadRejectedRelease();
    return () => {
      cancelled = true;
    };
  }, [editReleaseId]);

  // Simulate release submission to DSPs
  const handleSubmitRelease = async () => {
    setSubmitState('loading');
    // Gather release data
    const releasePayload = {
      releaseType,
      releaseTitle,
      primaryArtist: trackInfos[0] ? getContributorNames(trackInfos[0], 'artist') : '',
      label,
      upc,
      autoGenerateCodes,
      releaseDate,
      originalReleaseDate,
      artworkUrl: artworkUploadedUrl,
      artworkFile: artworkUploadedFilename,
      territories: territoryCountries,
      stores: selectedDSPs,
      policyAcceptances: {
        youtubeContentId: {
          accepted: distributionTermsAccepted,
          policyUrl: YOUTUBE_CONTENT_ID_TERMS_URL,
          policyVersion: '2026-06-18',
        },
        facebookRightsManager: {
          accepted: socialDistributionTermsAccepted,
          policyUrl: FACEBOOK_RIGHTS_MANAGER_TERMS_URL,
          policyVersion: '2026-06-18',
        },
        summaryDeclaration: {
          accepted: summaryDeclarationAccepted,
          policyVersion: '2026-06-18',
        },
      },
      tracks: trackInfos.map((t, idx) => ({
        contributors: t.contributors.filter(contributor => contributor.name.trim()),
        title: t.title,
        artist: getContributorNames(t, 'artist') || t.artist,
        genre: t.genre,
        language: t.audioLanguage || t.language,
        metadataLanguage: t.metadataLanguage,
        audioLanguage: t.audioLanguage || t.language,
        explicit: t.explicit,
        composers: getContributorNames(t, 'composer') || t.composers,
        publishers: getContributorNames(t, 'publisher') || t.publishers,
        producers: getContributorNames(t, 'producer') || t.producers,
        lyrics: t.lyrics,
        copyrightC: t.copyrightC,
        copyrightP: t.copyrightP,
        copyrightCYear: t.copyrightCYear,
        copyrightPYear: t.copyrightPYear,
        recordingYear: t.recordingYear,
        duration: t.duration,
        isrc: autoGenerateIsrcs ? '' : t.isrc,
        upc: t.upc,
        trackNumber: t.trackNumber,
        discNumber: t.discNumber,
        parentalAdvisory: t.parentalAdvisory,
        instrumental: t.instrumental,
        subgenre: t.subgenre,
        version: t.version,
        featuring: getContributorNames(t, 'performer') || t.featuring,
        remixer: getContributorNames(t, 'remixer') || t.remixer,
        originalReleaseDate: t.originalReleaseDate || originalReleaseDate,
        audioUrl: audioUploadedUrls[idx] || null,
        audioFile: audioUploadedFilenames[idx] || null,
        acrCloud: audioAcrCloudStatuses[idx] || null,
      })),
    };
    try {
      const res = await fetch(isEditMode ? `/api/releases/${editReleaseId}` : '/api/releases', {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEditMode ? { ...releasePayload, action: 'update_and_resubmit' } : releasePayload
        ),
      });
      const data = await res.json();
      if (data.success) {
        submitSucceededRef.current = true;
        setSubmitState('success');
        if (releaseDraftId) {
          void fetch(`/api/releases/draft?id=${encodeURIComponent(releaseDraftId)}`, {
            method: 'DELETE',
          }).catch(() => undefined);
        }
        if (typeof window !== 'undefined') {
          localStorage.removeItem(releaseDraftKey);
        }
        toast.success(
          isEditMode ? 'Release updated and resubmitted.' : 'Release submitted for admin review.'
        );
        setTimeout(() => router.push('/dashboard/releases'), 700);
      } else {
        setSubmitState('idle');
        toast.error('Failed to save release: ' + (data.error || 'Unknown error'));
      }
    } catch (e: any) {
      setSubmitState('idle');
      toast.error('Failed to save release: ' + e.message);
    }
  };

  const hasSelectedDistributionProviders = selectedDSPs.length > 0;
  const isDistributionValid =
    hasSelectedDistributionProviders &&
    (!requiresYoutubeTerms || distributionTermsAccepted) &&
    (!requiresFacebookTerms || socialDistributionTermsAccepted);

  // Event handlers
  const handleDSPToggle = (key: DspKey) => {
    setSelectedDSPs(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };
  const handleSelectAll = () => {
    if (visibleDSPs.length === 0) return;
    setSelectedDSPs(allSelected ? [] : visibleDSPs.map((dsp: DspItem) => dsp.key));
  };
  const handleContinue = () => {
    if (isDistributionValid) handleNext();
  };

  // Keep trackInfos in sync with tracks length
  useEffect(() => {
    setTrackInfos(prev => {
      if (prev.length < tracks.length) {
        return [
          ...prev,
          ...Array.from({ length: tracks.length - prev.length }, createDefaultTrackInfo),
        ];
      } else if (prev.length > tracks.length) {
        return prev.slice(0, tracks.length);
      }
      return prev;
    });
  }, [tracks.length]);

  // Handler to update a field for a specific track
  const handleTrackInfoChange = (idx: number, field: keyof TrackInfo, value: any) => {
    setTrackInfos(prev => prev.map((info, i) => (i === idx ? { ...info, [field]: value } : info)));
  };

  const updateContributor = (
    trackIdx: number,
    contributorIdx: number,
    field: keyof TrackContributor,
    value: string
  ) => {
    setTrackInfos(prev =>
      prev.map((info, i) => {
        if (i !== trackIdx) return info;
        return {
          ...info,
          contributors: info.contributors.map((contributor, cIdx) =>
            cIdx === contributorIdx
              ? { ...contributor, [field]: field === 'role' ? (value as ContributorRole) : value }
              : contributor
          ),
        };
      })
    );
  };

  const addContributor = (trackIdx: number) => {
    setTrackInfos(prev =>
      prev.map((info, i) =>
        i === trackIdx
          ? { ...info, contributors: [...info.contributors, { role: 'performer', name: '' }] }
          : info
      )
    );
  };

  const removeContributor = (trackIdx: number, contributorIdx: number) => {
    setTrackInfos(prev =>
      prev.map((info, i) => {
        if (i !== trackIdx) return info;
        const contributors = info.contributors.filter((_, cIdx) => cIdx !== contributorIdx);
        return {
          ...info,
          contributors: contributors.length ? contributors : [{ role: 'artist', name: '' }],
        };
      })
    );
  };

  const allAudioUploadsReady =
    tracks.length > 0 &&
    tracks.every(
      (_, idx) => !trackUploading[idx] && !analysisLoading[idx] && Boolean(audioUploadedUrls[idx])
    );

  const handleApplyTrackInfoToAll = (idx: number) => {
    const source = trackInfos[idx];
    if (!source) return;
    if (tracks.length < 2 || !allAudioUploadsReady || applyingTrackInfoToAll) return;
    setApplyingTrackInfoToAll(true);
    const shareable = cloneTrackInfo(source);
    delete (shareable as Partial<TrackInfo>).title;
    delete (shareable as Partial<TrackInfo>).originalReleaseDate;
    delete (shareable as Partial<TrackInfo>).artist;
    delete (shareable as Partial<TrackInfo>).featuring;
    delete (shareable as Partial<TrackInfo>).isrc;
    delete (shareable as Partial<TrackInfo>).upc;
    delete (shareable as Partial<TrackInfo>).explicit;

    window.setTimeout(() => {
      setTrackInfos(prev => {
        const targetLength = Math.max(tracks.length, prev.length);
        return Array.from({ length: targetLength }, (_, i) => {
          const info =
            prev[i] ||
            ({
              ...createDefaultTrackInfo(),
              trackNumber: i + 1,
            } as TrackInfo);
          return i === idx ? info : { ...info, ...cloneTrackInfo(shareable) };
        });
      });
      toast.success('Applied to all tracks');
      setApplyingTrackInfoToAll(false);
    }, 1200);
  };

  // Validation: all required fields for all tracks
  const selectedReleaseTypeConfig = releaseTypes.find(t => t.value === releaseType);
  const minTracksRequired = selectedReleaseTypeConfig?.minTracks ?? 1;
  const maxTracksAllowed = selectedReleaseTypeConfig?.maxTracks ?? 50;
  const todayInputValue = getLocalDateInputValue();

  const trackHasRequiredContributor = (info: TrackInfo, role: ContributorRole) =>
    info.contributors.some(c => c.role === role && c.name.trim());

  const getTrackInfoIssues = () => {
    const issues: Array<{ trackIndex: number | null; message: string }> = [];

    if (tracks.length < minTracksRequired) {
      issues.push({
        trackIndex: null,
        message: `Add at least ${minTracksRequired} track${minTracksRequired === 1 ? '' : 's'} for ${selectedReleaseTypeConfig?.label || 'this release type'}.`,
      });
    }
    if (tracks.length > maxTracksAllowed) {
      issues.push({
        trackIndex: null,
        message: `Use no more than ${maxTracksAllowed} track${maxTracksAllowed === 1 ? '' : 's'} for ${selectedReleaseTypeConfig?.label || 'this release type'}.`,
      });
    }

    tracks.forEach((_, idx) => {
      const info = trackInfos[idx];
      const label = `Track ${idx + 1}`;
      if (!info) {
        issues.push({ trackIndex: idx, message: `${label}: metadata is not ready yet.` });
        return;
      }
      if (!info.title.trim())
        issues.push({ trackIndex: idx, message: `${label}: track title is required.` });
      if (!trackHasRequiredContributor(info, 'artist'))
        issues.push({ trackIndex: idx, message: `${label}: add at least one Artist contributor.` });
      if (!trackHasRequiredContributor(info, 'composer'))
        issues.push({
          trackIndex: idx,
          message: `${label}: add at least one Composer contributor.`,
        });
      if (!trackHasRequiredContributor(info, 'lyricist'))
        issues.push({
          trackIndex: idx,
          message: `${label}: add at least one Lyricist contributor.`,
        });
      if (!info.metadataLanguage)
        issues.push({ trackIndex: idx, message: `${label}: metadata language is required.` });
      if (!(info.audioLanguage || info.language))
        issues.push({ trackIndex: idx, message: `${label}: audio language is required.` });
      if (!info.genre) issues.push({ trackIndex: idx, message: `${label}: genre is required.` });
      if (!info.recordingYear)
        issues.push({ trackIndex: idx, message: `${label}: recording year is required.` });
      if (!info.copyrightC.trim())
        issues.push({ trackIndex: idx, message: `${label}: C-line name is required.` });
      if (!info.copyrightCYear)
        issues.push({ trackIndex: idx, message: `${label}: C-line year is required.` });
      if (!info.copyrightP.trim())
        issues.push({ trackIndex: idx, message: `${label}: P-line name is required.` });
      if (!info.copyrightPYear)
        issues.push({ trackIndex: idx, message: `${label}: P-line year is required.` });
    });

    if (!releaseDate.trim()) {
      issues.push({ trackIndex: selectedTrackIdx, message: 'Digital release date is required.' });
    } else if (releaseDate < todayInputValue) {
      issues.push({
        trackIndex: selectedTrackIdx,
        message: 'Digital release date cannot be in the past.',
      });
    }

    return issues;
  };

  const trackInfoIssues = getTrackInfoIssues();
  const selectedTrackMissingArtist =
    trackValidationAttempted &&
    Boolean(trackInfos[selectedTrackIdx]) &&
    !trackHasRequiredContributor(trackInfos[selectedTrackIdx], 'artist');
  const selectedTrackMissingComposer =
    trackValidationAttempted &&
    Boolean(trackInfos[selectedTrackIdx]) &&
    !trackHasRequiredContributor(trackInfos[selectedTrackIdx], 'composer');
  const selectedTrackMissingLyricist =
    trackValidationAttempted &&
    Boolean(trackInfos[selectedTrackIdx]) &&
    !trackHasRequiredContributor(trackInfos[selectedTrackIdx], 'lyricist');

  const isTrackInfoListValid =
    tracks.length >= minTracksRequired &&
    tracks.length <= maxTracksAllowed &&
    tracks.every((_, idx) => {
      const info = trackInfos[idx];
      if (!info) return false;
      return (
        info.title.trim() &&
        trackHasRequiredContributor(info, 'artist') &&
        trackHasRequiredContributor(info, 'composer') &&
        trackHasRequiredContributor(info, 'lyricist') &&
        info.metadataLanguage &&
        (info.audioLanguage || info.language) &&
        info.genre &&
        info.recordingYear &&
        info.copyrightC.trim() &&
        info.copyrightCYear &&
        info.copyrightP.trim() &&
        info.copyrightPYear
      );
    }) &&
    releaseDate.trim() &&
    releaseDate >= todayInputValue;

  const handleTracksInfoContinue = () => {
    setTrackValidationAttempted(true);
    const issues = getTrackInfoIssues();
    if (issues.length) {
      const firstTrackIssue = issues.find(issue => typeof issue.trackIndex === 'number');
      if (typeof firstTrackIssue?.trackIndex === 'number') {
        setSelectedTrackIdx(firstTrackIssue.trackIndex);
      }
      return;
    }
    handleNext();
  };

  // All useEffect hooks
  // Set mounted state to true after component mounts
  useEffect(() => {
    setMounted(true);
    const search = new URLSearchParams(window.location.search);
    setEditReleaseId(search.get('editReleaseId') || '');
    const requestedDraftId = search.get('draft');
    setReleaseDraftId(
      requestedDraftId && requestedDraftId !== '1' ? requestedDraftId : createReleaseDraftId()
    );
    return () => {
      acrCloudPollRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!mounted || releaseDraftRestoredRef.current || typeof window === 'undefined') return;
    if (editReleaseId) {
      releaseDraftRestoredRef.current = true;
      setReleaseDraftReady(true);
      return;
    }

    const requestedDraftId = new URLSearchParams(window.location.search).get('draft');
    const shouldRestoreDraft = Boolean(requestedDraftId);
    if (!shouldRestoreDraft) {
      releaseDraftRestoredRef.current = true;
      setReleaseDraftReady(true);
      return;
    }

    releaseDraftRestoredRef.current = true;

    const applyDraft = (draft: any) => {
      const nextDraftId =
        String(draft.draftId || (requestedDraftId !== '1' ? requestedDraftId : '') || '').trim() ||
        createReleaseDraftId();
      setReleaseDraftId(nextDraftId);
      releaseDraftCreatedAtRef.current =
        draft.createdAt || draft.updatedAt || releaseDraftCreatedAtRef.current;
      setActiveStep(Number(draft.activeStep || 0));
      setReleaseType((draft.releaseType || 'single') as ReleaseType);
      setReleaseTitle(draft.releaseTitle || '');
      setLabel(draft.label || '');
      setUpc(draft.upc || '');
      setAutoGenerateCodes(draft.autoGenerateCodes !== false);
      setAutoGenerateIsrcs(draft.autoGenerateIsrcs !== false);
      setReleaseDate(draft.releaseDate || '');
      setOriginalReleaseDate(draft.originalReleaseDate || '');
      setArtworkUploadedUrl(draft.artworkUploadedUrl || null);
      setArtworkUploadedFilename(draft.artworkUploadedFilename || null);
      setArtworkPreview(draft.artworkUploadedUrl || null);
      setTerritoryCountries(
        Array.isArray(draft.territoryCountries) ? draft.territoryCountries : []
      );
      setTerritoryMode(draft.territoryMode || 'allowed');
      setRightsType(draft.rightsType || 'exclusive');
      setRightsDescription(draft.rightsDescription || '');
      setSelectedDSPs(Array.isArray(draft.selectedDSPs) ? draft.selectedDSPs : []);
      setReleaseWorldwide(Boolean(draft.releaseWorldwide));
      setDistributionTermsAccepted(Boolean(draft.distributionTermsAccepted));
      setSocialDistributionTermsAccepted(Boolean(draft.socialDistributionTermsAccepted));
      setSummaryDeclarationAccepted(Boolean(draft.summaryDeclarationAccepted));

      const nextTrackInfos = Array.isArray(draft.trackInfos)
        ? draft.trackInfos.map((track: TrackInfo) => ({
            ...track,
            contributors: ensureRequiredContributorRows(
              Array.isArray(track.contributors) ? track.contributors : []
            ),
          }))
        : [];
      const nextAudioUrls = Array.isArray(draft.audioUploadedUrls) ? draft.audioUploadedUrls : [];
      const nextAudioFiles = Array.isArray(draft.audioUploadedFilenames)
        ? draft.audioUploadedFilenames
        : [];
      const trackCount = Math.max(
        nextTrackInfos.length,
        nextAudioUrls.length,
        nextAudioFiles.length
      );
      setTrackInfos(nextTrackInfos.length ? nextTrackInfos : []);
      setTracks(
        Array.from(
          { length: trackCount },
          (_, index) =>
            new File(
              [],
              nextAudioFiles[index] || nextTrackInfos[index]?.title || `track-${index + 1}.mp3`,
              { type: 'audio/mpeg' }
            )
        )
      );
      setAudioUploadedUrls(resizeList(nextAudioUrls, trackCount, null));
      setAudioUploadedFilenames(resizeList(nextAudioFiles, trackCount, null));
      setAudioAcrCloudStatuses(
        resizeList(
          Array.isArray(draft.audioAcrCloudStatuses) ? draft.audioAcrCloudStatuses : [],
          trackCount,
          null
        )
      );
      setAudioUploadPct(
        Array.from({ length: trackCount }, (_, index) => (nextAudioUrls[index] ? 100 : 0))
      );
      setTrackPreviewUrls(resizeList(nextAudioUrls, trackCount, null));
      setTrackUploading(Array.from({ length: trackCount }, () => false));
      setAnalysisLoading(Array.from({ length: trackCount }, () => false));
      toast.info('Recovered your draft release.');
    };

    const loadDraft = async () => {
      try {
        const endpoint =
          requestedDraftId && requestedDraftId !== '1'
            ? `/api/releases/draft?id=${encodeURIComponent(requestedDraftId)}`
            : '/api/releases/draft';
        const response = await fetch(endpoint, { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.success && payload?.draft?.status === 'draft') {
          applyDraft(payload.draft);
          return;
        }

        const candidateKeys = [
          `${RELEASE_DRAFT_PREFIX}${releaseDraftUserId || 'anonymous'}.${requestedDraftId}`,
          releaseDraftKey,
          RELEASE_DRAFT_BACKUP_KEY,
          `${RELEASE_DRAFT_PREFIX}anonymous`,
        ];
        const draftEntry = candidateKeys
          .map(key => ({ key, raw: localStorage.getItem(key) }))
          .find(entry => Boolean(entry.raw));

        if (!draftEntry?.raw) return;

        try {
          const draft = JSON.parse(draftEntry.raw);
          if (draft?.status !== 'draft') return;
          applyDraft(draft);
          if (releaseDraftUserId) void saveReleaseDraftToServer(draft);
        } catch {
          localStorage.removeItem(draftEntry.key);
        }
      } finally {
        setReleaseDraftReady(true);
      }
    };

    void loadDraft();
  }, [editReleaseId, mounted, releaseDraftKey, releaseDraftUserId]);

  useEffect(() => {
    if (
      !mounted ||
      !releaseDraftReady ||
      !releaseDraftId ||
      editReleaseId ||
      submitState === 'success' ||
      typeof window === 'undefined'
    )
      return;

    const draft = buildReleaseDraft();
    if (!releaseDraftHasData(draft)) return;

    persistReleaseDraftLocally(draft);

    if (releaseDraftServerSaveRef.current) clearTimeout(releaseDraftServerSaveRef.current);
    releaseDraftServerSaveRef.current = setTimeout(() => {
      void saveReleaseDraftToServer(draft);
    }, 450);

    return () => {
      if (releaseDraftServerSaveRef.current) clearTimeout(releaseDraftServerSaveRef.current);
    };
  }, [
    activeStep,
    artworkUploadedFilename,
    artworkUploadedUrl,
    audioAcrCloudStatuses,
    audioUploadedFilenames,
    audioUploadedUrls,
    autoGenerateCodes,
    autoGenerateIsrcs,
    distributionTermsAccepted,
    editReleaseId,
    label,
    mounted,
    originalReleaseDate,
    releaseDate,
    releaseDraftKey,
    releaseDraftId,
    releaseDraftReady,
    releaseDraftUserId,
    releaseTitle,
    releaseType,
    releaseWorldwide,
    rightsDescription,
    rightsType,
    selectedDSPs,
    socialDistributionTermsAccepted,
    summaryDeclarationAccepted,
    submitState,
    territoryCountries,
    territoryMode,
    trackInfos,
    upc,
  ]);

  useEffect(() => {
    if (
      !mounted ||
      !releaseDraftId ||
      editReleaseId ||
      submitState === 'success' ||
      typeof window === 'undefined'
    )
      return;

    const persistBeforeExit = () => {
      if (submitSucceededRef.current) return;
      const draft = buildReleaseDraft();
      if (!releaseDraftHasData(draft)) return;
      persistReleaseDraftLocally(draft);
      void saveReleaseDraftToServer(draft, true);
    };

    const persistWhenHidden = () => {
      if (document.visibilityState === 'hidden') persistBeforeExit();
    };

    window.addEventListener('pagehide', persistBeforeExit);
    document.addEventListener('visibilitychange', persistWhenHidden);

    return () => {
      persistBeforeExit();
      window.removeEventListener('pagehide', persistBeforeExit);
      document.removeEventListener('visibilitychange', persistWhenHidden);
    };
  }, [
    activeStep,
    artworkUploadedFilename,
    artworkUploadedUrl,
    audioAcrCloudStatuses,
    audioUploadedFilenames,
    audioUploadedUrls,
    autoGenerateCodes,
    autoGenerateIsrcs,
    distributionTermsAccepted,
    editReleaseId,
    label,
    mounted,
    originalReleaseDate,
    releaseDate,
    releaseDraftKey,
    releaseDraftId,
    releaseDraftUserId,
    releaseTitle,
    releaseType,
    releaseWorldwide,
    rightsDescription,
    rightsType,
    selectedDSPs,
    socialDistributionTermsAccepted,
    summaryDeclarationAccepted,
    submitState,
    territoryCountries,
    territoryMode,
    trackInfos,
    upc,
  ]);

  useEffect(() => {
    const loadAllowed = async () => {
      try {
        setPlatformAccessError('');
        const res = await fetch('/api/platforms', { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success)
          throw new Error(json?.message || 'Failed to load platform access');
        const keys = Array.isArray(json?.data?.dspKeys)
          ? (json.data.dspKeys as DspKey[])
          : ALL_DSP_KEYS;
        setAllowedDspKeys(keys);
      } catch (error) {
        setPlatformAccessError(
          error instanceof Error ? error.message : 'Failed to load platform access'
        );
        setAllowedDspKeys(ALL_DSP_KEYS);
      }
    };
    void loadAllowed();
  }, []);

  useEffect(() => {
    const allow = new Set(visibleDSPs.map((d: DspItem) => d.key));
    setSelectedDSPs(prev => {
      const filtered = prev.filter(k => allow.has(k));
      return filtered.length ? filtered : visibleDSPs.map((d: DspItem) => d.key);
    });
  }, [visibleDSPs]);

  // Keep analysis / upload state arrays in sync with tracks array length
  useEffect(() => {
    const len = tracks.length;
    setAnalysisResults(arr => resizeList(arr, len, null));
    setAnalysisLoading(arr => resizeList(arr, len, false));
    setAnalysisErrors(arr => resizeList(arr, len, null));
    setTrackUploading(arr => resizeList(arr, len, false));
    setAudioUploadPct(arr => resizeList(arr, len, 0));
    setAcrCloudProgressPct(arr => resizeList(arr, len, 0));
  }, [tracks.length]);

  // When release type changes, only enforce max track count (no empty placeholder slots)
  useEffect(() => {
    const selectedType = releaseTypes.find(t => t.value === releaseType);
    if (!selectedType) return;
    setTracks(prev =>
      prev.length > selectedType.maxTracks ? prev.slice(0, selectedType.maxTracks) : prev
    );
  }, [releaseType]);

  // Create preview for artwork
  useEffect(() => {
    if (!artworkFile) {
      setArtworkPreview(null);
      setArtworkError(null);
      setArtworkValidating(false);
      setArtworkUploadedUrl(null);
      setArtworkUploadedFilename(null);
      return;
    }

    // Validate type
    setArtworkValidating(true);
    setArtworkUploadedUrl(null);
    setArtworkUploadedFilename(null);
    if (!['image/jpeg', 'image/png'].includes(artworkFile.type)) {
      setArtworkError('Artwork must be a JPG or PNG image.');
      setArtworkPreview(null);
      setArtworkValidating(false);
      return;
    }
    // Validate size
    if (artworkFile.size > 10 * 1024 * 1024) {
      setArtworkError('Artwork must be less than or equal to 10MB.');
      setArtworkPreview(null);
      setArtworkValidating(false);
      return;
    }
    // Validate dimensions (must be exactly 3000x3000 and square)
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(artworkFile);
    img.onload = () => {
      if (img.width !== 3000 || img.height !== 3000) {
        setArtworkError('Artwork must be exactly 3000x3000 pixels.');
        setArtworkPreview(null);
      } else {
        setArtworkError(null);
        setArtworkPreview(objectUrl);
      }
      setArtworkValidating(false);
      // Do NOT revoke objectUrl here! Only on unmount.
    };
    img.onerror = () => {
      setArtworkError('Invalid image file.');
      setArtworkPreview(null);
      setArtworkValidating(false);
      // Do NOT revoke objectUrl here! Only on unmount.
    };
    img.src = objectUrl;
    // Free memory when component unmounts
    return () => URL.revokeObjectURL(objectUrl);
  }, [artworkFile]);

  // Keep preview URLs in sync with selected track files
  useEffect(() => {
    // Revoke old URLs
    return () => {
      trackPreviewUrls.forEach(url => {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTrackPreviewUrls(prev => {
      // Revoke only local object URLs. Uploaded server URLs must survive draft restore.
      prev.forEach((url, i) => {
        const uploadedUrl = audioUploadedUrls[i];
        if (url?.startsWith('blob:') && (!tracks[i] || i >= tracks.length || uploadedUrl)) {
          URL.revokeObjectURL(url);
        }
      });
      const next = tracks.map((f, i) => {
        if (audioUploadedUrls[i]) return audioUploadedUrls[i];
        if (!f) return null;
        return prev[i]?.startsWith('blob:') ? prev[i] : URL.createObjectURL(f);
      });
      return next;
    });
  }, [audioUploadedUrls, tracks]);

  // Keep uploaded audio arrays in sync with tracks length
  useEffect(() => {
    setAudioUploadedUrls(arr => resizeList(arr, tracks.length, null));
    setAudioUploadedFilenames(arr => resizeList(arr, tracks.length, null));
    setAudioAcrCloudStatuses(arr => resizeList(arr, tracks.length, null));
  }, [tracks.length]);

  // Safe access to auth context
  const { user } = auth || { user: null };

  // File validation for tracks
  const formatFileSizeMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

  const validateTrackFile = (file: File | null) => {
    if (!file) return 'No file selected';
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedAudioExtensions.includes(extension))
      return `Invalid audio format. Allowed: ${allowedAudioExtensions.join(', ')}`;
    if (file.size > maxUploadSizeMb * 1024 * 1024)
      return `${file.name} is ${formatFileSizeMb(file.size)}. Admin upload limit is ${maxUploadSizeMb}MB.`;
    return '';
  };

  const getValidTrackFiles = (fileList: FileList, maxCount: number) => {
    const accepted: File[] = [];
    const rejectedMessages: string[] = [];

    Array.from(fileList).forEach(file => {
      const error = validateTrackFile(file);
      if (error) {
        rejectedMessages.push(error);
        return;
      }
      accepted.push(file);
    });

    if (rejectedMessages.length) {
      toast.error(
        rejectedMessages.length === 1
          ? rejectedMessages[0]
          : `${rejectedMessages.length} tracks skipped. ${rejectedMessages[0]}`
      );
    }

    if (accepted.length > maxCount) {
      toast.info(
        `Only ${maxCount} track${maxCount === 1 ? '' : 's'} allowed for this release type.`
      );
    }

    return accepted.slice(0, maxCount);
  };

  const handleArtworkDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setArtworkDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (event.dataTransfer.files.length > 1) {
      toast.info('Only one artwork file can be uploaded.');
    }
    setArtworkFile(file);
  };

  const handleArtworkDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setArtworkDragActive(true);
  };

  const handleArtworkDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setArtworkDragActive(false);
  };

  const handleAppendTracksClick = () => {
    appendTracksInputRef.current?.click();
  };

  const handleRemoveTrack = (index: number) => {
    delete acrCloudPollRef.current[index];
    setTracks(prev => {
      const next = prev.filter((_, i) => i !== index);
      setSelectedTrackIdx(si => (next.length === 0 ? 0 : Math.min(si, next.length - 1)));
      return next;
    });
    setAnalysisResults(prev => prev.filter((_, i) => i !== index));
    setAnalysisLoading(prev => prev.filter((_, i) => i !== index));
    setAnalysisErrors(prev => prev.filter((_, i) => i !== index));
    setTrackUploading(prev => prev.filter((_, i) => i !== index));
    setAudioUploadPct(prev => prev.filter((_, i) => i !== index));
    setAcrCloudProgressPct(prev => prev.filter((_, i) => i !== index));
    setAudioUploadedUrls(prev => prev.filter((_, i) => i !== index));
    setAudioUploadedFilenames(prev => prev.filter((_, i) => i !== index));
    setAudioAcrCloudStatuses(prev => prev.filter((_, i) => i !== index));
  };

  /** Replace audio for an existing row, or remove row when `file` is null. */
  const handleTrackFileChange = async (index: number, file: File | null) => {
    if (!file) {
      handleRemoveTrack(index);
      return;
    }

    const err = validateTrackFile(file);
    if (err) {
      toast.error(err);
      return;
    }

    setTracks(prev => {
      const next = [...prev];
      if (index < next.length) next[index] = file;
      return next;
    });
    ensureTrackStateLength(Math.max(tracks.length, index + 1));

    setAnalysisResults(prev => prev.map((r, i) => (i === index ? null : r)));
    setAnalysisErrors(prev => prev.map((e, i) => (i === index ? null : e)));
    setTrackUploading(prev => prev.map((u, i) => (i === index ? true : u)));
    setAudioUploadPct(prev => prev.map((p, i) => (i === index ? 1 : p)));
    setAudioUploadedUrls(prev => prev.map((url, i) => (i === index ? null : url)));
    setAudioUploadedFilenames(prev => prev.map((name, i) => (i === index ? null : name)));
    setAcrCloudPending(index);
    delete acrCloudPollRef.current[index];
    setTrackTitleFromFile(index, file);
    setAnalysisLoading(prev => prev.map((l, i) => (i === index ? true : l)));

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/audio/analyze', { method: 'POST', body: formData });
      if (!res.ok) {
        let errMsg = 'Analysis failed';
        try {
          const errBody = await res.json();
          errMsg = errBody?.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      setAnalysisResults(prev => prev.map((r, i) => (i === index ? data : r)));
      const dur = data?.duration;
      if (typeof dur === 'number' || typeof dur === 'string') {
        const durStr = formatDuration(dur);
        setTrackInfos(prev =>
          prev.map((info, i) => (i === index ? { ...info, duration: durStr } : info))
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error analyzing audio';
      setAnalysisErrors(prev => prev.map((e, i) => (i === index ? msg : e)));
    } finally {
      setAnalysisLoading(prev => prev.map((l, i) => (i === index ? false : l)));
    }

    try {
      const { url, filename, acrCloud } = await uploadAudioToServer(file, pct =>
        setAudioUploadPct(prev => prev.map((p, i) => (i === index ? pct : p)))
      );
      setAudioUploadedUrls(prev => prev.map((u, i) => (i === index ? url : u)));
      setAudioUploadedFilenames(prev => prev.map((u, i) => (i === index ? filename : u)));
      setAudioAcrCloudStatuses(prev =>
        prev.map((status, i) =>
          i === index
            ? acrCloud || { state: 'error', lastError: 'Missing ACRCloud response' }
            : status
        )
      );
      setAudioUploadPct(prev => prev.map((p, i) => (i === index ? 100 : p)));
      setAcrCloudProgressPct(prev =>
        prev.map((p, i) =>
          i === index ? (getAcrCloudState(acrCloud) === 'pending' ? Math.max(p, 25) : 100) : p
        )
      );
      if (acrCloud?.fileId && getAcrCloudState(acrCloud) === 'pending') {
        void pollAcrCloudStatus(index, acrCloud.fileId);
      }
    } catch (e) {
      console.error('Audio upload failed:', e);
      setAudioAcrCloudStatuses(prev =>
        prev.map((status, i) =>
          i === index
            ? { state: 'error', lastError: e instanceof Error ? e.message : 'Audio upload failed' }
            : status
        )
      );
      setAcrCloudProgressPct(prev => prev.map((p, i) => (i === index ? 100 : p)));
    }
    setTrackUploading(prev => prev.map((u, i) => (i === index ? false : u)));
  };

  const handleAppendTracksSelected = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const selectedType = releaseTypes.find(t => t.value === releaseType);
    const max = selectedType?.maxTracks ?? 50;
    const room = max - tracks.length;
    if (room <= 0) return;

    const incoming = getValidTrackFiles(fileList, room);

    if (!incoming.length) return;

    const startIdx = tracks.length;
    setTracks(prev => [...prev, ...incoming]);
    ensureTrackStateLength(startIdx + incoming.length);
    if (appendTracksInputRef.current) appendTracksInputRef.current.value = '';

    for (let i = 0; i < incoming.length; i++) {
      await analyzeAndUploadForIndex(startIdx + i, incoming[i]);
    }
  };

  // Handle track analysis
  const handleAnalyzeTrack = async (index: number) => {
    const file = tracks[index];
    if (!file) return;

    // Update loading state for this track
    setAnalysisLoading(prev => prev.map((loading, i) => (i === index ? true : loading)));
    setAnalysisErrors(prev => prev.map((error, i) => (i === index ? null : error)));

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/audio/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let errMsg = 'Analysis failed';
        try {
          const errBody = await res.json();
          errMsg = errBody?.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const data = await res.json();
      setAnalysisResults(prev => prev.map((result, i) => (i === index ? data : result)));
    } catch (err: any) {
      setAnalysisErrors(prev =>
        prev.map((error, i) => (i === index ? err.message || 'Error analyzing audio' : error))
      );
    } finally {
      setAnalysisLoading(prev => prev.map((loading, i) => (i === index ? false : loading)));
    }
  };

  const handleReleaseTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setReleaseType(event.target.value as ReleaseType);
  };

  const handleNext = () => {
    setActiveStep(prevActiveStep => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep(prevActiveStep => prevActiveStep - 1);
  };

  const isWizardStepComplete = (index: number) => {
    switch (index) {
      case 0:
        return Boolean(releaseTitle.trim());
      case 1:
        return Boolean(artworkUploadedUrl);
      case 2:
        return Boolean(isTrackInfoListValid && allAudioUploadsReady);
      case 3:
        return isDistributionValid;
      case 4:
        return Boolean(rightsType) && territoryCountries.length > 0;
      case 5:
        return summaryDeclarationAccepted;
      default:
        return false;
    }
  };

  const canNavigateToStep = (targetIndex: number) => {
    if (targetIndex <= activeStep) return true;
    for (let index = activeStep; index < targetIndex; index += 1) {
      if (!isWizardStepComplete(index)) return false;
    }
    return true;
  };

  const handleStepNavigation = (targetIndex: number, label: string) => {
    if (!canNavigateToStep(targetIndex)) {
      toast.error(`Complete ${steps[activeStep]} before opening ${label}.`);
      return;
    }
    setActiveStep(targetIndex);
  };

  // Helper: analyze and upload one track (reuses same logic as handleTrackFileChange)
  const analyzeAndUploadForIndex = async (index: number, file: File) => {
    // Set file and reset states
    ensureTrackStateLength(Math.max(tracks.length, index + 1));
    setTracks(prev => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
    setAnalysisResults(prev => prev.map((r, i) => (i === index ? null : r)));
    setAnalysisErrors(prev => prev.map((e, i) => (i === index ? null : e)));
    setTrackUploading(prev => prev.map((u, i) => (i === index ? true : u)));
    setAudioUploadPct(prev => prev.map((p, i) => (i === index ? 1 : p)));
    setAudioUploadedUrls(prev => prev.map((url, i) => (i === index ? null : url)));
    setAudioUploadedFilenames(prev => prev.map((name, i) => (i === index ? null : name)));
    setAcrCloudPending(index);
    delete acrCloudPollRef.current[index];

    // Autofill title and analyze
    setTrackTitleFromFile(index, file);
    setAnalysisLoading(prev => prev.map((l, i) => (i === index ? true : l)));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/audio/analyze', { method: 'POST', body: formData });
      if (!res.ok) {
        let errMsg = 'Analysis failed';
        try {
          const errBody = await res.json();
          errMsg = errBody?.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      setAnalysisResults(prev => prev.map((r, i) => (i === index ? data : r)));
      const dur = data?.duration;
      if (typeof dur === 'number' || typeof dur === 'string') {
        const durStr = formatDuration(dur);
        setTrackInfos(prev =>
          prev.map((info, i) => (i === index ? { ...info, duration: durStr } : info))
        );
      }
    } catch (err: any) {
      setAnalysisErrors(prev =>
        prev.map((e, i) => (i === index ? err?.message || 'Error analyzing audio' : e))
      );
    } finally {
      setAnalysisLoading(prev => prev.map((l, i) => (i === index ? false : l)));
    }

    try {
      const { url, filename, acrCloud } = await uploadAudioToServer(file, pct =>
        setAudioUploadPct(prev => prev.map((p, i) => (i === index ? pct : p)))
      );
      setAudioUploadedUrls(prev => prev.map((u, i) => (i === index ? url : u)));
      setAudioUploadedFilenames(prev => prev.map((u, i) => (i === index ? filename : u)));
      setAudioAcrCloudStatuses(prev =>
        prev.map((status, i) =>
          i === index
            ? acrCloud || { state: 'error', lastError: 'Missing ACRCloud response' }
            : status
        )
      );
      setAudioUploadPct(prev => prev.map((p, i) => (i === index ? 100 : p)));
      setAcrCloudProgressPct(prev =>
        prev.map((p, i) =>
          i === index ? (getAcrCloudState(acrCloud) === 'pending' ? Math.max(p, 25) : 100) : p
        )
      );
      if (acrCloud?.fileId && getAcrCloudState(acrCloud) === 'pending') {
        void pollAcrCloudStatus(index, acrCloud.fileId);
      }
    } catch (e) {
      console.error('Audio upload failed:', e);
      setAudioAcrCloudStatuses(prev =>
        prev.map((status, i) =>
          i === index
            ? { state: 'error', lastError: e instanceof Error ? e.message : 'Audio upload failed' }
            : status
        )
      );
      setAcrCloudProgressPct(prev => prev.map((p, i) => (i === index ? 100 : p)));
    } finally {
      setTrackUploading(prev => prev.map((u, i) => (i === index ? false : u)));
    }
  };

  const pollAcrCloudStatus = async (index: number, fileId: string) => {
    acrCloudPollRef.current[index] = fileId;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (acrCloudPollRef.current[index] !== fileId) return;
      setAcrCloudProgressPct(prev =>
        prev.map((pct, i) => (i === index ? Math.max(pct, Math.min(90, 25 + attempt * 2)) : pct))
      );

      await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 2500 : 4000));
      if (acrCloudPollRef.current[index] !== fileId) return;

      try {
        const nextStatus = await fetchAcrCloudScanResult(fileId);
        if (acrCloudPollRef.current[index] !== fileId) return;

        setAudioAcrCloudStatuses(prev =>
          prev.map((status, i) => (i === index ? { ...(status || {}), ...nextStatus } : status))
        );
        setAcrCloudProgressPct(prev =>
          prev.map((pct, i) =>
            i === index
              ? getAcrCloudState(nextStatus) === 'pending'
                ? Math.max(pct, 35)
                : 100
              : pct
          )
        );

        if (getAcrCloudState(nextStatus) !== 'pending') {
          delete acrCloudPollRef.current[index];
          return;
        }
      } catch (error) {
        if (attempt >= 5) {
          setAudioAcrCloudStatuses(prev =>
            prev.map((status, i) =>
              i === index
                ? {
                    ...(status || {}),
                    state: 'error',
                    lastError:
                      error instanceof Error ? error.message : 'Failed to refresh ACRCloud status',
                  }
                : status
            )
          );
          setAcrCloudProgressPct(prev => prev.map((pct, i) => (i === index ? 100 : pct)));
          delete acrCloudPollRef.current[index];
          return;
        }
      }
    }
  };

  const handleMultiTrackFiles = async (fileList: FileList) => {
    const selectedType = releaseTypes.find(t => t.value === releaseType);
    const max = selectedType?.maxTracks ?? 50;
    const files = getValidTrackFiles(fileList, max);

    if (!files.length) return;

    setTracks(files);
    ensureTrackStateLength(files.length);
    setSelectedTrackIdx(0);

    for (let i = 0; i < files.length; i++) {
      await analyzeAndUploadForIndex(i, files[i]);
    }
  };

  const handleAudioDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAudioDragActive(false);
    const files = event.dataTransfer.files;
    if (!files?.length) return;

    const selectedType = releaseTypes.find(t => t.value === releaseType);
    const max = selectedType?.maxTracks ?? 50;
    if (tracks.length > 0 && tracks.length < max) {
      void handleAppendTracksSelected(files);
      return;
    }

    void handleMultiTrackFiles(files);
  };

  const handleAudioDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAudioDragActive(true);
  };

  const handleAudioDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAudioDragActive(false);
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Box>
            <Typography variant="h5" gutterBottom fontWeight="bold">
              Select Your Release Type
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Choose the type of release you want to distribute
            </Typography>

            <FormControl component="fieldset" sx={{ width: '100%' }}>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', md: 'row' },
                  flexWrap: 'wrap',
                  gap: { xs: 2.5, md: 4 },
                  mt: 1,
                  width: '100%',
                }}
              >
                {releaseTypes.map(type => (
                  <Box
                    key={type.value}
                    sx={{
                      flex: { md: '1 1 0' },
                      minWidth: { xs: '100%', md: 0 },
                      width: { xs: '100%' },
                    }}
                  >
                    <Card
                      sx={{
                        height: '100%',
                        cursor: 'pointer',
                        position: 'relative',
                        borderRadius: 2,
                        transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                        border: releaseType === type.value ? 2 : 1,
                        borderColor: releaseType === type.value ? 'primary.main' : 'divider',
                        boxShadow:
                          releaseType === type.value
                            ? theme =>
                                theme.palette.mode === 'dark'
                                  ? '0 8px 32px rgba(25,118,210,0.2)'
                                  : '0 8px 28px rgba(25,118,210,0.12)'
                            : 'none',
                        '&:hover': {
                          boxShadow: theme =>
                            theme.palette.mode === 'dark'
                              ? '0 12px 40px rgba(0,0,0,0.35)'
                              : '0 12px 36px rgba(15, 23, 42, 0.1)',
                        },
                      }}
                      onClick={() => setReleaseType(type.value)}
                    >
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          zIndex: 1,
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <Radio
                          checked={releaseType === type.value}
                          onChange={handleReleaseTypeChange}
                          value={type.value}
                          name="release-type"
                          sx={{ p: 0.5 }}
                        />
                      </Box>
                      <CardContent
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          p: 3,
                          pt: 4,
                        }}
                      >
                        <Box sx={{ color: 'primary.main', mb: 2 }}>{type.icon}</Box>
                        <Typography variant="h6" component="h3" fontWeight="bold" gutterBottom>
                          {type.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" align="center">
                          {type.description}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Box>
                ))}
              </Box>
            </FormControl>

            <Box sx={{ mt: 4, mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                Release Details
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1">Release Type:</Typography>
                <Typography variant="body1" fontWeight="bold">
                  {releaseTypes.find(t => t.value === releaseType)?.label}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="body1">Track Limit:</Typography>
                <Typography variant="body1" fontWeight="bold">
                  {(() => {
                    const selected = releaseTypes.find(t => t.value === releaseType);
                    if (!selected) return '';
                    return selected.minTracks === selected.maxTracks
                      ? `${selected.maxTracks} track${selected.maxTracks === 1 ? '' : 's'}`
                      : `${selected.minTracks} - ${selected.maxTracks} tracks`;
                  })()}
                </Typography>
              </Box>
              <Grid container spacing={2.5} sx={{ mt: 2.5, maxWidth: 760 }}>
                <Grid xs={12} style={{ marginBottom: '10px' }}>
                  <TextField
                    label="Release Title"
                    fullWidth
                    value={releaseTitle}
                    onChange={e => setReleaseTitle(e.target.value)}
                    required
                    inputProps={{ 'aria-label': 'Release Title' }}
                  />
                </Grid>
                <Grid xs={12} style={{ marginBottom: '10px' }}>
                  <TextField
                    label="Label"
                    fullWidth
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    inputProps={{ 'aria-label': 'Label' }}
                  />
                </Grid>
                <Grid xs={12}>
                  <TextField
                    label="UPC (optional)"
                    fullWidth
                    value={upc}
                    onChange={e => setUpc(e.target.value)}
                    inputProps={{ 'aria-label': 'UPC' }}
                    disabled={autoGenerateCodes}
                    helperText={
                      autoGenerateCodes
                        ? 'System assigns release UPC during submit.'
                        : 'Enter an existing release UPC.'
                    }
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <FormControlLabel
                            sx={{
                              mr: 0,
                              '& .MuiFormControlLabel-label': {
                                fontSize: 12,
                                whiteSpace: 'nowrap',
                              },
                            }}
                            control={
                              <Checkbox
                                size="small"
                                checked={autoGenerateCodes}
                                onChange={e => setAutoGenerateCodes(e.target.checked)}
                              />
                            }
                            label="Auto"
                          />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
              </Grid>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleNext}
                disabled={!releaseTitle.trim()}
                endIcon={<ArrowForward />}
                size="large"
              >
                Continue
              </Button>
            </Box>
          </Box>
        );

      case 1:
        // Artwork Step
        return (
          <Box>
            <Typography variant="h5" gutterBottom fontWeight="bold">
              Artwork
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Upload a square JPG/PNG. Exactly 3000x3000px. Max 10MB.
            </Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid xs={12} md={8} lg={7}>
                <Card
                  sx={{
                    height: '100%',
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    borderRadius: '28px',
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: theme =>
                      theme.palette.mode === 'dark' ? 'none' : '0 22px 56px rgba(15,23,42,0.08)',
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Box
                      onDrop={handleArtworkDrop}
                      onDragOver={handleArtworkDragOver}
                      onDragEnter={handleArtworkDragOver}
                      onDragLeave={handleArtworkDragLeave}
                      sx={{
                        border: '2px dashed',
                        borderColor:
                          artworkDragActive || artworkPreview ? 'primary.main' : 'divider',
                        borderRadius: '22px',
                        p: { xs: 1.5, sm: 2 },
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 1fr) 220px' },
                        alignItems: 'center',
                        gap: { xs: 2, md: 2.5 },
                        minHeight: 360,
                        bgcolor: theme =>
                          artworkDragActive
                            ? theme.palette.mode === 'dark'
                              ? 'rgba(74,108,247,0.14)'
                              : 'rgba(74,108,247,0.08)'
                            : theme.palette.mode === 'dark'
                              ? 'rgba(255,255,255,0.025)'
                              : 'rgba(248,250,252,0.74)',
                        transition: 'border-color 160ms ease, background-color 160ms ease',
                      }}
                    >
                      <Box
                        sx={{
                          width: '100%',
                          maxWidth: 460,
                          aspectRatio: '1 / 1',
                          justifySelf: 'center',
                          bgcolor: theme =>
                            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.055)' : '#eef2f7',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '18px',
                          overflow: 'hidden',
                          border: '1px solid',
                          borderColor: 'divider',
                          boxShadow: artworkPreview
                            ? theme =>
                                theme.palette.mode === 'dark'
                                  ? '0 18px 44px rgba(0,0,0,0.32)'
                                  : '0 18px 44px rgba(15,23,42,0.12)'
                            : 'none',
                        }}
                      >
                        {artworkPreview ? (
                          <Box
                            component="img"
                            src={artworkPreview}
                            alt="Artwork preview"
                            sx={{
                              width: '100%',
                              height: '100%',
                              display: 'block',
                              objectFit: 'cover',
                            }}
                          />
                        ) : (
                          <Album sx={{ fontSize: 56, color: 'text.secondary' }} />
                        )}
                      </Box>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: { xs: 'center', md: 'flex-start' },
                          gap: 1.25,
                        }}
                      >
                        <Typography variant="subtitle1" fontWeight={900}>
                          {artworkUploading
                            ? 'Uploading Artwork'
                            : artworkValidating
                              ? 'Checking Artwork'
                              : artworkPreview
                                ? 'Artwork Ready'
                                : 'Add Cover Artwork'}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ maxWidth: 240, textAlign: { xs: 'center', md: 'left' } }}
                        >
                          Drop artwork here, or choose a file. Preview uses the same square crop
                          stores will receive.
                        </Typography>
                        <input
                          id="artwork-upload"
                          type="file"
                          accept="image/jpeg,image/png"
                          style={{ display: 'none' }}
                          onChange={e => {
                            if (e.target.files && e.target.files[0])
                              setArtworkFile(e.target.files[0]);
                          }}
                        />
                        <label htmlFor="artwork-upload">
                          <Button
                            variant={artworkPreview ? 'contained' : 'outlined'}
                            component="span"
                          >
                            {artworkPreview ? 'Change Image' : 'Select Image'}
                          </Button>
                        </label>
                        {(artworkValidating || artworkUploading) && (
                          <Box sx={{ width: '100%', mt: 2 }}>
                            <LinearProgress variant="indeterminate" />
                            <Typography variant="caption" color="text.secondary">
                              {artworkUploading
                                ? 'Uploading image to storage...'
                                : 'Verifying image dimensions...'}
                            </Typography>
                          </Box>
                        )}
                        {artworkError && (
                          <Typography color="error" sx={{ mt: 1 }}>
                            {artworkError}
                          </Typography>
                        )}
                        {!artworkError && artworkPreview && (
                          <Typography
                            color="success.main"
                            sx={{
                              mt: 1,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              fontWeight: 800,
                            }}
                          >
                            <CheckCircle fontSize="small" /> 3000x3000 verified
                          </Typography>
                        )}
                        <Box sx={{ display: 'grid', gap: 0.5, mt: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            JPG or PNG
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Exactly 3000x3000px
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Max 10MB
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
              <Button onClick={handleBack}>Back</Button>
              <Button
                variant="contained"
                color="primary"
                disabled={
                  !!artworkError || !artworkPreview || artworkValidating || artworkUploading
                }
                onClick={async () => {
                  if (artworkUploadedUrl && !artworkFile) {
                    handleNext();
                    return;
                  }
                  if (!artworkFile || artworkValidating || artworkUploading) return;
                  try {
                    setArtworkUploading(true);
                    const { url, filename } = await uploadArtworkToServer(artworkFile);
                    setArtworkUploadedUrl(url);
                    setArtworkUploadedFilename(filename);
                    handleNext();
                  } catch (e: any) {
                    toast.error(e?.message || 'Failed to upload artwork');
                  } finally {
                    setArtworkUploading(false);
                  }
                }}
              >
                {artworkUploading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={16} color="inherit" />
                    <span>Uploading...</span>
                  </Stack>
                ) : (
                  'Continue'
                )}
              </Button>
            </Box>
          </Box>
        );

      case 2: {
        const selectedTypeLb = releaseTypes.find(t => t.value === releaseType);
        const uploadPctAvg =
          tracks.length > 0
            ? Math.round(
                tracks.reduce((acc, _, i) => acc + (audioUploadPct[i] ?? 0), 0) / tracks.length
              )
            : 0;
        const anyAnalyzing = analysisLoading.some(Boolean);
        const anyUploadingPct = tracks.some((_, i) => {
          const p = audioUploadPct[i] ?? 0;
          return p > 0 && p < 100;
        });
        const showAggBar =
          tracks.length > 0 && (anyAnalyzing || anyUploadingPct || trackUploading.some(Boolean));

        // Tracks & Info
        return (
          <Box>
            <Typography variant="h5" gutterBottom fontWeight={700}>
              Upload Your Track{tracks.length !== 1 ? 's' : ''}
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph sx={{ maxWidth: 720 }}>
              {selectedTypeLb?.label === 'Single' &&
                'Single releases allow 1 track only. Audio card appears below after you select a file.'}
              {selectedTypeLb?.label === 'EP' &&
                `Need ${selectedTypeLb.minTracks}–${selectedTypeLb.maxTracks} tracks. Upload multiple files or add more.`}
              {selectedTypeLb?.label === 'Album' && `Up to ${selectedTypeLb.maxTracks} tracks.`}
            </Typography>
            <Alert
              severity="info"
              icon={<Info />}
              sx={{
                mb: 3,
                borderRadius: 2,
                alignItems: 'center',
                '& .MuiAlert-message': { width: '100%' },
              }}
            >
              <Typography variant="subtitle2" fontWeight={800}>
                File formats and requirements
              </Typography>
              <Typography variant="body2">
                Accepted audio formats: FLAC 44100 Hz 24 bit or WAV 44100 Hz 16 bit
              </Typography>
            </Alert>

            {showAggBar && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2.5,
                  mb: 3,
                  borderRadius: 2,
                  position: 'sticky',
                  top: { xs: 8, md: 12 },
                  zIndex: theme => theme.zIndex.appBar - 1,
                  backdropFilter: 'blur(14px)',
                  bgcolor: theme =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(15,23,42,0.92)'
                      : 'rgba(255,255,255,0.92)',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle2" fontWeight={600}>
                    Overall upload progress
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {anyAnalyzing ? 'Analyzing + uploading…' : `${uploadPctAvg}%`}
                  </Typography>
                </Box>
                <LinearProgress
                  variant={
                    anyAnalyzing || anyUploadingPct
                      ? anyAnalyzing
                        ? 'indeterminate'
                        : 'determinate'
                      : 'determinate'
                  }
                  value={uploadPctAvg}
                  sx={{
                    height: 10,
                    borderRadius: 5,
                    bgcolor: theme => theme.palette.action.hover,
                    '& .MuiLinearProgress-bar': { borderRadius: 5 },
                  }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, display: 'block' }}
                >
                  {tracks.length} file{tracks.length === 1 ? '' : 's'} queued
                </Typography>
              </Paper>
            )}

            {trackValidationAttempted && trackInfoIssues.length > 0 && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                  Complete these items before continuing
                </Typography>
                <Box component="ul" sx={{ pl: 2.25, m: 0 }}>
                  {trackInfoIssues.slice(0, 6).map((issue, issueIdx) => (
                    <li key={`${issue.message}-${issueIdx}`}>
                      <Typography variant="body2">{issue.message}</Typography>
                    </li>
                  ))}
                  {trackInfoIssues.length > 6 ? (
                    <li>
                      <Typography variant="body2">
                        {trackInfoIssues.length - 6} more item
                        {trackInfoIssues.length - 6 === 1 ? '' : 's'} need attention.
                      </Typography>
                    </li>
                  ) : null}
                </Box>
              </Alert>
            )}

            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                alignItems: 'flex-start',
                gap: { xs: 2.5, md: 3.5 },
                mt: 0.5,
                width: '100%',
              }}
            >
              <Box
                onDrop={handleAudioDrop}
                onDragOver={handleAudioDragOver}
                onDragEnter={handleAudioDragOver}
                onDragLeave={handleAudioDragLeave}
                sx={{
                  flex: { md: '0 1 42%' },
                  minWidth: { md: 0 },
                  width: { xs: '100%', md: 'auto' },
                  maxWidth: { md: 520 },
                  p: { xs: 1.25, sm: 1.5 },
                  position: { md: 'sticky' },
                  top: { md: 154 },
                  alignSelf: { md: 'flex-start' },
                  // maxHeight: { md: 'calc(100vh - 178px)' },
                  overflowY: { md: 'auto' },
                  overscrollBehavior: { md: 'contain' },
                  border: '2px dashed',
                  borderColor: audioDragActive ? 'primary.main' : 'divider',
                  borderRadius: 2,
                  bgcolor: theme =>
                    audioDragActive
                      ? theme.palette.mode === 'dark'
                        ? 'rgba(74,108,247,0.14)'
                        : 'rgba(74,108,247,0.08)'
                      : 'transparent',
                  transition: 'border-color 160ms ease, background-color 160ms ease',
                }}
              >
                <Box
                  sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2, alignItems: 'center' }}
                >
                  <input
                    id="multi-track-upload"
                    type="file"
                    accept={allowedAudioExtensions.map(extension => `.${extension}`).join(',')}
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files?.length) void handleMultiTrackFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <label htmlFor="multi-track-upload">
                    <Button
                      variant="contained"
                      component="span"
                      startIcon={<CloudUpload />}
                      sx={{ borderRadius: 2 }}
                    >
                      {tracks.length === 0 ? 'Select audio files' : 'Replace all audio'}
                    </Button>
                  </label>
                  <input
                    ref={appendTracksInputRef}
                    type="file"
                    accept={allowedAudioExtensions.map(extension => `.${extension}`).join(',')}
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => {
                      void handleAppendTracksSelected(e.target.files);
                    }}
                  />
                  {selectedTypeLb &&
                    tracks.length > 0 &&
                    tracks.length < selectedTypeLb.maxTracks && (
                      <Button
                        variant="outlined"
                        startIcon={<Add />}
                        onClick={handleAppendTracksClick}
                        sx={{ borderRadius: 2 }}
                      >
                        Add more tracks
                      </Button>
                    )}
                </Box>

                {tracks.length === 0 ? (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 4,
                      borderRadius: 2,
                      borderStyle: 'dashed',
                      bgcolor: theme => theme.palette.action.hover,
                    }}
                  >
                    <Typography color="text.secondary" align="center">
                      Drop audio files here, or use <strong>Select audio files</strong>. Track cards
                      appear here automatically.
                    </Typography>
                  </Paper>
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      width: '100%',
                      minWidth: 0,
                    }}
                  >
                    {tracks.map((file, idx) => (
                      <Card
                        key={idx}
                        onClick={() => setSelectedTrackIdx(idx)}
                        elevation={0}
                        sx={{
                          p: 2,
                          cursor: 'pointer',
                          borderRadius: 2,
                          border: 2,
                          borderColor: idx === selectedTrackIdx ? 'primary.main' : 'divider',
                          transition: 'border-color .2s ease, box-shadow .2s ease',
                          minWidth: 0,
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 1,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Typography fontWeight={700} sx={{ flexShrink: 0 }}>
                            Track {idx + 1}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, ml: 'auto' }}>
                            <input
                              id={`track-replace-${idx}`}
                              type="file"
                              accept={allowedAudioExtensions
                                .map(extension => `.${extension}`)
                                .join(',')}
                              style={{ display: 'none' }}
                              onChange={e => {
                                const next = e.target.files?.[0];
                                void handleTrackFileChange(idx, next ?? null);
                                e.target.value = '';
                              }}
                            />
                            <label htmlFor={`track-replace-${idx}`}>
                              <Button
                                component="span"
                                size="small"
                                variant="text"
                                onClick={e => e.stopPropagation()}
                              >
                                Replace
                              </Button>
                            </label>
                            {tracks.length > 1 ? (
                              <IconButton
                                size="small"
                                color="error"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleRemoveTrack(idx);
                                }}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            ) : null}
                          </Box>
                        </Box>
                        <Chip
                          icon={<AudioFile />}
                          label={file.name}
                          title={file.name}
                          sx={{
                            mt: 1,
                            mb: 1,
                            maxWidth: '100%',
                            '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                          }}
                          variant="outlined"
                        />
                        {(trackUploading[idx] ||
                          analysisLoading[idx] ||
                          (audioUploadPct[idx] ?? 0) > 0) &&
                          (audioUploadPct[idx] ?? 0) < 100 && (
                            <Box sx={{ mb: 1 }}>
                              <Box
                                sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}
                              >
                                <Typography variant="caption" color="text.secondary">
                                  Audio upload
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {audioUploadPct[idx] ?? 0}%
                                </Typography>
                              </Box>
                              <LinearProgress
                                variant={
                                  analysisLoading[idx] && (audioUploadPct[idx] ?? 0) <= 1
                                    ? 'indeterminate'
                                    : 'determinate'
                                }
                                value={audioUploadPct[idx] ?? 0}
                                sx={{
                                  height: 6,
                                  borderRadius: 3,
                                  '& .MuiLinearProgress-bar': { borderRadius: 3 },
                                }}
                              />
                            </Box>
                          )}
                        {trackPreviewUrls[idx] && (
                          <Box sx={{ width: '100%', mt: 1 }}>
                            <audio
                              controls
                              src={trackPreviewUrls[idx] || undefined}
                              style={{ width: '100%', borderRadius: 8 }}
                            />
                          </Box>
                        )}
                        {!analysisLoading[idx] && (audioUploadPct[idx] ?? 0) >= 100 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography
                              variant="caption"
                              color="success.main"
                              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                            >
                              <CheckCircle sx={{ fontSize: 14 }} /> Upload complete
                            </Typography>
                          </Box>
                        )}
                        {audioAcrCloudStatuses[idx] && (
                          <Box sx={{ mb: 1 }}>
                            <Tooltip
                              title={
                                audioAcrCloudStatuses[idx]?.lastError ||
                                'ACRCloud verification status'
                              }
                            >
                              <Chip
                                size="small"
                                icon={
                                  getAcrCloudState(audioAcrCloudStatuses[idx]) === 'pending' ? (
                                    <CircularProgress size={12} />
                                  ) : (
                                    <PlaylistAddCheck fontSize="small" />
                                  )
                                }
                                label={getAcrCloudLabel(audioAcrCloudStatuses[idx])}
                                color={getAcrCloudColor(audioAcrCloudStatuses[idx]) as any}
                                variant="outlined"
                                sx={{ maxWidth: '100%' }}
                              />
                            </Tooltip>
                            {getAcrCloudSummary(audioAcrCloudStatuses[idx]) && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mt: 0.5 }}
                              >
                                {getAcrCloudSummary(audioAcrCloudStatuses[idx])}
                              </Typography>
                            )}
                            {(acrCloudProgressPct[idx] ?? 0) > 0 &&
                              (acrCloudProgressPct[idx] ?? 0) < 100 && (
                                <Box sx={{ mt: 1 }}>
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      mb: 0.5,
                                    }}
                                  >
                                    <Typography variant="caption" color="text.secondary">
                                      ACR scan
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {acrCloudProgressPct[idx] ?? 0}%
                                    </Typography>
                                  </Box>
                                  <LinearProgress
                                    variant="determinate"
                                    value={acrCloudProgressPct[idx] ?? 0}
                                    sx={{
                                      height: 6,
                                      borderRadius: 3,
                                      '& .MuiLinearProgress-bar': { borderRadius: 3 },
                                    }}
                                  />
                                </Box>
                              )}
                          </Box>
                        )}
                        {analysisLoading[idx] && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <CircularProgress size={14} />
                            <Typography variant="caption" color="text.secondary">
                              Analyzing…
                            </Typography>
                          </Box>
                        )}
                        {analysisResults[idx] && (
                          <Box
                            sx={{
                              mt: 0.75,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.5,
                              flexWrap: 'wrap',
                            }}
                          >
                            <Typography variant="caption" color="success.main">
                              Format:{' '}
                              {analysisResults[idx].format || analysisResults[idx].container || '—'}
                            </Typography>
                            <Typography variant="caption" color="success.main">
                              Duration: {formatDuration(analysisResults[idx].duration)}
                            </Typography>
                            <Typography variant="caption" color="success.main">
                              Bitrate:{' '}
                              {formatBitrate(
                                analysisResults[idx].bitrate || analysisResults[idx].bit_rate
                              )}
                            </Typography>
                          </Box>
                        )}
                        {analysisErrors[idx] && (
                          <Typography variant="caption" color="error.main">
                            {analysisErrors[idx]}
                          </Typography>
                        )}
                      </Card>
                    ))}
                  </Box>
                )}
                <Box
                  sx={{
                    mt: 2.5,
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<ArrowBack />}
                    onClick={handleBack}
                    sx={{ borderRadius: 2 }}
                  >
                    Back
                  </Button>
                </Box>
              </Box>
              <Box sx={{ flex: { md: '1 1 0' }, minWidth: 0, width: { xs: '100%', md: 'auto' } }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: { xs: 'stretch', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: 2,
                    flexDirection: { xs: 'column', sm: 'row' },
                  }}
                >
                  <Typography variant="h6" fontWeight="bold">
                    Track Information
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      alignSelf: { xs: 'flex-start', sm: 'center' },
                    }}
                  >
                    <Tooltip title="Waiting for track uploading. Apply to all becomes active after uploading finishes.">
                      <IconButton
                        size="small"
                        aria-label="Apply to all availability"
                        sx={{ width: 30, height: 30, color: 'text.secondary' }}
                      >
                        <Info sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={
                        applyingTrackInfoToAll ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <PlaylistAddCheck />
                        )
                      }
                      onClick={() => handleApplyTrackInfoToAll(selectedTrackIdx)}
                      disabled={
                        tracks.length < 2 || !allAudioUploadsReady || applyingTrackInfoToAll
                      }
                      sx={{ minWidth: 142 }}
                    >
                      {applyingTrackInfoToAll
                        ? 'Applying...'
                        : !allAudioUploadsReady && tracks.length > 1
                          ? 'Waiting for uploads'
                          : 'Apply to all'}
                    </Button>
                  </Box>
                </Box>
                {tracks.length === 0 ? (
                  <Paper
                    variant="outlined"
                    sx={{
                      mt: 2.5,
                      p: 3,
                      borderRadius: 2,
                      borderStyle: 'dashed',
                      bgcolor: theme => theme.palette.action.hover,
                    }}
                  >
                    <Typography color="text.secondary" align="center">
                      Upload audio on the left. Each file becomes a track and unlocks metadata here.
                    </Typography>
                  </Paper>
                ) : null}
                {tracks.length > 0 && selectedTrackIdx >= 0 && selectedTrackIdx < tracks.length && (
                  <Box
                    sx={{
                      mt: 2.5,
                      mb: 3,
                      p: { xs: 2, sm: 3 },
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      bgcolor: 'background.paper',
                    }}
                  >
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                      Track {selectedTrackIdx + 1}
                    </Typography>
                    <Box sx={{ display: 'grid', gap: 2.5 }}>
                      <Box>
                        <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                          Track details
                        </Typography>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                            gap: 2,
                            mt: 1,
                          }}
                        >
                          <TextField
                            label="Track Title *"
                            fullWidth
                            required
                            value={trackInfos[selectedTrackIdx]?.title || ''}
                            onChange={e =>
                              handleTrackInfoChange(selectedTrackIdx, 'title', e.target.value)
                            }
                            error={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.title?.trim()
                            }
                            helperText={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.title?.trim()
                                ? 'Track title is required.'
                                : ''
                            }
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <Tooltip title="Use a clear, searchable name. Avoid extra version text here.">
                                    <Info fontSize="small" />
                                  </Tooltip>
                                </InputAdornment>
                              ),
                            }}
                          />
                          <TextField
                            label="Version"
                            fullWidth
                            value={trackInfos[selectedTrackIdx]?.version || ''}
                            onChange={e =>
                              handleTrackInfoChange(selectedTrackIdx, 'version', e.target.value)
                            }
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <Tooltip title="e.g., Radio Edit, Acoustic, Remix">
                                    <Info fontSize="small" />
                                  </Tooltip>
                                </InputAdornment>
                              ),
                            }}
                          />
                        </Box>
                      </Box>

                      <AcrCloudResultPanel
                        acrCloud={audioAcrCloudStatuses[selectedTrackIdx]}
                        progress={acrCloudProgressPct[selectedTrackIdx] ?? 0}
                      />

                      <Box>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 2,
                            mb: 0.75,
                          }}
                        >
                          <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                            Contributors
                          </Typography>
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', mb: 1 }}
                        >
                          Add credits here. <strong>Artist</strong>, <strong>Composer</strong>, and{' '}
                          <strong>Lyricist</strong> are required. Use <strong>Performer</strong> for
                          featuring guests.
                        </Typography>
                        {(selectedTrackMissingArtist ||
                          selectedTrackMissingComposer ||
                          selectedTrackMissingLyricist) && (
                          <Alert severity="warning" sx={{ mb: 1.5 }}>
                            Add a named contributor for each required role:{' '}
                            {[
                              selectedTrackMissingArtist && 'Artist',
                              selectedTrackMissingComposer && 'Composer',
                              selectedTrackMissingLyricist && 'Lyricist',
                            ]
                              .filter(Boolean)
                              .join(', ')}
                            .
                          </Alert>
                        )}
                        <Box
                          sx={{
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                            overflow: 'hidden',
                          }}
                        >
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: { xs: '1fr', sm: '180px 1fr 48px' },
                              gap: 1,
                              px: 1.5,
                              py: 1,
                              bgcolor: 'action.hover',
                            }}
                          >
                            <Typography variant="caption" fontWeight={700}>
                              Role
                            </Typography>
                            <Typography variant="caption" fontWeight={700}>
                              Name
                            </Typography>
                          </Box>
                          {trackInfos[selectedTrackIdx]?.contributors.map(
                            (contributor, contributorIdx) => (
                              <Box
                                key={`${contributorIdx}-${contributor.role}`}
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: { xs: '1fr', sm: '180px 1fr 48px' },
                                  gap: 1.5,
                                  p: 1.5,
                                  borderTop: '1px solid',
                                  borderColor: 'divider',
                                  alignItems: 'center',
                                }}
                              >
                                <TextField
                                  select
                                  size="small"
                                  value={contributor.role}
                                  onChange={e =>
                                    updateContributor(
                                      selectedTrackIdx,
                                      contributorIdx,
                                      'role',
                                      e.target.value
                                    )
                                  }
                                >
                                  {contributorRoles.map(role => (
                                    <MenuItem key={role.value} value={role.value}>
                                      {role.label}
                                    </MenuItem>
                                  ))}
                                </TextField>
                                <TextField
                                  size="small"
                                  label="Contributor name"
                                  value={contributor.name}
                                  onChange={e =>
                                    updateContributor(
                                      selectedTrackIdx,
                                      contributorIdx,
                                      'name',
                                      e.target.value
                                    )
                                  }
                                  error={
                                    ((selectedTrackMissingArtist &&
                                      contributor.role === 'artist') ||
                                      (selectedTrackMissingComposer &&
                                        contributor.role === 'composer') ||
                                      (selectedTrackMissingLyricist &&
                                        contributor.role === 'lyricist')) &&
                                    !contributor.name.trim()
                                  }
                                  helperText={
                                    ((selectedTrackMissingArtist &&
                                      contributor.role === 'artist') ||
                                      (selectedTrackMissingComposer &&
                                        contributor.role === 'composer') ||
                                      (selectedTrackMissingLyricist &&
                                        contributor.role === 'lyricist')) &&
                                    !contributor.name.trim()
                                      ? 'Required'
                                      : ''
                                  }
                                />
                                <Tooltip title="Remove contributor">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() =>
                                      removeContributor(selectedTrackIdx, contributorIdx)
                                    }
                                  >
                                    <Delete fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            )
                          )}
                        </Box>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<Add />}
                          onClick={() => addContributor(selectedTrackIdx)}
                          sx={{ mt: 1.5, fontWeight: 850 }}
                        >
                          Add Contributor
                        </Button>
                      </Box>

                      <Box>
                        <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                          Metadata
                        </Typography>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                            gap: 2,
                            mt: 1,
                          }}
                        >
                          <Autocomplete
                            options={languages}
                            value={getLanguageOption(
                              trackInfos[selectedTrackIdx]?.metadataLanguage
                            )}
                            getOptionLabel={option => `${option.name} (${option.code})`}
                            isOptionEqualToValue={(option, value) => option.code === value.code}
                            onChange={(_event, option) =>
                              handleTrackInfoChange(
                                selectedTrackIdx,
                                'metadataLanguage',
                                option?.code || ''
                              )
                            }
                            renderInput={params => (
                              <TextField
                                {...params}
                                label="Metadata Language *"
                                fullWidth
                                required
                                error={
                                  trackValidationAttempted &&
                                  !trackInfos[selectedTrackIdx]?.metadataLanguage
                                }
                                helperText={
                                  trackValidationAttempted &&
                                  !trackInfos[selectedTrackIdx]?.metadataLanguage
                                    ? 'Metadata language is required.'
                                    : ''
                                }
                              />
                            )}
                          />
                          <Autocomplete
                            options={languages}
                            value={getLanguageOption(
                              trackInfos[selectedTrackIdx]?.audioLanguage ||
                                trackInfos[selectedTrackIdx]?.language
                            )}
                            getOptionLabel={option => `${option.name} (${option.code})`}
                            isOptionEqualToValue={(option, value) => option.code === value.code}
                            onChange={(_event, option) => {
                              const code = option?.code || '';
                              handleTrackInfoChange(selectedTrackIdx, 'audioLanguage', code);
                              handleTrackInfoChange(selectedTrackIdx, 'language', code);
                            }}
                            renderInput={params => (
                              <TextField
                                {...params}
                                label="Audio Language *"
                                fullWidth
                                required
                                error={
                                  trackValidationAttempted &&
                                  !(
                                    trackInfos[selectedTrackIdx]?.audioLanguage ||
                                    trackInfos[selectedTrackIdx]?.language
                                  )
                                }
                                helperText={
                                  trackValidationAttempted &&
                                  !(
                                    trackInfos[selectedTrackIdx]?.audioLanguage ||
                                    trackInfos[selectedTrackIdx]?.language
                                  )
                                    ? 'Audio language is required.'
                                    : ''
                                }
                              />
                            )}
                          />
                        </Box>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                            gap: 2,
                            mt: 2,
                          }}
                        >
                          <Autocomplete
                            options={genres}
                            value={trackInfos[selectedTrackIdx]?.genre || null}
                            onChange={(_event, value) => {
                              handleTrackInfoChange(selectedTrackIdx, 'genre', value || '');
                              if (
                                trackInfos[selectedTrackIdx]?.subgenre &&
                                !getSubgenreOptions(value || '').includes(
                                  trackInfos[selectedTrackIdx]?.subgenre
                                )
                              ) {
                                handleTrackInfoChange(selectedTrackIdx, 'subgenre', '');
                              }
                            }}
                            renderInput={params => (
                              <TextField
                                {...params}
                                label="Genre *"
                                fullWidth
                                required
                                error={
                                  trackValidationAttempted && !trackInfos[selectedTrackIdx]?.genre
                                }
                                helperText={
                                  trackValidationAttempted && !trackInfos[selectedTrackIdx]?.genre
                                    ? 'Genre is required.'
                                    : ''
                                }
                              />
                            )}
                          />
                          <Autocomplete
                            options={getSubgenreOptions(trackInfos[selectedTrackIdx]?.genre)}
                            value={trackInfos[selectedTrackIdx]?.subgenre || null}
                            onChange={(_event, value) =>
                              handleTrackInfoChange(selectedTrackIdx, 'subgenre', value || '')
                            }
                            renderInput={params => (
                              <TextField {...params} label="Subgenre" fullWidth />
                            )}
                          />
                        </Box>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                            gap: 2,
                            mt: 2,
                          }}
                        >
                          <TextField
                            label="Original release date"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={originalReleaseDate}
                            onChange={e => setOriginalReleaseDate(e.target.value)}
                            helperText="If this catalog was issued before."
                          />
                          <TextField
                            label="Digital release date *"
                            type="date"
                            fullWidth
                            required
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ min: todayInputValue }}
                            value={releaseDate}
                            onChange={e => setReleaseDate(e.target.value)}
                            error={
                              trackValidationAttempted &&
                              (!releaseDate.trim() || releaseDate < todayInputValue)
                            }
                            helperText={
                              trackValidationAttempted && !releaseDate.trim()
                                ? 'Digital release date is required.'
                                : trackValidationAttempted && releaseDate < todayInputValue
                                  ? 'Digital release date cannot be in the past.'
                                  : 'Date stores should go live.'
                            }
                          />
                        </Box>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                            gap: 2,
                            mt: 2,
                          }}
                        >
                          <TextField
                            select
                            label="Recording Year"
                            fullWidth
                            required
                            value={trackInfos[selectedTrackIdx]?.recordingYear || ''}
                            onChange={e =>
                              handleTrackInfoChange(
                                selectedTrackIdx,
                                'recordingYear',
                                e.target.value
                              )
                            }
                            error={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.recordingYear
                            }
                            helperText={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.recordingYear
                                ? 'Recording year is required.'
                                : ''
                            }
                          >
                            <MenuItem value="">Not set</MenuItem>
                            {copyrightYears.map(year => (
                              <MenuItem key={year} value={year}>
                                {year}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Box>
                      </Box>

                      <Box>
                        <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                          Identifiers
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2, mt: 1 }}>
                          <TextField
                            label="ISRC"
                            fullWidth
                            value={trackInfos[selectedTrackIdx]?.isrc || ''}
                            onChange={e =>
                              handleTrackInfoChange(selectedTrackIdx, 'isrc', e.target.value)
                            }
                            disabled={autoGenerateIsrcs}
                            helperText={
                              autoGenerateIsrcs
                                ? 'System assigns ISRC during admin approval.'
                                : 'Enter an existing ISRC.'
                            }
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <FormControlLabel
                                    sx={{
                                      mr: 0,
                                      '& .MuiFormControlLabel-label': {
                                        fontSize: 12,
                                        whiteSpace: 'nowrap',
                                      },
                                    }}
                                    control={
                                      <Checkbox
                                        size="small"
                                        checked={autoGenerateIsrcs}
                                        onChange={e => setAutoGenerateIsrcs(e.target.checked)}
                                      />
                                    }
                                    label="Auto"
                                  />
                                </InputAdornment>
                              ),
                            }}
                          />
                        </Box>
                      </Box>

                      <Box>
                        <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                          Rights
                        </Typography>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: '120px 1fr' },
                            gap: 2,
                            mt: 1,
                          }}
                        >
                          <TextField
                            select
                            label="Year"
                            fullWidth
                            required
                            value={
                              trackInfos[selectedTrackIdx]?.copyrightCYear || String(currentYear)
                            }
                            onChange={e =>
                              handleTrackInfoChange(
                                selectedTrackIdx,
                                'copyrightCYear',
                                e.target.value
                              )
                            }
                            error={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.copyrightCYear
                            }
                            helperText={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.copyrightCYear
                                ? 'Required'
                                : ' '
                            }
                          >
                            {copyrightYears.map(year => (
                              <MenuItem key={year} value={year}>
                                {year}
                              </MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            label="C-line name"
                            fullWidth
                            required
                            value={trackInfos[selectedTrackIdx]?.copyrightC || ''}
                            onChange={e =>
                              handleTrackInfoChange(selectedTrackIdx, 'copyrightC', e.target.value)
                            }
                            error={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.copyrightC?.trim()
                            }
                            helperText={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.copyrightC?.trim()
                                ? 'C-line name is required.'
                                : ' '
                            }
                          />
                          <TextField
                            select
                            label="Year"
                            fullWidth
                            required
                            value={
                              trackInfos[selectedTrackIdx]?.copyrightPYear || String(currentYear)
                            }
                            onChange={e =>
                              handleTrackInfoChange(
                                selectedTrackIdx,
                                'copyrightPYear',
                                e.target.value
                              )
                            }
                            error={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.copyrightPYear
                            }
                            helperText={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.copyrightPYear
                                ? 'Required'
                                : ' '
                            }
                          >
                            {copyrightYears.map(year => (
                              <MenuItem key={year} value={year}>
                                {year}
                              </MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            label="P-line name"
                            fullWidth
                            required
                            value={trackInfos[selectedTrackIdx]?.copyrightP || ''}
                            onChange={e =>
                              handleTrackInfoChange(selectedTrackIdx, 'copyrightP', e.target.value)
                            }
                            error={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.copyrightP?.trim()
                            }
                            helperText={
                              trackValidationAttempted &&
                              !trackInfos[selectedTrackIdx]?.copyrightP?.trim()
                                ? 'P-line name is required.'
                                : ' '
                            }
                          />
                        </Box>
                      </Box>

                      <Box>
                        <Typography variant="overline" sx={{ color: 'text.secondary' }}>
                          Content
                        </Typography>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                            gap: 2,
                            mt: 1,
                          }}
                        >
                          <Box>
                            <TextField
                              label="Lyrics"
                              fullWidth
                              multiline
                              minRows={3}
                              value={trackInfos[selectedTrackIdx]?.lyrics || ''}
                              onChange={e =>
                                handleTrackInfoChange(selectedTrackIdx, 'lyrics', e.target.value)
                              }
                            />
                          </Box>
                          <Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <TextField
                                select
                                label="Parental Advisory"
                                fullWidth
                                value={trackInfos[selectedTrackIdx]?.parentalAdvisory || 'none'}
                                onChange={e =>
                                  handleTrackInfoChange(
                                    selectedTrackIdx,
                                    'parentalAdvisory',
                                    e.target.value
                                  )
                                }
                              >
                                <MenuItem value="none">None</MenuItem>
                                <MenuItem value="explicit">Explicit</MenuItem>
                                <MenuItem value="clean">Clean</MenuItem>
                              </TextField>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      checked={!!trackInfos[selectedTrackIdx]?.explicit}
                                      onChange={e =>
                                        handleTrackInfoChange(
                                          selectedTrackIdx,
                                          'explicit',
                                          e.target.checked
                                        )
                                      }
                                    />
                                  }
                                  label="Explicit Lyrics"
                                />
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      checked={!!trackInfos[selectedTrackIdx]?.instrumental}
                                      onChange={e =>
                                        handleTrackInfoChange(
                                          selectedTrackIdx,
                                          'instrumental',
                                          e.target.checked
                                        )
                                      }
                                    />
                                  }
                                  label="Instrumental"
                                />
                              </Box>
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4, gap: 2 }}>
              <Button
                variant="contained"
                color="primary"
                sx={{ borderRadius: 2, px: 3 }}
                onClick={handleTracksInfoContinue}
                disabled={analysisLoading.some(Boolean) || trackUploading.some(Boolean)}
              >
                Continue
              </Button>
            </Box>
          </Box>
        );
      }

      case 3:
        // Distribution Providers
        return (
          <Box>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', md: 'center' },
                gap: 2,
                mb: 3,
                flexDirection: { xs: 'column', md: 'row' },
              }}
            >
              <Box>
                <Typography variant="h5" gutterBottom fontWeight={800}>
                  Distribution Providers
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 720 }}>
                  Pick every store for this release. Selected providers are shown again in final
                  review.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label={`${selectedDSPs.length}/${visibleDSPs.length} selected`}
                  color={selectedDSPs.length ? 'primary' : 'default'}
                  variant="outlined"
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleSelectAll}
                  disabled={isPlatformAccessLoading || visibleDSPs.length === 0}
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </Button>
              </Stack>
            </Box>
            {platformAccessError && (
              <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                {platformAccessError}. Showing default providers.
              </Alert>
            )}
            {isPlatformAccessLoading ? (
              <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography variant="body2" color="text.secondary">
                    Loading platform access...
                  </Typography>
                </Stack>
              </Paper>
            ) : visibleDSPs.length === 0 ? (
              <Paper
                variant="outlined"
                sx={{
                  p: 3,
                  borderRadius: 2,
                  borderStyle: 'dashed',
                  bgcolor: 'background.default',
                }}
              >
                <Typography fontWeight={800}>No providers enabled</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  Ask an admin to enable platform access before submitting this release.
                </Typography>
              </Paper>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, minmax(0, 1fr))',
                    lg: 'repeat(4, minmax(0, 1fr))',
                  },
                  gap: 1.5,
                }}
              >
                {visibleDSPs.map((dsp: DspItem) => {
                  const selected = selectedDSPs.includes(dsp.key);
                  const isFirstSocialRightsProvider = dsp.key === socialRightsDSPs[0]?.key;
                  return (
                    <Box key={dsp.key} sx={{ display: 'contents' }}>
                      {isFirstSocialRightsProvider && (
                        <Box
                          sx={{
                            gridColumn: '1 / -1',
                            mt: 1,
                            pt: 1,
                            borderTop: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Typography variant="overline" color="text.secondary" fontWeight={900}>
                            Rights management
                          </Typography>
                        </Box>
                      )}
                      <Paper
                        variant="outlined"
                        onClick={() => handleDSPToggle(dsp.key)}
                        sx={{
                          cursor: 'pointer',
                          p: 1.5,
                          minHeight: 96,
                          borderRadius: 2,
                          border: 'none',
                          background: 'transparent',
                          backgroundColor: 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          transition:
                            'border-color 160ms, transform 160ms, box-shadow 160ms, background-color 160ms',
                          '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: theme =>
                              theme.palette.mode === 'dark'
                                ? '0 14px 34px rgba(0,0,0,0.28)'
                                : '0 14px 34px rgba(15,23,42,0.08)',
                          },
                        }}
                      >
                        <DspLogo
                          value={dsp.key}
                          alt={dsp.name}
                          size={64}
                          padding={0.75}
                          sx={{ fontSize: 14 }}
                        />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography fontWeight={850} noWrap>
                            {dsp.name}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              mt: 0.35,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {dsp.info}
                          </Typography>
                        </Box>
                        <Box sx={{ flex: '0 0 auto' }}>
                          <Checkbox
                            checked={selected}
                            onClick={event => event.stopPropagation()}
                            onChange={() => handleDSPToggle(dsp.key)}
                            inputProps={{ 'aria-label': `Select ${dsp.name}` }}
                          />
                        </Box>
                      </Paper>
                    </Box>
                  );
                })}
              </Box>
            )}
            <Paper
              variant="outlined"
              sx={{
                mt: 2.5,
                p: { xs: 1.5, sm: 2 },
                borderRadius: 2,
                borderColor:
                  !requiresYoutubeTerms || distributionTermsAccepted
                    ? 'success.main'
                    : 'warning.main',
                bgcolor: theme =>
                  theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.025)' : 'rgba(15,23,42,0.02)',
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={distributionTermsAccepted}
                    onChange={event => setDistributionTermsAccepted(event.target.checked)}
                    inputProps={{ 'aria-label': 'Accept the YouTube Content ID policy' }}
                  />
                }
                label={
                  <Typography variant="body2" fontWeight={800}>
                    I accept the YouTube Content ID policy.{' '}
                    <Box
                      component="a"
                      href={YOUTUBE_CONTENT_ID_TERMS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={event => event.stopPropagation()}
                      sx={{ color: 'primary.main', textDecoration: 'underline', fontWeight: 900 }}
                    >
                      Terms
                    </Box>
                  </Typography>
                }
              />
              {requiresYoutubeTerms && !distributionTermsAccepted && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', pl: 4 }}>
                  Required because a YouTube provider is selected.
                </Typography>
              )}
            </Paper>
            <Paper
              variant="outlined"
              sx={{
                mt: 1.5,
                p: { xs: 1.5, sm: 2 },
                borderRadius: 2,
                borderColor:
                  !requiresFacebookTerms || socialDistributionTermsAccepted
                    ? 'success.main'
                    : 'warning.main',
                bgcolor: theme =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(237,30,121,0.08)'
                    : 'rgba(237,30,121,0.035)',
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={socialDistributionTermsAccepted}
                    onChange={event => setSocialDistributionTermsAccepted(event.target.checked)}
                    inputProps={{ 'aria-label': 'Accept the Facebook Rights Manager policy' }}
                  />
                }
                label={
                  <Typography variant="body2" fontWeight={800}>
                    I accept the Facebook Rights Manager policy.{' '}
                    <Box
                      component="a"
                      href={FACEBOOK_RIGHTS_MANAGER_TERMS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={event => event.stopPropagation()}
                      sx={{ color: 'primary.main', textDecoration: 'underline', fontWeight: 900 }}
                    >
                      Terms
                    </Box>
                  </Typography>
                }
              />
              {requiresFacebookTerms && !socialDistributionTermsAccepted && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', pl: 4 }}>
                  Required because Facebook Rights Management is selected.
                </Typography>
              )}
            </Paper>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
              <Button onClick={handleBack}>Back</Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleContinue}
                disabled={!isDistributionValid}
              >
                Continue
              </Button>
            </Box>
          </Box>
        );

      case 4:
        // Territories & Rights
        return (
          <Box>
            <Typography variant="h5" gutterBottom fontWeight="bold">
              Territories & Rights
            </Typography>
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid xs={12} md={6}>
                <TerritoryManager
                  value={territoryCountries}
                  mode={territoryMode}
                  onChange={(countries, mode) => {
                    setTerritoryCountries(countries);
                    setTerritoryMode(mode);
                  }}
                />
              </Grid>
              <Grid xs={12} md={6}>
                <RightsManager
                  rightsType={rightsType}
                  description={rightsDescription}
                  onChange={(type, desc) => {
                    setRightsType(type);
                    setRightsDescription(desc);
                  }}
                />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
              <Button onClick={handleBack}>Back</Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleNext}
                disabled={!rightsType || territoryCountries.length === 0}
              >
                Continue
              </Button>
            </Box>
          </Box>
        );
      case 5:
        // Review & Submit
        return (
          <Box>
            <Typography variant="h5" gutterBottom fontWeight="bold">
              Review & Submit
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Review all details before submitting your release.
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: { xs: 2.5, sm: 3.5 },
                mb: 3,
                borderRadius: 2,
                bgcolor: 'background.paper',
                color: 'text.primary',
                boxShadow: theme =>
                  theme.palette.mode === 'dark' ? 'none' : '0 14px 40px rgba(15,23,42,0.06)',
              }}
            >
              <Typography variant="subtitle1" fontWeight="bold">
                Release Overview
              </Typography>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid xs={12} md={4} lg={3}>
                  <Box
                    sx={{
                      width: '100%',
                      maxWidth: 240,
                      aspectRatio: '1 / 1',
                      bgcolor: theme =>
                        theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.055)' : '#eef2f7',
                      borderRadius: '18px',
                      overflow: 'hidden',
                      border: '1px solid',
                      borderColor: 'divider',
                      boxShadow: artworkPreview
                        ? theme =>
                            theme.palette.mode === 'dark'
                              ? '0 18px 44px rgba(0,0,0,0.32)'
                              : '0 18px 44px rgba(15,23,42,0.12)'
                        : 'none',
                    }}
                  >
                    {artworkPreview ? (
                      <Box
                        component="img"
                        src={artworkPreview}
                        alt="Artwork preview"
                        sx={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'text.secondary',
                        }}
                      >
                        <Album />
                      </Box>
                    )}
                  </Box>
                </Grid>
                <Grid xs={12} md={8} lg={9}>
                  <Box>
                    <strong>Release Title:</strong> {releaseTitle || 'N/A'}
                    <br />
                    <strong>Type:</strong> {releaseType}
                    <br />
                    <strong>Primary artist:</strong>{' '}
                    {trackInfos[0] ? getContributorNames(trackInfos[0], 'artist') || '—' : '—'}
                    <br />
                    <strong>Label:</strong> {label || 'N/A'}
                    <br />
                    <strong>Original Release Date:</strong> {originalReleaseDate || 'N/A'}
                    <br />
                    <strong>Release Date:</strong> {releaseDate || 'N/A'}
                    <br />
                    <strong>Tracks:</strong> {tracks.length}
                    <br />
                  </Box>
                </Grid>
              </Grid>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5 }}>
                Tracklist
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, mb: 2 }}>
                <Table size="small" aria-label="release review tracklist">
                  <TableHead>
                    <TableRow>
                      <TableCell>Track</TableCell>
                      <TableCell>Artists</TableCell>
                      <TableCell>Metadata</TableCell>
                      <TableCell>ACR</TableCell>
                      <TableCell align="right">Preview</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tracks.map((_file, idx) => {
                      const track = trackInfos[idx];
                      if (!track) return null;
                      const mainArtist = getContributorNames(track, 'artist') || 'Artist TBD';
                      const featPerf = getContributorNames(track, 'performer');
                      const remixCredits = getContributorNames(track, 'remixer');
                      const contributors = track.contributors
                        .filter(contributor => contributor.name.trim())
                        .map(
                          contributor =>
                            `${contributorRoles.find(role => role.value === contributor.role)?.label || contributor.role}: ${contributor.name.trim()}`
                        )
                        .join(' | ');

                      return (
                        <TableRow key={idx} hover>
                          <TableCell sx={{ minWidth: 260 }}>
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                              <Avatar
                                src={artworkPreview || undefined}
                                alt={releaseTitle || 'Artwork'}
                                variant="rounded"
                                sx={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: 1.5,
                                  bgcolor: 'background.default',
                                }}
                              >
                                <Album fontSize="small" />
                              </Avatar>
                              <Box>
                                <Typography variant="body2" fontWeight={800}>
                                  {idx + 1}. {track.title || `Track ${idx + 1}`}
                                  {track.version ? ` (${track.version})` : ''}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {track.duration ? `${track.duration} | ` : ''}
                                  {track.isrc ? `ISRC ${track.isrc}` : 'ISRC auto'}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ minWidth: 220 }}>
                            <Typography variant="body2" fontWeight={700}>
                              {mainArtist}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {[
                                featPerf ? `Feat. ${featPerf}` : '',
                                remixCredits ? `Remix ${remixCredits}` : '',
                              ]
                                .filter(Boolean)
                                .join(' | ') || 'No featured credits'}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ minWidth: 260 }}>
                            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                              <Chip
                                size="small"
                                label={
                                  track.genre
                                    ? `${track.genre}${track.subgenre ? ` / ${track.subgenre}` : ''}`
                                    : 'Genre missing'
                                }
                                variant="outlined"
                              />
                              <Chip
                                size="small"
                                label={
                                  track.audioLanguage || track.language || 'Audio language missing'
                                }
                                variant="outlined"
                              />
                              <Chip
                                size="small"
                                label={track.explicit ? 'Explicit' : 'Clean'}
                                variant="outlined"
                              />
                              <Chip
                                size="small"
                                label={track.instrumental ? 'Instrumental' : 'Vocal'}
                                variant="outlined"
                              />
                            </Stack>
                            {contributors ? (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mt: 0.75 }}
                              >
                                {contributors}
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell sx={{ minWidth: 160 }}>
                            {audioAcrCloudStatuses[idx] ? (
                              <Stack spacing={0.5} alignItems="flex-start">
                                <Chip
                                  size="small"
                                  icon={
                                    getAcrCloudState(audioAcrCloudStatuses[idx]) === 'pending' ? (
                                      <CircularProgress size={12} />
                                    ) : (
                                      <PlaylistAddCheck fontSize="small" />
                                    )
                                  }
                                  label={getAcrCloudLabel(audioAcrCloudStatuses[idx])}
                                  color={getAcrCloudColor(audioAcrCloudStatuses[idx]) as any}
                                  variant="outlined"
                                />
                                {getAcrCloudSummary(audioAcrCloudStatuses[idx]) ? (
                                  <Typography variant="caption" color="text.secondary">
                                    {getAcrCloudSummary(audioAcrCloudStatuses[idx])}
                                  </Typography>
                                ) : null}
                              </Stack>
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                Pending upload scan
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {trackPreviewUrls[idx] ? (
                              <IconButton
                                size="small"
                                aria-label={`Play ${track.title || `Track ${idx + 1}`}`}
                              >
                                <PlayArrow />
                              </IconButton>
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                No preview
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <ol style={{ paddingLeft: 18, display: 'none' }}>
                {tracks.map((_file, idx) => {
                  const track = trackInfos[idx];
                  if (!track) return null;
                  const mainArtist = getContributorNames(track, 'artist') || 'Artist TBD';
                  const featPerf = getContributorNames(track, 'performer');
                  const remixCredits = getContributorNames(track, 'remixer');
                  return (
                    <li key={idx}>
                      <div>
                        <strong>{track.title || `Track ${idx + 1}`}</strong>
                        {track.version ? ` (${track.version})` : ''}
                        {` — ${mainArtist}`}
                        {featPerf ? ` feat. ${featPerf}` : ''}
                        {remixCredits ? ` [Remix: ${remixCredits}]` : ''}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--mui-palette-text-secondary)' }}>
                        {track.duration ? `Duration: ${track.duration} · ` : ''}
                        {track.genre
                          ? `Genre: ${track.genre}${track.subgenre ? `/${track.subgenre}` : ''} · `
                          : ''}
                        {track.metadataLanguage
                          ? `Metadata Language: ${track.metadataLanguage} · `
                          : ''}
                        {track.audioLanguage || track.language
                          ? `Audio Language: ${track.audioLanguage || track.language} · `
                          : ''}
                        {track.isrc ? `ISRC: ${track.isrc} · ` : ''}
                        {track.parentalAdvisory && track.parentalAdvisory !== 'none'
                          ? `Advisory: ${track.parentalAdvisory} · `
                          : ''}
                        {track.instrumental ? `Instrumental · ` : ''}
                        {track.recordingYear ? `Recording Year: ${track.recordingYear} · ` : ''}
                        {track.copyrightC ? `© ${track.copyrightC} · ` : ''}
                        {track.copyrightP ? `℗ ${track.copyrightP}` : ''}
                      </div>
                      {audioAcrCloudStatuses[idx] && (
                        <div style={{ marginTop: 6 }}>
                          <Chip
                            size="small"
                            icon={
                              getAcrCloudState(audioAcrCloudStatuses[idx]) === 'pending' ? (
                                <CircularProgress size={12} />
                              ) : (
                                <PlaylistAddCheck fontSize="small" />
                              )
                            }
                            label={getAcrCloudLabel(audioAcrCloudStatuses[idx])}
                            color={getAcrCloudColor(audioAcrCloudStatuses[idx]) as any}
                            variant="outlined"
                          />
                          {getAcrCloudSummary(audioAcrCloudStatuses[idx]) ? (
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--mui-palette-text-secondary)',
                                marginTop: 4,
                              }}
                            >
                              {getAcrCloudSummary(audioAcrCloudStatuses[idx])}
                            </div>
                          ) : null}
                        </div>
                      )}
                      {(track.composers || track.publishers || track.producers) && (
                        <div style={{ fontSize: 13, color: 'var(--mui-palette-text-secondary)' }}>
                          {track.composers ? `Composers: ${track.composers} · ` : ''}
                          {track.publishers ? `Publishers: ${track.publishers} · ` : ''}
                          {track.producers ? `Producers: ${track.producers}` : ''}
                        </div>
                      )}
                      {track.contributors.some(contributor => contributor.name.trim()) && (
                        <div style={{ fontSize: 13, color: 'var(--mui-palette-text-secondary)' }}>
                          Contributors:{' '}
                          {track.contributors
                            .filter(contributor => contributor.name.trim())
                            .map(
                              contributor =>
                                `${contributorRoles.find(role => role.value === contributor.role)?.label || contributor.role}: ${contributor.name.trim()}`
                            )
                            .join(' · ')}
                        </div>
                      )}
                      {(track.copyrightC || track.copyrightP) && (
                        <div style={{ fontSize: 13, color: 'var(--mui-palette-text-secondary)' }}>
                          {track.upc ? `UPC: ${track.upc}` : ''}
                        </div>
                      )}
                      {trackPreviewUrls[idx] && (
                        <div style={{ marginTop: 8 }}>
                          <audio
                            controls
                            src={trackPreviewUrls[idx] || undefined}
                            style={{ width: '100%' }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight="bold">
                Distribution Providers
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, mt: 1 }}>
                {selectedDSPs.map(key => {
                  const dsp =
                    visibleDSPs.find((d: DspItem) => d.key === key) ||
                    DSP_META.find((d: DspItem) => d.key === key);
                  if (!dsp) return null;
                  return (
                    <Chip
                      key={key}
                      label={dsp.name}
                      avatar={<DspLogo value={dsp.key} alt={dsp.name} size={24} />}
                      variant="outlined"
                    />
                  );
                })}
                {selectedDSPs.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No providers selected
                  </Typography>
                )}
              </Box>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight="bold">
                Territories & Rights
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Mode: <strong>{territoryMode === 'allowed' ? 'Allowed' : 'Disallowed'}</strong>
                </Typography>
                {territoryCountries.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No territories selected
                  </Typography>
                ) : (
                  (() => {
                    const REVIEW_TR_MAX = 14;
                    const sortedTerritory = [...territoryCountries]
                      .map(code => ({
                        code,
                        label: countries.find(ct => ct.code === code)?.label || code,
                      }))
                      .sort((a, b) => a.label.localeCompare(b.label));
                    const showExpandToggle = sortedTerritory.length > REVIEW_TR_MAX;
                    const visible = reviewTerritoriesExpanded
                      ? sortedTerritory
                      : sortedTerritory.slice(0, REVIEW_TR_MAX);
                    return (
                      <Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                          {visible.map(({ code, label }) => (
                            <Chip
                              key={code}
                              label={label}
                              size="small"
                              variant="outlined"
                              sx={{ borderRadius: 2 }}
                            />
                          ))}
                        </Box>
                        {showExpandToggle ? (
                          <Button
                            size="small"
                            onClick={() => setReviewTerritoriesExpanded(prev => !prev)}
                            endIcon={
                              <ExpandMore
                                sx={{
                                  transition: 'transform 0.2s',
                                  transform: reviewTerritoriesExpanded
                                    ? 'rotate(180deg)'
                                    : 'rotate(0deg)',
                                }}
                              />
                            }
                            sx={{ mt: 1 }}
                          >
                            {reviewTerritoriesExpanded
                              ? 'Show fewer territories'
                              : `Show all ${sortedTerritory.length} territories`}
                          </Button>
                        ) : null}
                      </Box>
                    );
                  })()
                )}
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="body2">
                    Rights: <strong>{rightsType}</strong>
                    {rightsDescription ? ` — ${rightsDescription}` : ''}
                  </Typography>
                </Box>
              </Box>
            </Paper>
            <Paper
              variant="outlined"
              sx={{
                mt: 2,
                p: { xs: 1.5, sm: 2 },
                borderRadius: 2,
                borderColor: summaryDeclarationAccepted ? 'success.main' : 'warning.main',
              }}
            >
              <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 0.75 }}>
                Final declaration
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={summaryDeclarationAccepted}
                    onChange={event => setSummaryDeclarationAccepted(event.target.checked)}
                    inputProps={{ 'aria-label': 'Accept final release declaration' }}
                  />
                }
                label={
                  <Typography variant="body2" fontWeight={750}>
                    I accept and confirm that the release information, rights, contributors, audio,
                    artwork, territories, and selected platforms are accurate.
                  </Typography>
                }
              />
              <Stack spacing={0.5} sx={{ pl: 4 }}>
                {requiresYoutubeTerms && (
                  <Typography variant="caption" color="text.secondary">
                    YouTube Content ID policy:{' '}
                    {distributionTermsAccepted ? 'Accepted' : 'Not accepted'}
                  </Typography>
                )}
                {requiresFacebookTerms && (
                  <Typography variant="caption" color="text.secondary">
                    Facebook Rights Manager policy:{' '}
                    {socialDistributionTermsAccepted ? 'Accepted' : 'Not accepted'}
                  </Typography>
                )}
              </Stack>
            </Paper>
            {submitState === 'idle' ? (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
                <Button onClick={handleBack} sx={{ borderRadius: 2 }}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  sx={{ borderRadius: 2, px: 3 }}
                  onClick={handleSubmitRelease}
                  disabled={
                    !isTrackInfoListValid ||
                    !isDistributionValid ||
                    !rightsType ||
                    territoryCountries.length === 0 ||
                    !summaryDeclarationAccepted
                  }
                >
                  {isEditMode ? 'Update & Resubmit' : 'Submit Release'}
                </Button>
              </Box>
            ) : submitState === 'loading' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', my: 4 }}>
                <CircularProgress sx={{ mb: 2 }} />
                <Typography>
                  {isEditMode
                    ? 'Updating and resubmitting your release...'
                    : 'Submitting your release...'}
                </Typography>
              </Box>
            ) : (
              <Alert severity="success">
                {isEditMode
                  ? 'Your release changes were sent for review.'
                  : 'Your release has been queued for distribution!'}
              </Alert>
            )}
          </Box>
        );
    }
  };

  // Show loading state until client-side hydration is complete
  if (!mounted) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '80vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <PremiumHeader
        eyebrow="Release Studio"
        title={isEditMode ? 'Edit Rejected Release' : 'Create New Release'}
        description={
          isEditMode
            ? 'Fix rejected release details and resubmit for admin review.'
            : 'A guided release room for audio, artwork, metadata, territories, rights, and final checks before distribution.'
        }
      />

      {editReleaseLoading ? (
        <Alert
          severity="info"
          icon={<CircularProgress size={18} />}
          sx={{ mb: 2, borderRadius: 2 }}
        >
          Loading rejected release details...
        </Alert>
      ) : null}

      {isEditMode && editRejectReason && !editReleaseLoading ? (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={800}>
            Admin rejection message
          </Typography>
          <Typography variant="body2">{editRejectReason}</Typography>
        </Alert>
      ) : null}

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1, sm: 2 },
          mb: 3,
          ...premiumSurfaceSx(theme),
          overflowX: 'auto',
          position: 'sticky',
          top: 76,
          zIndex: 3,
          backdropFilter: 'blur(18px)',
        }}
      >
        <Stepper
          activeStep={activeStep}
          alternativeLabel
          sx={{
            '& .MuiStepConnector-line': {
              borderTopWidth: 2,
              borderColor: theme => theme.palette.divider,
            },
            '& .Mui-active .MuiStepConnector-line, & .Mui-completed .MuiStepConnector-line': {
              borderColor: 'primary.main',
            },
            '& .MuiStepLabel-labelContainer': {
              typography: 'caption',
              mt: { xs: 1, md: 0 },
            },
          }}
        >
          {steps.map((label, index) => (
            <Step key={label} completed={isWizardStepComplete(index)}>
              <StepLabel
                sx={{
                  cursor: canNavigateToStep(index) ? 'pointer' : 'not-allowed',
                  '& .Mui-active': { fontWeight: 700 },
                  '& .Mui-completed': { fontWeight: 600 },
                }}
                onClick={() => handleStepNavigation(index, label)}
                componentsProps={{
                  label: {
                    role: 'button',
                    tabIndex: 0,
                    'aria-disabled': !canNavigateToStep(index),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleStepNavigation(index, label);
                      }
                    },
                    'aria-label': `Go to ${label}`,
                  },
                }}
              >
                {label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 3, md: 4 },
          ...premiumSurfaceSx(theme),
          background:
            theme.palette.mode === 'dark'
              ? 'linear-gradient(135deg, rgba(18,26,43,0.98), rgba(11,16,32,0.96))'
              : 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94))',
        }}
      >
        {renderStepContent()}
      </Paper>
    </Box>
  );
}
