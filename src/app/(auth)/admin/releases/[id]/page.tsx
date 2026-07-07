"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  FormControlLabel,
} from "@mui/material";
import {
  CheckCircle,
  Pending,
  Cancel,
  ArrowBack,
  ThumbUp,
  ThumbDown,
  Info,
  MusicNote,
  PlayArrow,
  PlaylistAddCheck,
  Delete,
  Replay,
  Sync,
} from "@mui/icons-material";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { releaseAPI } from "@/services/api";
import { useColorMode } from '@/context/ColorModeContext';
import {
  getAcrCloudProviderMetadata,
  fetchAcrCloudScanResult,
  getAcrCloudColor,
  getAcrCloudLabel,
  getAcrCloudRightsClaims,
  getAcrCloudState,
  getAcrCloudSummary,
} from '@/lib/acrCloud';
import { DspLogo } from '@/components/dsp/DspLogo';
import { getDspDisplayName } from '@/lib/platforms';
import PremiumAudioPlayer from '@/components/audio/PremiumAudioPlayer';
import { resolveMediaUrl } from '@/lib/urlConfig';
import { getNormalizedReleaseStatus, getReleaseRejectionReason, getReleaseStatusLabel } from '@/lib/releaseStatus';
import { toast } from 'sonner';

const formatAcrProbability = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
};

