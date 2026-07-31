'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormControlLabel,
  Switch,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  Chip,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import { toast } from 'sonner';
import { adminAPI } from '@/services/api';

interface Track {
  _id?: string;
  canonicalTrackId?: string;
  id?: string;
  isrc?: string;
  title: string;
  artistName?: string;
}

interface SocialPlatformUploadDialogProps {
  open: boolean;
  onClose: () => void;
  platform: 'youtube' | 'facebook';
  release: any;
  tracks: Track[];
  onSuccess?: () => void;
}

interface TrackProgress {
  trackId: string;
  title: string;
  status: 'pending' | 'downloading' | 'downloaded' | 'generating' | 'generated' | 'uploading' | 'uploaded' | 'failed';
  error?: string;
  externalId?: string;
  videoProgress?: number;
  uploadBytes?: number;
  uploadTotalBytes?: number;
  uploadPhase?: string;
}

interface BatchProgress {
  sessionId: string;
  platform: string;
  step: 'downloading' | 'generating' | 'uploading' | 'done' | 'failed';
  overallProgress: number;
  tracks: TrackProgress[];
  error?: string;
}

const STEP_LABELS: Record<string, string> = {
  downloading: 'Downloading assets...',
  generating: 'Generating videos...',
  uploading: 'Uploading to platform...',
  done: 'Upload complete!',
  failed: 'Upload failed',
};

const STATUS_LABELS: Record<string, (p?: number) => string> = {
  pending: () => 'Waiting',
  downloading: () => 'Downloading...',
  downloaded: () => 'Downloaded',
  generating: (p) => p != null ? `Generating ${p}%` : 'Generating...',
  generated: () => 'Video ready',
  uploading: (p) => p != null ? `Uploading ${p}%` : 'Uploading...',
  uploaded: () => 'Uploaded',
  failed: () => 'Failed',
};

const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min without update = stale
const STORAGE_KEY = 'social_upload_session';

function saveSession(data: { sessionId: string; platform: string; releaseId: string; title: string }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); } catch {}
}

function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function getSavedSession(): { sessionId: string; platform: string; releaseId: string; title: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expire after 2 hours
    if (Date.now() - (data.savedAt || 0) > 2 * 60 * 60 * 1000) { clearSession(); return null; }
    return data;
  } catch { return null; }
}

