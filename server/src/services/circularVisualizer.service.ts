import { createCanvas } from '@napi-rs/canvas';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const SAMPLE_RATE = 44100;
const FPS = 25;
const BARS = 360;
const SIZE = 800;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RING_RADIUS = 310;
const MAX_BAR_LENGTH = 130;

const COLOR_PALETTE: Record<string, { hex: string; glow: string; border: string; inner: string }> = {
  cyan:    { hex: '#00E5FF', glow: '0,229,255',  border: 'rgba(0,229,255,0.7)',  inner: 'rgba(0,229,255,0.07)' },
  green:   { hex: '#00FF88', glow: '0,255,136',  border: 'rgba(0,255,136,0.7)',  inner: 'rgba(0,255,136,0.07)' },
  pink:    { hex: '#FF3366', glow: '255,51,102',  border: 'rgba(255,51,102,0.7)', inner: 'rgba(255,51,102,0.07)' },
  purple:  { hex: '#AA44FF', glow: '170,68,255',  border: 'rgba(170,68,255,0.7)', inner: 'rgba(170,68,255,0.07)' },
  red:     { hex: '#FF4444', glow: '255,68,68',   border: 'rgba(255,68,68,0.7)',  inner: 'rgba(255,68,68,0.07)' },
  white:   { hex: '#FFFFFF', glow: '255,255,255', border: 'rgba(255,255,255,0.7)', inner: 'rgba(255,255,255,0.07)' },
};

