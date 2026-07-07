import { parseFile } from 'music-metadata';
import { spawn } from 'child_process';
import { LOCAL_FFMPEG_ENABLED } from '../config/constants';

export interface AudioAnalysisResult {
  format: string;
  duration: number;
  bitrate: number;
  loudness: number | null;
}

export async function analyzeAudio(filePath: string): Promise<AudioAnalysisResult> {
  // 1. Get metadata using music-metadata
  const metadata = await parseFile(filePath);
  const format = metadata.format.container || '';
  const duration = metadata.format.duration || 0;
  const bitrate = metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : 0;

  if (!LOCAL_FFMPEG_ENABLED) {
    return { format, duration, bitrate, loudness: null };
  }

  // Local-only loudness scan using ffmpeg CLI.
  const loudness = await new Promise<number | null>((resolve) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', filePath,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary',
      '-f', 'null', '-'
    ]);
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    ffmpeg.on('close', () => {
      const match = stderr.match(/Input Integrated:\s*(-?\d+\.?\d*) LUFS/);
      resolve(match ? parseFloat(match[1]) : null);
    });
    ffmpeg.on('error', () => resolve(null));
  });

  return { format, duration, bitrate, loudness };
}
