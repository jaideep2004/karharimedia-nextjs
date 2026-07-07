'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  IconButton,
  Slider,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  GraphicEq,
  Pause,
  PlayArrow,
  SkipNext,
  SkipPrevious,
  VolumeDown,
  VolumeUp,
} from '@mui/icons-material';

export type AudioPlayerTrack = {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  artworkUrl?: string;
};

type PremiumAudioPlayerProps = {
  tracks: AudioPlayerTrack[];
  requestedIndex: number;
  requestId: number;
  onDuration?: (index: number, durationSeconds: number) => void;
  onActiveIndexChange?: (index: number) => void;
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

export default function PremiumAudioPlayer({
  tracks,
  requestedIndex,
  requestId,
  onDuration,
  onActiveIndexChange,
}: PremiumAudioPlayerProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, requestedIndex));
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const activeTrack = tracks[activeIndex];
  const activeAudioUrl = activeTrack?.audioUrl;

  useEffect(() => {
    setActiveIndex(Math.min(Math.max(0, requestedIndex), Math.max(0, tracks.length - 1)));
  }, [requestId, requestedIndex, tracks.length]);

  useEffect(() => {
    onActiveIndexChange?.(activeIndex);
  }, [activeIndex, onActiveIndexChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeAudioUrl) return;
    audio.src = activeAudioUrl;
    audio.load();
    setCurrentTime(0);
    setDuration(0);
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [activeAudioUrl, activeIndex, requestId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  const move = (direction: -1 | 1) => {
    if (!tracks.length) return;
    setActiveIndex(index => (index + direction + tracks.length) % tracks.length);
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  if (!activeTrack) return null;

  return (
    <Box
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)',
        bgcolor: isDark ? '#0b1220' : '#ffffff',
        boxShadow: isDark
          ? '0 18px 48px rgba(0,0,0,0.3), inset 0 1px rgba(255,255,255,0.04)'
          : '0 18px 48px rgba(15,23,42,0.1), inset 0 1px rgba(255,255,255,0.9)',
      }}
    >
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={event => {
          const nextDuration = event.currentTarget.duration;
          setDuration(nextDuration);
          if (Number.isFinite(nextDuration)) onDuration?.(activeIndex, nextDuration);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => move(1)}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, flex: '0 1 280px' }}>
          <Avatar
            variant="rounded"
            src={activeTrack.artworkUrl}
            sx={{
              width: 54,
              height: 54,
              borderRadius: 1.5,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
            }}
          >
            <GraphicEq />
          </Avatar>
          <Box minWidth={0}>
            <Typography fontWeight={900} noWrap>{activeTrack.title}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {activeTrack.artist || `Track ${activeIndex + 1} of ${tracks.length}`}
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ flex: 1, minWidth: { xs: '100%', sm: 240 } }}>
          <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
            <Tooltip title="Previous track">
              <IconButton aria-label="Previous track" onClick={() => move(-1)}>
                <SkipPrevious />
              </IconButton>
            </Tooltip>
            <IconButton
              aria-label={playing ? 'Pause track' : 'Play track'}
              onClick={togglePlayback}
              sx={{
                width: 46,
                height: 46,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              {playing ? <Pause /> : <PlayArrow />}
            </IconButton>
            <Tooltip title="Next track">
              <IconButton aria-label="Next track" onClick={() => move(1)}>
                <SkipNext />
              </IconButton>
            </Tooltip>
          </Stack>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Typography variant="caption" sx={{ minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(currentTime)}
            </Typography>
            <Slider
              size="small"
              aria-label="Track timeline"
              min={0}
              max={duration || 1}
              value={Math.min(currentTime, duration || 1)}
              onChange={(_, value) => {
                const nextTime = Array.isArray(value) ? value[0] : value;
                if (audioRef.current) audioRef.current.currentTime = nextTime;
                setCurrentTime(nextTime);
              }}
            />
            <Typography variant="caption" sx={{ minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(duration)}
            </Typography>
          </Stack>
        </Box>

        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ width: { xs: '100%', sm: 130 } }}>
          {volume < 0.5 ? <VolumeDown color="action" /> : <VolumeUp color="action" />}
          <Slider
            size="small"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(_, value) => setVolume(Array.isArray(value) ? value[0] : value)}
          />
        </Stack>
      </Stack>
    </Box>
  );
}