export interface CircleVideoOptions {
  audioPath: string;
  outputPath: string;
  duration: number;
  ffmpegPath: string;
  color?: string;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

function decodeAudioToPCM(audioPath: string, ffmpegPath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-i', audioPath,
      '-f', 'f32le',
      '-acodec', 'pcm_f32le',
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk));

    proc.on('close', (code) => {
      if (code !== 0) {
        const errMsg = Buffer.concat(errChunks).toString().slice(-300);
        reject(new Error(`Audio decode failed (exit ${code}): ${errMsg}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      const samples = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      resolve(samples);
    });

    proc.on('error', reject);
  });
}

function computeBarAmplitudes(
  pcm: Float32Array,
  frameIndex: number,
  samplesPerFrame: number,
  samplesPerBar: number
): { amps: Float32Array; rms: number } {
  const startSample = frameIndex * samplesPerFrame;
  const amps = new Float32Array(BARS);
  let total = 0;

  for (let bar = 0; bar < BARS; bar++) {
    let sum = 0;
    for (let s = 0; s < samplesPerBar; s++) {
      const idx = startSample + bar * samplesPerBar + s;
      if (idx < pcm.length) {
        sum += Math.abs(pcm[idx]);
      }
    }
    const amp = sum / Math.max(samplesPerBar, 1);
    amps[bar] = amp;
    total += amp;
  }

  return { amps, rms: total / BARS };
}

function smoothArray(arr: Float32Array, window: number): Float32Array {
  const n = arr.length;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = -window; j <= window; j++) {
      const idx = ((i + j) % n + n) % n;
      sum += arr[idx];
      count++;
    }
    result[i] = sum / count;
  }
  return result;
}

export async function generateCircleVideo(options: CircleVideoOptions): Promise<void> {
  const { audioPath, outputPath, duration, ffmpegPath, color, onProgress, signal } = options;
  const pal = COLOR_PALETTE[color || 'cyan'] || COLOR_PALETTE.cyan;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const pcm = await decodeAudioToPCM(audioPath, ffmpegPath);

  const totalFrames = Math.max(Math.floor(duration * FPS), 1);
  const samplesPerFrame = Math.floor(SAMPLE_RATE / FPS);
  const samplesPerBar = Math.max(Math.floor(samplesPerFrame / BARS), 1);

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  const encoder = spawn(ffmpegPath, [
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${SIZE}x${SIZE}`,
    '-r', String(FPS),
    '-i', '-',
    '-frames:v', String(totalFrames),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  encoder.setMaxListeners(100);

  const stderrChunks: Buffer[] = [];
  encoder.stderr.on('data', (d: Buffer) => stderrChunks.push(d));

  const cleanup = () => {
    try { encoder.kill('SIGKILL'); } catch { /* ignore */ }
  };
  signal?.addEventListener('abort', cleanup, { once: true });

  // Shared close handler for backpressure safety
  let drainReject: ((err: Error) => void) | null = null;
  encoder.on('close', (code) => {
    signal?.removeEventListener('abort', cleanup);
    if (drainReject) {
      const r = drainReject;
      drainReject = null;
      r(new Error(`Encoder closed before drain (exit ${code})`));
    }
  });

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      if (signal?.aborted) {
        cleanup();
        return;
      }
      if (encoder.exitCode !== null) {
        throw new Error(`Encoder exited prematurely (code ${encoder.exitCode})`);
      }

      ctx.clearRect(0, 0, SIZE, SIZE);

      const { amps, rms } = computeBarAmplitudes(pcm, frame, samplesPerFrame, samplesPerBar);

      const bassPush = Math.min(rms * 15, 30);
      const rotationDrift = frame * 0.0005;

      // Pre-compute trig once per frame (saves 5x per-frame trig calls)
      const cosAngles = new Float64Array(BARS);
      const sinAngles = new Float64Array(BARS);
      for (let bar = 0; bar < BARS; bar++) {
        const a = (bar / BARS) * Math.PI * 2 - Math.PI / 2 + rotationDrift;
        cosAngles[bar] = Math.cos(a);
        sinAngles[bar] = Math.sin(a);
      }

      // Per-angle ring radii: bar amplitude pushes the ring outward at each angle
      const scale = MAX_BAR_LENGTH * 2.5;
      const rawRadii = new Float32Array(BARS);
      for (let bar = 0; bar < BARS; bar++) {
        const amp = Math.min(amps[bar] * scale, MAX_BAR_LENGTH);
        rawRadii[bar] = RING_RADIUS + bassPush + amp * 0.4;
      }
      const radii = smoothArray(rawRadii, 3);

      // Inline path drawing for wobbly ring layers (avoids closure allocation)
      const drawRing = (offset: number) => {
        ctx.beginPath();
        for (let bar = 0; bar < BARS; bar++) {
          const r = radii[bar] + offset;
          const x = CX + cosAngles[bar] * r;
          const y = CY + sinAngles[bar] * r;
          if (bar === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      };

      // Outer glow
      for (let g = 0; g < 3; g++) {
        drawRing(4 + g * 3);
        ctx.strokeStyle = `rgba(${pal.glow}, ${0.04 * (1 - g * 0.25)})`;
        ctx.lineWidth = 8 + g * 2;
        ctx.stroke();
      }
      // Main ring
      drawRing(0);
      ctx.strokeStyle = pal.border;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Inner glow
      drawRing(-5);
      ctx.strokeStyle = pal.inner;
      ctx.lineWidth = 10;
      ctx.stroke();

      // Bars — from wobbly ring inward
      ctx.beginPath();
      for (let bar = 0; bar < BARS; bar++) {
        const amp = Math.min(amps[bar] * scale, MAX_BAR_LENGTH);
        if (amp < 1) continue;
        const ringR = radii[bar];
        ctx.moveTo(CX + cosAngles[bar] * ringR, CY + sinAngles[bar] * ringR);
        ctx.lineTo(CX + cosAngles[bar] * (ringR - amp), CY + sinAngles[bar] * (ringR - amp));
      }
      ctx.strokeStyle = pal.hex;
      ctx.lineWidth = 2;
      ctx.stroke();

      const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
      const buf = Buffer.from(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength);

      const canWrite = encoder.stdin.write(buf);
      if (!canWrite) {
        await new Promise<void>((resolve, reject) => {
          drainReject = reject;
          encoder.stdin.once('drain', () => {
            drainReject = null;
            resolve();
          });
        });
      }

      if (frame % Math.max(Math.ceil(totalFrames / 100), 1) === 0) {
        onProgress?.(Math.round((frame / totalFrames) * 100));
        console.log(`[circle-frames] ${frame}/${totalFrames} (${Math.round(frame / totalFrames * 100)}%)`);
      }
    }

    encoder.stdin.end();
  } catch (err) {
    cleanup();
    throw err;
  }

  const stderrOutput = Buffer.concat(stderrChunks).toString().slice(-500);

  await new Promise<void>((resolve, reject) => {
    if (encoder.exitCode !== null) {
      signal?.removeEventListener('abort', cleanup);
      if (encoder.exitCode !== 0) {
        reject(new Error(`Circle encoder exited ${encoder.exitCode}: ${stderrOutput}`));
      } else {
        resolve();
      }
      return;
    }
    const onClose = (code: number | null) => {
      signal?.removeEventListener('abort', cleanup);
      if (code !== 0) {
        reject(new Error(`Circle encoder exited ${code}: ${stderrOutput}`));
      } else {
        resolve();
      }
    };
    encoder.on('close', onClose);
    encoder.on('error', (err) => {
      signal?.removeEventListener('abort', cleanup);
      reject(err);
    });
  });
}