const formatAcrTime = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const mins = Math.floor(value / 60);
  const secs = Math.round(value % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatAcrTimeRange = (start?: number, end?: number) => {
  const startText = formatAcrTime(start);
  const endText = formatAcrTime(end);
  return startText && endText ? `${startText}-${endText}` : null;
};

const formatTrackDuration = (value?: string | number) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 'N/A';
    if (/^\d+:\d{2}$/.test(trimmed)) return trimmed;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return 'N/A';
    value = parsed;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 'N/A';
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export default function AdminReleaseDetailPage() {
  const router = useRouter();   
  const { mode } = useColorMode();
  const params = useParams<{ id: string }>();
  const releaseId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lifecycleSaving, setLifecycleSaving] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [release, setRelease] = useState<any | null>(null);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [playerRequestId, setPlayerRequestId] = useState(0);
  const [playerVisible, setPlayerVisible] = useState(false);
  const acrRefreshRef = useRef<Record<string, boolean>>({});

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [trackDeleteTarget, setTrackDeleteTarget] = useState<{ index: number; title: string } | null>(null);
  const [trackDeleteReason, setTrackDeleteReason] = useState("");
  const [deletingTrack, setDeletingTrack] = useState(false);
  const [deleteReleaseOpen, setDeleteReleaseOpen] = useState(false);
  const [deletingRelease, setDeletingRelease] = useState(false);
  const [showAllTerritories, setShowAllTerritories] = useState(false);
  const [takedownTarget, setTakedownTarget] = useState<{
    target: 'release' | 'track';
    nextStatus: string;
    trackIndex?: number;
    title: string;
    providers: string[];
  } | null>(null);
  const [selectedTakedownProviders, setSelectedTakedownProviders] = useState<string[]>([]);
  const [takedownNote, setTakedownNote] = useState('');

  const mergeTrackAcrCloudStatus = (tracks: any[], fileId: string, acrCloud: any) =>
    tracks.map((track: any) =>
      track?.acrCloud?.fileId === fileId
        ? { ...track, acrCloud: { ...(track.acrCloud || {}), ...acrCloud } }
        : track
    );

  const statusColor = useMemo(() => {
    if (!release?.status) return "default" as const;
    const displayStatus = getNormalizedReleaseStatus(release.status);
    return displayStatus === "approved"
      ? ("success" as const)
      : displayStatus === "pending"
      ? ("warning" as const)
      : displayStatus === "in_process"
      ? ("info" as const)
      : ("error" as const);
  }, [release?.status]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const resp = await releaseAPI.getReleaseById(releaseId);
        if (mounted) {
          if (resp?.success) {
            setRelease(resp.data || null);
            setError(null);
          } else {
            setError(typeof resp?.error === "string" ? resp.error : "Failed to load release");
            setRelease(null);
          }
        }
      } catch {
        if (mounted) {
          setError("An error occurred while loading the release.");
          setRelease(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    if (releaseId) load();
    return () => {
      mounted = false;
    };
  }, [releaseId]);

  useEffect(() => {
    if (!Array.isArray(release?.tracks)) return;

    const pendingTracks = release.tracks.filter(
      (track: any) =>
        track?.acrCloud?.fileId &&
        getAcrCloudState(track.acrCloud) === 'pending' &&
        !acrRefreshRef.current[track.acrCloud.fileId]
    );
    if (!pendingTracks.length) return;

    let cancelled = false;

    const refreshPending = async () => {
      for (const track of pendingTracks) {
        if (cancelled) return;
        acrRefreshRef.current[track.acrCloud.fileId] = true;

        try {
          const nextStatus = await fetchAcrCloudScanResult(track.acrCloud.fileId);
          if (cancelled) return;

          setRelease((prev: any) =>
            prev
              ? {
                  ...prev,
                  tracks: Array.isArray(prev.tracks)
                    ? mergeTrackAcrCloudStatus(prev.tracks, track.acrCloud.fileId, nextStatus)
                    : prev.tracks,
                }
              : prev
          );
        } catch {
          // Leave pending if refresh fails.
        } finally {
          delete acrRefreshRef.current[track.acrCloud.fileId];
        }
      }
    };

    void refreshPending();

    return () => {
      cancelled = true;
    };
  }, [release]);

  const handleApprove = async () => {
    try {
      setSaving(true);
      const resp = await releaseAPI.updateReleaseStatus(releaseId, "approved");
      if (resp?.success) {
        const nextStatus = resp.release?.status || resp.data?.status || "uploading_to_broma";
        setRelease((r: any) => (r ? { ...r, status: nextStatus, rejectReason: undefined, rejectionReason: undefined } : r));
        if (getNormalizedReleaseStatus(nextStatus) === 'in_process') {
          toast.success('Release moved to processing');
        }
        router.push('/admin/releases?status=pending');
      } else {
        setError(resp?.message || resp?.error || "Failed to approve release");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to approve release");
    } finally {
      setSaving(false);
    }
  };

  const handleMoveToPending = async () => {
    try {
      setSaving(true);
      const resp = await releaseAPI.updateReleaseStatus(releaseId, "pending");
      if (resp?.success) {
        setRelease((r: any) => (r ? { ...r, status: "pending", rejectReason: undefined, rejectionReason: undefined } : r));
      } else {
        setError(resp?.message || resp?.error || "Failed to move release to pending");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to move release to pending");
    } finally {
      setSaving(false);
    }
  };

  const getNextLifecycleStatus = (status?: string) => {
    if (status === 'takedown_requested') return { status: 'taken_down', label: 'Mark Taken Down' };
    if (status === 'taken_down') return { status: 'redelivery_requested', label: 'Redeliver' };
    if (status === 'redelivery_requested') return { status: 'redelivered', label: 'Mark Redelivered' };
    return { status: 'takedown_requested', label: 'Takedown' };
  };

  const getTakedownProviders = (track?: any) => {
    const raw = Array.isArray(track?.stores) && track.stores.length ? track.stores : release?.stores;
    return Array.from(new Set((Array.isArray(raw) ? raw : []).map((item: unknown) => String(item)).filter(Boolean)));
  };

  const openTakedownDialog = (target: 'release' | 'track', nextStatus: string, title: string, trackIndex?: number, track?: any) => {
    const providers = getTakedownProviders(track);
    setTakedownTarget({ target, nextStatus, trackIndex, title, providers });
    setSelectedTakedownProviders(providers);
    setTakedownNote('');
  };

  const handleLifecycleAction = async (
    target: 'release' | 'track',
    nextStatus: string,
    trackIndex?: number,
    options: { dspProviders?: string[]; note?: string } = {}
  ) => {
    const savingKey = target === 'release' ? 'release' : `track:${trackIndex}`;
    try {
      setLifecycleSaving(savingKey);
      setError(null);
      const response = await fetch(`/api/releases/${releaseId}/lifecycle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          trackIndex: target === 'track' ? trackIndex : undefined,
          dspProviders: options.dspProviders || [],
          note: options.note || '',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to update DSP lifecycle status');
      }
      setRelease(payload.release || release);
    } catch (e: any) {
      setError(e?.message || 'Failed to update DSP lifecycle status');
    } finally {
      setLifecycleSaving('');
      setTakedownTarget(null);
    }
  };

  const handleReject = async () => {
    try {
      setSaving(true);
      const resp = await releaseAPI.updateReleaseStatus(releaseId, "rejected", rejectReason || undefined);
      if (resp?.success) {
        setRelease((r: any) => (r ? { ...r, status: "rejected", rejectReason } : r));
        setRejectOpen(false);
        setRejectReason("");
      } else {
        setError(resp?.message || resp?.error || "Failed to reject release");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to reject release");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReleaseTrack = async () => {
    if (!trackDeleteTarget) return;
    try {
      setDeletingTrack(true);
      const resp = await releaseAPI.deleteReleaseTrack(releaseId, trackDeleteTarget.index, trackDeleteReason || undefined);
      if (resp?.success) {
        setRelease(resp.release || ((prev: any) => {
          if (!prev || !Array.isArray(prev.tracks)) return prev;
          return {
            ...prev,
            tracks: prev.tracks.filter((_: any, idx: number) => idx !== trackDeleteTarget.index),
            updatedAt: new Date().toISOString(),
          };
        }));
        setTrackDeleteTarget(null);
        setTrackDeleteReason("");
      } else {
        setError(resp?.message || resp?.error || "Failed to delete track from release");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to delete track from release");
    } finally {
      setDeletingTrack(false);
    }
  };

  const handleDeleteRelease = async () => {
    try {
      setDeletingRelease(true);
      const resp = await releaseAPI.deleteRelease(releaseId);
      if (!resp?.success) {
        throw new Error(resp?.error || resp?.message || 'Failed to delete release');
      }
      toast.success('Release deleted permanently');
      router.push('/admin/releases?status=rejected');
    } catch (e: any) {
      setError(e?.message || 'Failed to delete release');
    } finally {
      setDeletingRelease(false);
      setDeleteReleaseOpen(false);
    }
  };

  const handleConfirmTakedown = () => {
    if (!takedownTarget) return;
    void handleLifecycleAction(
      takedownTarget.target,
      takedownTarget.nextStatus,
      takedownTarget.trackIndex,
      {
        dspProviders: selectedTakedownProviders,
        note: takedownNote,
      }
    );
  };

  const firstTrack = Array.isArray(release?.tracks) ? release.tracks[0] : null;
  const releaseTracks = Array.isArray(release?.tracks)
    ? release.tracks
    : Array.isArray(release?.tracks?.data)
      ? release.tracks.data
      : [];
  const releaseArtworkUrl = resolveMediaUrl(
    release?.artworkUrl ||
      release?.artwork ||
      release?.coverArt ||
      release?.coverUrl ||
      release?.imageUrl ||
      firstTrack?.artworkUrl ||
      firstTrack?.artwork
  );
  const playableTracks = releaseTracks
    .map((track: any, sourceIndex: number) => ({
      id: String(track._id || track.id || sourceIndex),
      title: track.title || track.name || `Track ${sourceIndex + 1}`,
      artist: release?.primaryArtist || release?.artist || release?.ownerName,
      audioUrl: resolveMediaUrl(track.audioUrl || track.audioFile || track.audio || ''),
      artworkUrl: resolveMediaUrl(track.artworkUrl || track.artwork || releaseArtworkUrl),
      sourceIndex,
    }))
    .filter((track: any) => Boolean(track.audioUrl));
  const handlePlayTrack = (trackId: string) => {
    const nextIndex = playableTracks.findIndex((track: any) => track.id === trackId);
    if (nextIndex < 0) return;
    setPlayerIndex(nextIndex);
    setPlayerRequestId(value => value + 1);
    setPlayerVisible(true);
  };
  const handlePlayerDuration = useCallback((index: number, durationSeconds: number) => {
    const sourceIndex = playableTracks[index]?.sourceIndex;
    if (sourceIndex === undefined) return;
    setRelease((current: any) =>
      current
        ? {
            ...current,
            tracks: Array.isArray(current.tracks)
              ? current.tracks.map((item: any, itemIndex: number) =>
                  itemIndex === sourceIndex && !item.duration
                    ? { ...item, duration: durationSeconds }
                    : item
                )
              : current.tracks,
          }
        : current
    );
  }, [playableTracks]);
  const releaseGenre = release?.genre || firstTrack?.genre || '';
  const releaseSubgenre = release?.subGenre || release?.subgenre || firstTrack?.subGenre || firstTrack?.subgenre || '';
  const releaseCLine = release?.copyright || release?.cLine || release?.cline || release?.copyrightC || [
    firstTrack?.copyrightCYear,
    firstTrack?.copyrightC,
  ].filter(Boolean).join(' ');
  const releasePLine = release?.production || release?.pLine || release?.pline || release?.copyrightP || [
    firstTrack?.copyrightPYear,
    firstTrack?.copyrightP,
  ].filter(Boolean).join(' ');
  const rejectedReason = getReleaseRejectionReason(release?.rejectionReason || release?.rejectReason);
  const releaseUser = release?.userName || release?.ownerName || release?.artistName ||
    release?.ownerUser?.name || release?.user?.name || release?.owner?.name || release?.userId?.name || release?.ownerId?.name ||
    release?.createdBy?.name || release?.userEmail || release?.ownerEmail || release?.user?.email ||
    release?.ownerUser?.email || release?.owner?.email || release?.userId?.email || release?.ownerId?.email || release?.createdBy?.email;
  const releaseInfoRows = [
    ['Release Type', release?.releaseType],
    ['Release Title', release?.releaseTitle || release?.title],
    ['User', releaseUser],
    ['Primary Artist', release?.primaryArtist],
    ['Featuring', release?.featuring],
    ['Label', release?.label],
    ['UPC', release?.upc],
    ['Original Release Date', release?.originalReleaseDate],
    ['Digital Release Date', release?.releaseDate],
    ['Genre', releaseGenre],
    ['Subgenre', releaseSubgenre],
    ['C line', releaseCLine],
    ['P line', releasePLine],
    ['Rights Type', release?.rightsType],
    ['Created', release?.createdAt ? new Date(release.createdAt).toLocaleString() : ''],
    ['Updated', release?.updatedAt ? new Date(release.updatedAt).toLocaleString() : ''],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  const policyAcceptances = release?.policyAcceptances;
  const policyProofRows = policyAcceptances
    ? [
        [
          'YouTube Content ID policy',
          policyAcceptances.youtubeContentId?.accepted ? 'Accepted' : 'Not required',
        ],
        [
          'Facebook Rights Manager policy',
          policyAcceptances.facebookRightsManager?.accepted ? 'Accepted' : 'Not required',
        ],
        [
          'Final declaration',
          policyAcceptances.summaryDeclaration?.accepted ? 'Accepted' : 'Not accepted',
        ],
        [
          'Accepted at',
          policyAcceptances.acceptedAt
            ? new Date(policyAcceptances.acceptedAt).toLocaleString()
            : 'Not recorded',
        ],
        [
          'Accepted by',
          policyAcceptances.acceptedBy?.email ||
            policyAcceptances.acceptedBy?.name ||
            policyAcceptances.acceptedBy?.userId ||
            'Not recorded',
        ],
      ]
    : [];

  const InfoRow = ({ label, value }: { label: string; value: any }) => (
    <Stack direction="row" spacing={1} sx={{ my: 0.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160, fontWeight: 500 }}>
        {label}:
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: "break-word", fontWeight: 500 }}>
        {value ?? "—"}
      </Typography>
    </Stack>
  );

  // Render DSP chips with icons
  const renderDSPChips = (stores: string[]) => {
    if (!Array.isArray(stores) || stores.length === 0) {
      return <Typography variant="body2" color="text.secondary">None specified</Typography>;
    }

    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {stores.map((store, index) => {
          const dspName = getDspDisplayName(store);
          
          return (
            <Tooltip key={`${store}-${index}`} title={dspName}>
              <Chip
                avatar={<DspLogo value={store} alt={dspName} size={22} padding={0.25} />}
                label={dspName}
                size="small"
                sx={{
                  bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                }}
              />
            </Tooltip>
          );
        })}
      </Box>
    );
  };

  const flagFromCountryCode = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) return '🌐';
    return normalized
      .split('')
      .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
      .join('');
  };

  const renderTerritories = (territories: string[]) => {
    const list = Array.isArray(territories) && territories.length > 0 ? territories : ['Worldwide'];
    const visible = showAllTerritories ? list : list.slice(0, 30);
    const hiddenCount = Math.max(list.length - visible.length, 0);

    return (
      <Box sx={{ display: 'grid', gap: 1.25 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {visible.map((territory) => (
            <Chip
              key={territory}
              size="small"
              label={`${flagFromCountryCode(territory)} ${territory}`}
              variant="outlined"
              sx={{
                borderRadius: '10px',
                bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.74)',
                '& .MuiChip-label': { fontWeight: 750 },
              }}
            />
          ))}
        </Box>
        {list.length > 30 ? (
          <Button
            size="small"
            variant="text"
            onClick={() => setShowAllTerritories((value) => !value)}
            sx={{ justifySelf: 'flex-start', px: 0.5 }}
          >
            {showAllTerritories ? 'Show Less' : `Show ${hiddenCount} More`}
          </Button>
        ) : null}
      </Box>
    );
  };

  const renderAcrCloudReview = (acrCloud: any) => {
    if (!acrCloud) return null;

    const state = getAcrCloudState(acrCloud);
    const aiDetections = Array.isArray(acrCloud.aiDetection) ? acrCloud.aiDetection : [];
    const fingerprintMatches = Array.isArray(acrCloud.fingerprintMatches) ? acrCloud.fingerprintMatches : [];

    return (
      <Paper
        variant="outlined"
        sx={{
          mt: 1.5,
          p: { xs: 1.5, md: 2 },
          borderRadius: '18px',
          width: '100%',
          bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.72)',
          boxShadow: mode === 'dark' ? 'none' : '0 18px 44px rgba(15,23,42,0.06)',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap', mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>
              ACRCloud admin review
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Full scan payload. Visible to admins only.
            </Typography>
          </Box>
          <Chip
            size="small"
            icon={state === 'pending' ? <CircularProgress size={12} /> : <PlaylistAddCheck fontSize="small" />}
            label={getAcrCloudLabel(acrCloud)}
            color={getAcrCloudColor(acrCloud) as any}
            variant="outlined"
          />
        </Box>

        {acrCloud.lastError ? (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 1.5, borderColor: 'error.main' }}>
            <Typography variant="caption" color="error.main" fontWeight={700}>ACRCloud error</Typography>
            <Typography variant="body2">{acrCloud.lastError}</Typography>
          </Paper>
        ) : null}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' }, gap: 1.5 }}>
          <Box sx={{ minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: '14px', overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 1, bgcolor: 'action.hover' }}>
              <Typography variant="caption" fontWeight={700}>AI detection</Typography>
            </Box>
            <Box sx={{ p: 1.5, display: 'grid', gap: 1 }}>
              {aiDetections.length ? aiDetections.map((item: any, idx: number) => {
                const source = item.likelySource || item.likely_source || item.prediction || 'Unknown';
                const probability = item.aiProbability ?? item.ai_probability;
                const sourceProbabilities = item.sourceProbabilities || item.source_probabilities || [];
                return (
                  <Box key={`${source}-${idx}`} sx={{ display: 'grid', gap: 0.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body2" fontWeight={600}>{source}</Typography>
                      <Chip size="small" label={`AI ${formatAcrProbability(probability)}`} color="warning" variant="outlined" />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {[item.prediction, formatAcrTimeRange(item.start, item.end), item.stem].filter(Boolean).join(' | ')}
                    </Typography>
                    {sourceProbabilities.length ? (
                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                        {sourceProbabilities.slice(0, 4).map((probabilityItem: any, probabilityIdx: number) => (
                          <Chip
                            key={`${probabilityItem.source || 'source'}-${probabilityIdx}`}
                            size="small"
                            label={`${probabilityItem.source || 'Source'} ${formatAcrProbability(probabilityItem.probability)}`}
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    ) : null}
                  </Box>
                );
              }) : (
                <Typography variant="body2" color="text.secondary">No AI detection segments returned.</Typography>
              )}
            </Box>
          </Box>

          <Box sx={{ minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: '14px', overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 1, bgcolor: 'action.hover' }}>
              <Typography variant="caption" fontWeight={700}>Fingerprint, DSP and rights</Typography>
            </Box>
            <Box sx={{ p: 1.5, display: 'grid', gap: 1.25 }}>
              {fingerprintMatches.length ? fingerprintMatches.map((match: any, idx: number) => {
                const providerMetadata = getAcrCloudProviderMetadata(match.raw);
                const rightsClaims = getAcrCloudRightsClaims(match.raw);
                return (
                  <Box key={`${match.acrid || match.title || 'match'}-${idx}`} sx={{ display: 'grid', gap: 0.75 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{match.title || 'Untitled match'}</Typography>
                      {typeof match.score === 'number' ? <Chip size="small" label={`Score ${match.score}`} color="info" variant="outlined" /> : null}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                      {[match.artist, match.album, match.isrc ? `ISRC ${match.isrc}` : null, match.upc ? `UPC ${match.upc}` : null].filter(Boolean).join(' | ')}
                    </Typography>

                    {providerMetadata.length ? (
                      <Box sx={{ display: 'grid', gap: 0.75 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                          DSP / provider metadata
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                          {providerMetadata.map((provider) => (
                            <Tooltip
                              key={`${provider.provider}-${provider.trackId || provider.albumId || idx}`}
                              title={[
                                provider.isYoutube ? 'YouTube video ID. This is not a guaranteed Content ID enrollment flag.' : null,
                                provider.trackId ? `Track ${provider.trackId}` : null,
                                provider.albumId ? `Album ${provider.albumId}` : null,
                                provider.artistIds.length ? `Artists ${provider.artistIds.join(', ')}` : null,
                              ].filter(Boolean).join(' | ') || 'Provider metadata returned by ACRCloud'}
                            >
                              <Chip
                                size="small"
                                color={provider.isYoutube ? 'error' : 'default'}
                                label={`${provider.label}${provider.trackId ? `: ${provider.trackId}` : ''}`}
                                variant="outlined"
                                sx={{ maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                              />
                            </Tooltip>
                          ))}
                        </Box>
                      </Box>
                    ) : null}

                    {rightsClaims.length ? (
                      <Box sx={{ display: 'grid', gap: 0.75 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                          Rights / distributor claims
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                          {rightsClaims.slice(0, 6).map((claim: any, claimIdx: number) => {
                            const distributorName = claim?.distributor?.name || 'Distributor';
                            const territories = Array.isArray(claim?.territories) ? claim.territories.length : 0;
                            return (
                              <Tooltip
                                key={`${distributorName}-${claimIdx}`}
                                title={[
                                  claim?.rights_claim_policy ? `Policy ${claim.rights_claim_policy}` : null,
                                  territories ? `${territories} territories` : null,
                                ].filter(Boolean).join(' | ') || 'Rights claim returned by ACRCloud'}
                              >
                                <Chip size="small" label={distributorName} color="secondary" variant="outlined" />
                              </Tooltip>
                            );
                          })}
                        </Box>
                      </Box>
                    ) : null}
                  </Box>
                );
              }) : (
                <Typography variant="body2" color="text.secondary">No fingerprint match returned.</Typography>
              )}
            </Box>
          </Box>
        </Box>

        {/* {rawResult ? (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              Full raw ACRCloud response
            </Typography>
            <Box
              component="pre"
              sx={{
                mt: 0.75,
                p: 1.5,
                maxHeight: 320,
                overflow: 'auto',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                bgcolor: mode === 'dark' ? 'rgba(0, 0, 0, 0.28)' : 'rgba(0, 0, 0, 0.04)',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {rawResult}
            </Box>
          </Box>
        ) : null} */}
      </Paper>
    );
  };

  // Render tracks table
  const renderTracks = () => {
    // Check different possible track structures
    const tracks = releaseTracks;
    
    if (tracks.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No tracks found for this release
        </Typography>
      );
    }

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          Tracks ({tracks.length})
        </Typography>
        <Paper 
          elevation={0} 
          sx={{ 
            borderRadius: '22px',
            border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
            bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.025)' : 'rgba(255, 255, 255, 0.86)',
          }}
        >
          <Stack spacing={1.5} sx={{ p: { xs: 1.25, md: 2 } }}>
            {tracks.map((track: any, index: number) => {
              // Try different possible field names for audio URL
              const audioUrl = resolveMediaUrl(track.audioUrl || track.audioFile || track.audio || null);
              const trackId = track._id || track.id || index.toString();
              const title = track.title || track.name || `Track ${index + 1}`;
              const isrc = track.isrc || track.ISRC || 'No ISRC';
              const duration = track.duration || track.length || 0;
              const trackArtworkUrl = resolveMediaUrl(track.artworkUrl || track.artwork || releaseArtworkUrl);
              const isActivePlayerCard = playerVisible && playableTracks[playerIndex]?.sourceIndex === index;
              
              return (
                <Box 
                  key={trackId} 
                  sx={{ 
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 2,
                    p: { xs: 1.5, md: 2 },
                    borderRadius: '18px',
                    border: '1px solid',
                    borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
                    bgcolor: mode === 'dark' ? 'rgba(11, 16, 32, 0.42)' : 'rgba(248, 250, 252, 0.92)',
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 1.5, flex: '1 1 360px', minWidth: { xs: 0, sm: 320 } }}>
                    <Avatar
                      src={trackArtworkUrl || undefined}
                      variant="rounded"
                      sx={{
                        width: 44,
                        height: 44,
                        flexShrink: 0,
                        bgcolor: mode === 'dark' ? 'primary.dark' : 'primary.light',
                      }}
                    >
                      <MusicNote />
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body1" fontWeight={750} sx={{ overflowWrap: 'break-word' }}>
                        {title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {isrc}
                      </Typography>
                      {track.acrCloud && getAcrCloudSummary(track.acrCloud) && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                          {getAcrCloudSummary(track.acrCloud)}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'flex-end' }, gap: 1, flex: '1 1 320px', minWidth: 0, flexWrap: 'wrap' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatTrackDuration(duration)}
                    </Typography>
                    {track.acrCloud && (
                      <Chip
                        size="small"
                        icon={getAcrCloudState(track.acrCloud) === 'pending' ? <CircularProgress size={12} /> : <PlaylistAddCheck fontSize="small" />}
                        label={getAcrCloudLabel(track.acrCloud)}
                        color={getAcrCloudColor(track.acrCloud) as any}
                        variant="outlined"
                      />
                    )}
                    {track.dspLifecycleStatus && track.dspLifecycleStatus !== 'none' && (
                      <Chip
                        size="small"
                        label={`DSP: ${String(track.dspLifecycleStatus).replace(/_/g, ' ')}`}
                        color={track.dspLifecycleStatus === 'taken_down' ? 'error' : 'info'}
                        variant="outlined"
                      />
                    )}
                    {(() => {
                      const next = getNextLifecycleStatus(track.dspLifecycleStatus);
                      const key = `track:${index}`;
                      return (
                        <Button
                          size="small"
                          variant="outlined"
                          color={next.status === 'takedown_requested' || next.status === 'taken_down' ? 'error' : 'success'}
                          startIcon={next.status === 'redelivery_requested' || next.status === 'redelivered' ? <Replay fontSize="small" /> : <PlaylistAddCheck fontSize="small" />}
                          onClick={() =>
                            next.status === 'takedown_requested'
                              ? openTakedownDialog('track', next.status, title, index, track)
                              : handleLifecycleAction('track', next.status, index)
                          }
                          disabled={Boolean(lifecycleSaving)}
                          sx={{ minHeight: 32, fontWeight: 800 }}
                        >
                          {lifecycleSaving === key ? <CircularProgress size={14} /> : next.label}
                        </Button>
                      );
                    })()}
                    {audioUrl && (
                      <IconButton
                        size="small"
                        aria-label={`Play ${title}`}
                        onClick={() => handlePlayTrack(String(trackId))}
                        sx={{
                          bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        }}
                      >
                        <PlayArrow />
                      </IconButton>
                    )}
                    <Tooltip title="Delete track from this release">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          aria-label="Delete track from release"
                          onClick={() => setTrackDeleteTarget({ index, title })}
                          disabled={deletingTrack || release?.status === 'approved'}
                          sx={{
                            bgcolor: mode === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.06)',
                          }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                  {isActivePlayerCard && playableTracks.length > 0 && (
                    <Box sx={{ flex: '1 1 100%', minWidth: 0, pt: 0.5 }}>
                      <PremiumAudioPlayer
                        tracks={playableTracks}
                        requestedIndex={playerIndex}
                        requestId={playerRequestId}
                        onDuration={handlePlayerDuration}
                        onActiveIndexChange={setPlayerIndex}
                      />
                    </Box>
                  )}
                  {track.acrCloud ? (
                    <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
                      {renderAcrCloudReview(track.acrCloud)}
                    </Box>
                  ) : null}
                </Box>
              );
            })}
          </Stack>
        </Paper>
      </Box>
    );
  };

  if (loading) {
    return (
      <Container maxWidth={false} sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth={false} sx={{ py: 4 }}>
        <Paper elevation={0} sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="error" variant="h6" sx={{ mb: 2 }}>
            Error Loading Release
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {error}
          </Typography>
          <Button 
            variant="outlined" 
            onClick={() => router.back()}
            startIcon={<ArrowBack />}
          >
            Go Back
          </Button>
        </Paper>
      </Container>
    );
  }

  if (!release) {
    return (
      <Container maxWidth={false} sx={{ py: 4 }}>
        <Paper elevation={0} sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Release Not Found
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            The requested release could not be found.
          </Typography>
          <Button 
            variant="outlined" 
            component={Link} 
            href="/admin/releases"
            startIcon={<ArrowBack />}
          >
            Back to Releases
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => router.back()}
          variant="outlined"
          sx={{
            borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.23)',
          }}
        >
          Back to Releases
        </Button>
        
        <Chip
          icon={
            getNormalizedReleaseStatus(release.status) === "approved" ? <CheckCircle /> :
            getNormalizedReleaseStatus(release.status) === "pending" ? <Pending /> :
            getNormalizedReleaseStatus(release.status) === "in_process" ? <Sync /> :
            <Cancel />
          }
          label={getReleaseStatusLabel(release.status)}
          color={statusColor}
          size="medium"
          sx={{ fontWeight: 600 }}
        />
      </Box>

      {/* Release Header */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 3, 
          mb: 3,
          borderRadius: 3,
          border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
          backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
          {/* Cover Image */}
          <Box
            component="img"
            src={releaseArtworkUrl || '/placeholder-artwork.jpg'}
            alt={`${release.releaseTitle || 'Release'} Cover`}
            sx={{
              width: { xs: '100%', md: 200 },
              height: { xs: 200, md: 200 },
              borderRadius: 2,
              objectFit: 'cover',
              border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
              bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            }}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/placeholder-artwork.jpg';
            }}
          />
          
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
              {release.releaseTitle || 'Untitled Release'}
            </Typography>
            
            <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
              by {release.primaryArtist || 'Unknown Artist'}
            </Typography>
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              <Chip 
                label={`Label: ${release.label || 'N/A'}`} 
                size="small" 
                variant="outlined" 
              />
              <Chip 
                label={`UPC: ${release.upc || 'N/A'}`} 
                size="small" 
                variant="outlined" 
              />
              <Chip 
                label={`${Array.isArray(release.tracks) ? release.tracks.length : 0} Tracks`} 
                size="small" 
                variant="outlined" 
              />
              {release.dspLifecycleStatus && release.dspLifecycleStatus !== 'none' && (
                <Chip
                  label={`DSP: ${String(release.dspLifecycleStatus).replace(/_/g, ' ')}`}
                  size="small"
                  color={release.dspLifecycleStatus === 'taken_down' ? 'error' : 'info'}
                  variant="outlined"
                />
              )}
            </Box>
            
            {release.status === "rejected" && rejectedReason && (
              <Card 
                elevation={0} 
                sx={{ 
                  mb: 2,
                  border: `1px solid ${mode === 'dark' ? 'rgba(244, 67, 54, 0.3)' : 'rgba(244, 67, 54, 0.3)'}`,
                  backgroundColor: mode === 'dark' ? 'rgba(244, 67, 54, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                }}
              >
                <CardContent>
                  <Typography variant="subtitle2" color="error" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Info sx={{ mr: 1 }} /> Rejection Reason
                  </Typography>
                  <Typography variant="body2">
                    {rejectedReason}
                  </Typography>
                </CardContent>
              </Card>
            )}
            
            {!["approved", "in_process"].includes(getNormalizedReleaseStatus(release.status)) && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<ThumbUp />}
                  onClick={handleApprove}
                  disabled={saving}
                  sx={{ minWidth: 140 }}
                >
                  {saving ? <CircularProgress size={20} /> : release.status === 'rejected' ? 'Approve Again' : 'Approve'}
                </Button>
                {release.status !== 'rejected' && (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<ThumbDown />}
                    onClick={() => setRejectOpen(true)}
                    disabled={saving}
                    sx={{ minWidth: 120 }}
                  >
                    Reject
                  </Button>
                )}
                {release.status === 'rejected' && (
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<Delete />}
                    onClick={() => setDeleteReleaseOpen(true)}
                    disabled={deletingRelease}
                    sx={{ minWidth: 170 }}
                  >
                    {deletingRelease ? <CircularProgress size={20} /> : 'Delete Permanently'}
                  </Button>
                )}
              </Box>
            )}
            {getNormalizedReleaseStatus(release.status) === "approved" && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<Pending />}
                  onClick={handleMoveToPending}
                  disabled={saving}
                  sx={{ minWidth: 170 }}
                >
                  Move to Pending
                </Button>
              </Box>
            )}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
              {(() => {
                const next = getNextLifecycleStatus(release.dspLifecycleStatus);
                return (
                  <Button
                    variant="outlined"
                    color={next.status === 'takedown_requested' || next.status === 'taken_down' ? 'error' : 'success'}
                    startIcon={next.status === 'redelivery_requested' || next.status === 'redelivered' ? <Replay /> : <PlaylistAddCheck />}
                    onClick={() =>
                      next.status === 'takedown_requested'
                        ? openTakedownDialog('release', next.status, release.releaseTitle || 'this release')
                        : handleLifecycleAction('release', next.status)
                    }
                    disabled={Boolean(lifecycleSaving)}
                    sx={{ minWidth: 170 }}
                  >
                    {lifecycleSaving === 'release' ? <CircularProgress size={20} /> : next.label}
                  </Button>
                );
              })()}
            </Box>
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
        {/* Release Information */}
        <Box sx={{ flex: { xs: 1, md: 2 } }}>
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3, 
              mb: 3,
              borderRadius: 3,
              border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
              backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            }}
          >
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Release Information
            </Typography>
            
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: { xs: 0.5, sm: 2 } }}>
              {releaseInfoRows.map(([label, value]) => (
                <InfoRow key={String(label)} label={String(label)} value={value} />
              ))}
            </Box>
          </Paper>
          
          {/* Tracks */}
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3,
              borderRadius: 3,
              border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
              backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            }}
          >
            {renderTracks()}
          </Paper>
        </Box>
        
        {/* Distribution Info */}
        <Box sx={{ flex: { xs: 1, md: 1 } }}>
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3, 
              mb: 3,
              borderRadius: 3,
              border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
              backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            }}
          >
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Distribution
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                DSPs
              </Typography>
              {renderDSPChips(release.stores || [])}
            </Box>
            
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Territories
              </Typography>
              {renderTerritories(release.territories || [])}
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Policy acceptance proof
              </Typography>
              {policyProofRows.length ? (
                policyProofRows.map(([label, value]) => (
                  <InfoRow key={String(label)} label={String(label)} value={value} />
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No policy proof recorded for this legacy release.
                </Typography>
              )}
            </Box>
          </Paper>
          
          {/* Metadata */}
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3,
              borderRadius: 3,
              border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
              backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            }}
          >
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Metadata
            </Typography>
            
            <InfoRow label="Created" value={new Date(release.createdAt).toLocaleString()} />
            <InfoRow label="Updated" value={new Date(release.updatedAt).toLocaleString()} />
            {release.approvedAt && (
              <InfoRow label="Approved" value={new Date(release.approvedAt).toLocaleString()} />
            )}
            {release.rejectedAt && (
              <InfoRow label="Rejected" value={new Date(release.rejectedAt).toLocaleString()} />
            )}
          </Paper>
        </Box>
      </Box>

      <Dialog open={deleteReleaseOpen} onClose={() => !deletingRelease && setDeleteReleaseOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Release Permanently</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently deletes "{release.releaseTitle || release.title || 'this release'}" from the database and cancels active delivery jobs. If a Broma draft id is stored, the Broma draft delete API is called first.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteReleaseOpen(false)} disabled={deletingRelease}>
            Cancel
          </Button>
          <Button onClick={handleDeleteRelease} color="error" variant="contained" disabled={deletingRelease}>
            {deletingRelease ? <CircularProgress size={20} /> : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Takedown Dialog */}
      <Dialog open={!!takedownTarget} onClose={() => !lifecycleSaving && setTakedownTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm DSP Takedown</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            This will request takedown for {takedownTarget?.title || 'this item'} from the selected DSP providers. This is a destructive distribution action and should be used only when rights or delivery review requires it.
          </DialogContentText>
          {takedownTarget?.providers.length ? (
            <Stack spacing={1.25}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedTakedownProviders.length === takedownTarget.providers.length}
                    indeterminate={selectedTakedownProviders.length > 0 && selectedTakedownProviders.length < takedownTarget.providers.length}
                    onChange={(event) => {
                      setSelectedTakedownProviders(event.target.checked ? takedownTarget.providers : []);
                    }}
                  />
                }
                label="Select all providers"
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.75 }}>
                {takedownTarget.providers.map((provider) => (
                  <FormControlLabel
                    key={provider}
                    control={
                      <Checkbox
                        checked={selectedTakedownProviders.includes(provider)}
                        onChange={(event) => {
                          setSelectedTakedownProviders((current) =>
                            event.target.checked
                              ? Array.from(new Set([...current, provider]))
                              : current.filter((item) => item !== provider)
                          );
                        }}
                      />
                    }
                    label={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <DspLogo value={provider} alt={getDspDisplayName(provider)} size={22} padding={0.2} />
                        <Typography variant="body2" fontWeight={750}>{getDspDisplayName(provider)}</Typography>
                      </Stack>
                    }
                  />
                ))}
              </Box>
            </Stack>
          ) : (
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              No DSP providers are stored on this release.
            </Typography>
          )}
          <TextField
            margin="dense"
            label="Admin note"
            fullWidth
            multiline
            rows={3}
            value={takedownNote}
            onChange={(event) => setTakedownNote(event.target.value)}
            helperText="Stored with the DSP lifecycle update."
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTakedownTarget(null)} disabled={Boolean(lifecycleSaving)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmTakedown}
            color="error"
            variant="contained"
            disabled={Boolean(lifecycleSaving) || !selectedTakedownProviders.length}
          >
            {lifecycleSaving ? <CircularProgress size={20} /> : 'Request Takedown'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Track Dialog */}
      <Dialog open={!!trackDeleteTarget} onClose={() => !deletingTrack && setTrackDeleteTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Track From Release</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            This removes "{trackDeleteTarget?.title || 'this track'}" from the submitted release for admin review. It does not approve or reject the release.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Admin reason"
            fullWidth
            multiline
            rows={3}
            value={trackDeleteReason}
            onChange={(e) => setTrackDeleteReason(e.target.value)}
            helperText="Stored with release audit data."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTrackDeleteTarget(null)} disabled={deletingTrack}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteReleaseTrack}
            color="error"
            variant="contained"
            disabled={deletingTrack}
          >
            {deletingTrack ? <CircularProgress size={20} /> : 'Delete Track'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)}>
        <DialogTitle>Reject Release</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Please provide a reason for rejecting this release. This will be sent to the artist.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Rejection Reason"
            fullWidth
            multiline
            rows={4}
            variant="outlined"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button 
            onClick={handleReject} 
            color="error" 
            variant="contained"
            disabled={saving || !rejectReason.trim()}
          >
            {saving ? <CircularProgress size={20} /> : 'Reject Release'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