export default function SocialPlatformUploadDialog({
  open,
  onClose,
  platform,
  release,
  tracks,
  onSuccess,
}: SocialPlatformUploadDialogProps) {
  const [title, setTitle] = useState(release?.title || release?.releaseTitle || '');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [preset, setPreset] = useState<'bars' | 'circular'>('bars');
  const [color, setColor] = useState<'cyan' | 'green' | 'pink' | 'purple' | 'red' | 'white'>('cyan');
  const [albumMode, setAlbumMode] = useState(tracks.length > 1);
  const [scheduleAt, setScheduleAt] = useState('');
  const [verifyStatus, setVerifyStatus] = useState<{ loading: boolean; connected?: boolean; channelName?: string; error?: string }>({ loading: false });
  const [facebookPages, setFacebookPages] = useState<Array<{ id: string; name: string; picture?: string }>>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [pagesLoading, setPagesLoading] = useState(false);
  const [phase, setPhase] = useState<'form' | 'progress' | 'done'>('form');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<string | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());
  const speedCache = useRef<Record<string, { lastBytes: number; lastTime: number; bps: number }>>({});

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  };

  const formatSpeed = (bps: number) => {
    if (bps < 1) return '';
    if (bps < 1024) return `${bps.toFixed(0)} B/s`;
    if (bps < 1048576) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${(bps / 1048576).toFixed(1)} MB/s`;
  };

  const formatETA = (remaining: number, bps: number): string => {
    if (bps <= 0 || remaining <= 0) return '';
    const secs = remaining / bps;
    if (secs < 60) return `${Math.ceil(secs)}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.ceil(secs % 60)}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  };

  const platformLabel = platform === 'youtube' ? 'YouTube' : 'Facebook';

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    // Restore session from localStorage
    const saved = getSavedSession();
    if (saved && saved.releaseId === release?._id && saved.platform === platform) {
      sessionRef.current = saved.sessionId;
      setPhase('progress');
      const savedTracks: TrackProgress[] = tracks.map(t => ({
        trackId: t._id || '',
        title: t.title,
        status: 'pending',
      }));
      setProgress({
        sessionId: saved.sessionId,
        platform: platform as any,
        step: 'downloading',
        overallProgress: 0,
        tracks: savedTracks,
      });
    }
    // Fetch Facebook pages if platform is facebook
    if (platform === 'facebook') {
      setPagesLoading(true);
      adminAPI.getFacebookPages().then(resp => {
        if (resp.success && resp.data?.length) {
          setFacebookPages(resp.data);
          setSelectedPageId(resp.data[0].id);
        }
        setPagesLoading(false);
      }).catch(() => setPagesLoading(false));
    }
  }, [open, release?._id, platform, tracks]);

  useEffect(() => {
    if (!open) {
      stopPolling();
      sessionRef.current = null;
      setPhase('form');
      setProgress(null);
      setError(null);
      setVerifyStatus({ loading: false });
      setTitle(release?.title || release?.releaseTitle || '');
      setDescription('');
      setVisibility('public');
      setAlbumMode(tracks.length > 1);
      setScheduleAt('');
      clearSession();
    }
  }, [open, release, tracks.length, stopPolling]);

  useEffect(() => {
    if (phase !== 'progress') {
      stopPolling();
      return;
    }

    // Reset timeout tracker
    lastUpdateRef.current = Date.now();

    // Start a timeout watcher — if no status update for POLL_TIMEOUT_MS, assume session is stale
    const timeoutWatcher = setTimeout(() => {
      const elapsed = Date.now() - lastUpdateRef.current;
      if (elapsed >= POLL_TIMEOUT_MS && phase === 'progress') {
        setError('Upload session timed out. The server may have restarted. Please try again.');
        setPhase('done');
        stopPolling();
        toast.error('Upload session timed out');
      }
    }, POLL_TIMEOUT_MS + 5000);
    pollTimeoutRef.current = timeoutWatcher;

    const id = setInterval(async () => {
      if (!sessionRef.current) return;
      try {
        const resp = await adminAPI.getSocialUploadProgress(sessionRef.current);
        if (resp?.success && resp.data) {
          lastUpdateRef.current = Date.now();
          setProgress(resp.data);
          if (resp.data.step === 'done') {
            setPhase('done');
            stopPolling();
            const tracks = (resp.data as any).tracks || [];
            const failedCount = tracks.filter((t: any) => t.status === 'failed').length;
            const uploadedCount = tracks.filter((t: any) => t.status === 'uploaded').length;
            if (failedCount > 0 && uploadedCount === 0) {
              setError('All tracks failed to upload. See individual track errors below.');
              toast.error('All tracks failed');
            } else if (failedCount > 0) {
              toast.warning(`Uploaded ${uploadedCount} track(s), ${failedCount} failed`);
              onSuccess?.();
            } else {
              toast.success(`Uploaded to ${platformLabel} successfully`);
              onSuccess?.();
            }
          } else if (resp.data.step === 'failed') {
            setPhase('progress');
            setError(resp.data.error || 'Upload failed');
            stopPolling();
            toast.error(resp.data.error || 'Upload failed');
          }
        } else if (resp && !resp.success) {
          // Session not found (e.g. server restart) — mark as failed
          setError(resp.message || 'Upload session lost. The server may have restarted.');
          setPhase('done');
          stopPolling();
          toast.error('Upload session lost');
        }
      } catch {
        // poll error — keep trying
      }
    }, 1500);
    pollingRef.current = id;
    return () => clearInterval(id);
  }, [phase, platformLabel, onSuccess, stopPolling]);

  const handleVerify = async () => {
    setVerifyStatus({ loading: true });
    const result = await adminAPI.verifyYoutubeConnection();
    if (result.success && result.data) {
      setVerifyStatus({
        loading: false,
        connected: result.data.connected,
        channelName: result.data.channelName,
        error: result.data.error,
      });
      if (result.data.connected) {
        toast.success(`Connected as ${result.data.channelName}`);
      } else {
        toast.error(result.data.error || 'Not connected');
      }
    } else {
      setVerifyStatus({ loading: false, connected: false, error: result.message || 'Verification failed' });
      toast.error(result.message || 'Verification failed');
    }
  };

  const handleDeliver = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    setError(null);
    setPhase('progress');

    const initialTracks: TrackProgress[] = tracks.map(t => ({
      trackId: t._id || '',
      title: t.title,
      status: 'pending',
    }));

    // Show initial state immediately
    const initialSession = `session_${Date.now()}`;
    sessionRef.current = initialSession;

    setProgress({
      sessionId: initialSession,
      platform,
      step: 'downloading',
      overallProgress: 0,
      tracks: initialTracks,
    });

    try {
      const result = await adminAPI.startSocialUpload({
        releaseId: release?._id || '',
        tracks: tracks.map(t => ({
          trackId: t.canonicalTrackId || t._id || t.id || '',
          title: t.title,
          artist: t.artistName || '',
          isrc: t.isrc || '',
        })),
        platform,
          config: {
            title,
            description,
            visibility,
            preset,
            color,
            albumMode: albumMode ? 'album' : undefined,
          ...(scheduleAt ? { scheduleAt: new Date(scheduleAt).toISOString() } : {}),
          ...(platform === 'facebook' && selectedPageId ? { targetPageId: selectedPageId } : {}),
        },
      });

      const realSessionId = result.data?.sessionId;
      if (result.success && realSessionId) {
        sessionRef.current = realSessionId;
        saveSession({ sessionId: realSessionId, platform, releaseId: release?._id || '', title: title || '' });
        setProgress(prev => prev ? { ...prev, sessionId: realSessionId } : prev);
      } else {
        setError(result.message || 'Failed to start upload');
        setPhase('done');
        toast.error(result.message || 'Failed to start upload');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start upload');
      setPhase('done');
      toast.error(err instanceof Error ? err.message : 'Failed to start upload');
    }
  };

  const handleCancel = async () => {
    if (!sessionRef.current) return;
    setError('Cancelling...');
    await adminAPI.cancelSocialUpload(sessionRef.current);
    stopPolling();
    sessionRef.current = null;
    clearSession();
    setPhase('done');
    setError('Upload cancelled by admin');
    toast.error('Upload cancelled');
  };

  const handleClose = () => {
    stopPolling();
    sessionRef.current = null;
    clearSession();
    onClose();
  };

  const showForm = phase === 'form';
  const showProgress = phase === 'progress' || phase === 'done';
  const loading = phase === 'progress';

  return (
    <Dialog open={open} onClose={loading ? undefined : handleClose} disableEscapeKeyDown={loading} maxWidth="sm" fullWidth>
      <DialogTitle>
        Deliver to {platformLabel}
      </DialogTitle>
      <DialogContent>
        {showForm && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            <TextField
              label="Video Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="Leave empty for auto-generated description"
            />
            <FormControl fullWidth>
              <InputLabel>Visibility</InputLabel>
              <Select
                value={visibility}
                label="Visibility"
                onChange={(e) => setVisibility(e.target.value as any)}
              >
                <MenuItem value="public">Public</MenuItem>
                <MenuItem value="unlisted">Unlisted</MenuItem>
                <MenuItem value="private">Private</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Visual Style</InputLabel>
              <Select
                value={preset}
                label="Visual Style"
                onChange={(e) => setPreset(e.target.value as any)}
              >
                <MenuItem value="bars">Waveform Bars</MenuItem>
                <MenuItem value="circular">Circular Ring</MenuItem>
              </Select>
            </FormControl>

            {preset === 'circular' && (
              <FormControl fullWidth>
                <InputLabel>Color Theme</InputLabel>
                <Select
                  value={color}
                  label="Color Theme"
                  onChange={(e) => setColor(e.target.value as any)}
                >
                  <MenuItem value="cyan">Cyan</MenuItem>
                  <MenuItem value="green">Green</MenuItem>
                  <MenuItem value="pink">Pink</MenuItem>
                  <MenuItem value="purple">Purple</MenuItem>
                  <MenuItem value="red">Red</MenuItem>
                  <MenuItem value="white">White</MenuItem>
                </Select>
              </FormControl>
            )}

            <TextField
              label="Schedule Upload (optional)"
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            {tracks.length > 1 && (
              <FormControlLabel
                control={<Switch checked={albumMode} onChange={(e) => setAlbumMode(e.target.checked)} />}
                label="Combine into single album video"
              />
            )}

            <Box>
              <Typography variant="caption" color="text.secondary">
                {albumMode ? 'Album track list' : 'Tracks to be uploaded'} ({tracks.length}):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {tracks.map((t, idx) => (
                  <Chip key={t._id || t.isrc || idx} label={t.title} size="small" variant="outlined" />
                ))}
              </Box>
            </Box>

            {platform === 'facebook' && (
              <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Facebook Page
                </Typography>
                {pagesLoading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={14} />
                    <Typography variant="caption" color="text.secondary">Loading pages...</Typography>
                  </Box>
                ) : facebookPages.length > 0 ? (
                  <FormControl fullWidth size="small">
                    <InputLabel>Select Page</InputLabel>
                    <Select
                      value={selectedPageId}
                      label="Select Page"
                      onChange={(e) => setSelectedPageId(e.target.value)}
                    >
                      {facebookPages.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {p.picture ? (
                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                              <Box component="img" src={p.picture} sx={{ width: 20, height: 20, borderRadius: '50%' }} />
                              {p.name}
                            </Box>
                          ) : p.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    No Facebook pages configured. Set up pages via{' '}
                    <Typography component="a" href="/admin/settings?tab=dsp" color="primary" variant="caption" sx={{ textDecoration: 'underline' }}>
                      DSP Settings
                    </Typography>
                    {' '}or see{' '}
                    <Typography component="a" href="/api/setup-social-delivery" target="_blank" color="primary" variant="caption" sx={{ textDecoration: 'underline' }}>
                      setup guide
                    </Typography>.
                  </Typography>
                )}
              </Box>
            )}

            {platform === 'youtube' && (
              <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleVerify}
                    disabled={verifyStatus.loading}
                    startIcon={verifyStatus.loading ? <CircularProgress size={14} /> : undefined}
                  >
                    {verifyStatus.loading ? 'Verifying...' : 'Verify YouTube Connection'}
                  </Button>
                  {verifyStatus.connected === true && (
                    <Chip label={`Connected: ${verifyStatus.channelName}`} size="small" color="success" variant="outlined" />
                  )}
                  {verifyStatus.connected === false && (
                    <Chip label="Not connected" size="small" color="error" variant="outlined" />
                  )}
                </Box>
                {verifyStatus.error && verifyStatus.connected === false && (
                  <Typography variant="caption" color="error">
                    {verifyStatus.error}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        )}

        {showProgress && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {error ? STEP_LABELS.failed : STEP_LABELS[progress?.step || 'downloading']}
            </Typography>

            <LinearProgress
              variant="determinate"
              value={progress?.overallProgress || 0}
              sx={{ height: 8, borderRadius: 4, mb: 2 }}
            />

            <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
              {progress?.overallProgress || 0}% complete
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {(progress?.tracks || []).map((track, idx) => (
                <Box
                  key={track.trackId || idx}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1,
                    borderRadius: 1,
                    bgcolor: track.status === 'failed' ? 'rgba(255,0,0,0.04)' : (theme) => theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                  }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      flexShrink: 0,
                      bgcolor:
                        track.status === 'uploaded' ? 'success.main' :
                        track.status === 'failed' ? 'error.main' :
                        track.status === 'pending' ? 'grey.300' :
                        loading ? 'primary.main' : 'grey.300',
                      '@keyframes pulse': {
                        '0%': { opacity: 1 },
                        '50%': { opacity: 0.4 },
                        '100%': { opacity: 1 },
                      },
                      animation: loading && (
                        track.status === 'uploading' ||
                        track.status === 'generating' ||
                        track.status === 'downloading'
                      ) ? 'pulse 1.5s infinite' : 'none',
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {track.title}
                    </Typography>
                    <Typography variant="caption" color={
                      track.status === 'failed' ? 'error.main' :
                      track.status === 'uploaded' ? 'success.main' :
                      'text.secondary'
                    }>
                      {track.error || STATUS_LABELS[track.status]?.(track.videoProgress ?? undefined)}
                    </Typography>
                    {track.status === 'uploading' && track.uploadTotalBytes != null && track.uploadTotalBytes > 0 && (() => {
                      const cache = speedCache.current;
                      const tid = track.trackId;
                      const now = Date.now();
                      if (!cache[tid]) cache[tid] = { lastBytes: 0, lastTime: now, bps: 0 };
                      const last = cache[tid];
                      if (track.uploadBytes != null && track.uploadBytes > last.lastBytes) {
                        const elapsed = (now - last.lastTime) / 1000;
                        if (elapsed > 0) {
                          const instantBps = (track.uploadBytes - last.lastBytes) / elapsed;
                          last.bps = last.bps > 0 ? last.bps * 0.7 + instantBps * 0.3 : instantBps;
                        }
                        last.lastBytes = track.uploadBytes;
                        last.lastTime = now;
                      }
                      const bps = last?.bps || 0;
                      const remaining = track.uploadTotalBytes - (track.uploadBytes || 0);
                      return (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                          {formatBytes(track.uploadBytes || 0)} / {formatBytes(track.uploadTotalBytes)}
                          {bps > 0 ? ` · ${formatSpeed(bps)}` : ''}
                          {bps > 0 && remaining > 0 ? ` · ${formatETA(remaining, bps)} remaining` : ''}
                        </Typography>
                      );
                    })()}
                  </Box>
                  {track.externalId && (
                    <Chip
                      label={track.externalId.slice(0, 8)}
                      size="small"
                      variant="outlined"
                      color="success"
                    />
                  )}
                </Box>
              ))}
            </Box>

            {error && (
              <Typography color="error" variant="body2" sx={{ mt: 1.5, p: 1.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(211,47,47,0.15)' : 'error.50', borderRadius: 1 }}>
                {error}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {showForm && (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="button" variant="contained" color="primary" onClick={handleDeliver}>
              Deliver to {platformLabel}
            </Button>
          </>
        )}
        {showProgress && (
          <>
            {loading && (
              <Button color="error" variant="outlined" onClick={handleCancel} size="small">
                Cancel Upload
              </Button>
            )}
            <Button
              onClick={handleClose}
              disabled={loading}
              color={error ? 'error' : 'primary'}
              variant={loading ? 'text' : 'contained'}
            >
              {loading ? (
                <>
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 12, height: 12, borderRadius: '50%', border: '2px solid',
                        borderColor: 'currentColor',
                        borderTopColor: 'transparent',
                        animation: 'spin 0.8s linear infinite',
                        '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } },
                      }}
                    />
                    Processing...
                  </Box>
                </>
              ) : (
                'Close'
              )}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
