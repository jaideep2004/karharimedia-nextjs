'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  LinearProgress,
  Chip,
} from '@mui/material';
import { toast } from 'sonner';
import { adminAPI } from '@/services/api';

interface TrackProgress {
  trackId: string;
  title: string;
  status: string;
  error?: string;
  videoProgress?: number;
}

interface BatchProgress {
  sessionId: string;
  platform: string;
  step: string;
  overallProgress: number;
  tracks: TrackProgress[];
  error?: string;
}

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

interface GlobalSocialUploadDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function GlobalSocialUploadDialog({ open, onClose }: GlobalSocialUploadDialogProps) {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopPolling();
      sessionRef.current = null;
      setProgress(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Read saved session from localStorage
    try {
      const raw = localStorage.getItem('social_upload_session');
      if (raw) {
        const data = JSON.parse(raw);
        if (Date.now() - (data.savedAt || 0) < 2 * 60 * 60 * 1000) {
          sessionRef.current = data.sessionId;
        }
      }
    } catch {}

    if (!sessionRef.current) {
      setLoading(false);
      setError('No active upload session found');
      return;
    }

    // Fire an immediate fetch so the dialog isn't blank for 1500ms
    adminAPI.getSocialUploadProgress(sessionRef.current).then(resp => {
      if (resp?.success && resp.data) {
        setProgress(resp.data);
        if (resp.data.step === 'done') {
          toast.success('Upload complete!');
        } else if (resp.data.step === 'failed') {
          setError(resp.data.error || 'Upload failed');
        }
      } else {
        setError('Upload session expired or server restarted');
      }
    }).catch(() => {}).finally(() => setLoading(false));

    const id = setInterval(async () => {
      if (!sessionRef.current) return;
      try {
        const resp = await adminAPI.getSocialUploadProgress(sessionRef.current);
        if (resp?.success && resp.data) {
          setProgress(resp.data);
          if (resp.data.step === 'done') {
            stopPolling();
            toast.success('Upload complete!');
          } else if (resp.data.step === 'failed') {
            setError(resp.data.error || 'Upload failed');
            stopPolling();
          }
        } else {
          stopPolling();
          setError('Upload session expired or server restarted');
        }
      } catch {
        // poll error — keep trying
      }
    }, 1500);
    pollingRef.current = id;
    return () => clearInterval(id);
  }, [open, stopPolling]);

  const handleCancel = async () => {
    if (!sessionRef.current) return;
    setError('Cancelling...');
    await adminAPI.cancelSocialUpload(sessionRef.current);
    localStorage.removeItem('social_upload_session');
    stopPolling();
    setError('Upload cancelled');
    toast.error('Upload cancelled');
  };

  const isDone = progress?.step === 'done';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Social Upload Progress</DialogTitle>
      <DialogContent>
        {loading && !progress && !error && (
          <Typography color="text.secondary" variant="body2">Connecting...</Typography>
        )}

        {error && !progress && (
          <Typography color="error" variant="body2">{error}</Typography>
        )}

        {progress && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {progress.platform === 'youtube' ? 'YouTube' : 'Facebook'} — {progress.step === 'done' ? 'Complete' : progress.step === 'failed' ? 'Failed' : 'In Progress'}
            </Typography>

            <LinearProgress
              variant="determinate"
              value={progress.overallProgress || 0}
              sx={{ height: 8, borderRadius: 4, mb: 1 }}
            />

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              {progress.overallProgress || 0}%
            </Typography>

            {(progress.tracks || []).map((track, idx) => (
              <Box key={track.trackId || idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                <Box sx={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  bgcolor: track.status === 'uploaded' ? 'success.main' : track.status === 'failed' ? 'error.main' : track.status === 'pending' ? 'grey.300' : 'primary.main',
                }} />
                <Typography variant="body2" sx={{ flex: 1 }} noWrap>{track.title}</Typography>
                <Typography variant="caption" color={
                  track.status === 'failed' ? 'error.main' : track.status === 'uploaded' ? 'success.main' : 'text.secondary'
                }>
                  {(STATUS_LABELS[track.status]?.(track.videoProgress ?? undefined)) || track.status}
                </Typography>
              </Box>
            ))}

            {progress.error && (
              <Typography color="error" variant="caption" sx={{ display: 'block', mt: 1 }}>
                {progress.error}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {!isDone && sessionRef.current && (
          <Button color="error" variant="outlined" size="small" onClick={handleCancel}>
            Cancel Upload
          </Button>
        )}
        <Button onClick={onClose} variant={isDone ? 'contained' : 'text'}>
          {isDone ? 'Close' : 'Minimize'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
