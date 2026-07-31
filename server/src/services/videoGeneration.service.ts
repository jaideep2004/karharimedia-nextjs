import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { LOCAL_FFMPEG_ENABLED, TRACKS_DIR, ARTWORK_DIR, SOCIAL_VIDEO_DIR } from '../config/constants';
import { r2 } from './storage/r2Provider';
import { VisualizerPreset } from '../types/socialMedia';
import { generateCircleVideo } from './circularVisualizer.service';

// ── Font detection for Hindi/Devanagari text support ──────────────
const DEVANAGARI_FONTS = [
  process.env.FONT_FILE,
  'C:\\Windows\\Fonts\\Nirmala.ttc',
  'C:\\Windows\\Fonts\\Mangal.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf',
  '/usr/share/fonts/opentype/noto/NotoSansDevanagari-Regular.otf',
  '/usr/share/fonts/truetype/freefont/FreeSerif.ttf',
].filter(Boolean) as string[];

const DEVANAGARI_FONT_NAMES = [
  'Nirmala UI',
  'Nirmala',
  'Mangal',
  'Noto Sans Devanagari',
  'Noto Sans Devanagari Regular',
  'FreeSerif',
];

function hindiFontSpec(): string {
  // Prefer font file path on Linux (no colon in path), fall back to font name on Windows
  const fontFile = DEVANAGARI_FONTS.find(existsSync);
  if (fontFile && !fontFile.match(/^[A-Za-z]:\\/)) {
    return `fontfile=${fontFile.replace(/\\/g, '/')}`;
  }
  // On Windows, use first found font name (avoids colon-in-path issue with filter parser)
  return `font='${DEVANAGARI_FONT_NAMES[0]}'`;
}

const FONT_SPEC = hindiFontSpec();

// fluent-ffmpeg probes ffmpeg capabilities on first use. Some daily ffmpeg builds
// output format strings that confuse its parser, causing async crashes.
// This handler prevents the crash from taking down the server.
process.on('uncaughtException', (err) => {
  if (err.message?.includes('is not a function') && err.stack?.includes('capabilities.js')) {
    console.warn('[ffmpeg] Capabilities detection failed — ffmpeg may be missing some features');
    return;
  }
  // Re-throw other uncaught exceptions to crash as normal
  console.error('[ffmpeg] Uncaught exception', err);
  process.exit(1);
});

export interface GenerateVideoInput {
  audioPath: string;
  artworkPath?: string;
  title: string;
  artist: string;
  preset: VisualizerPreset;
  color?: string;
  outputPath: string;
  hasArtwork?: boolean;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface GenerateVideoResult {
  duration: number;
  fileSize: number;
  outputPath: string;
}

interface ConcatAudioInput {
  audioPaths: string[];
  outputPath: string;
}

async function getFfmpeg() {
  if (!LOCAL_FFMPEG_ENABLED) {
    throw new Error('Local ffmpeg is disabled outside local development');
  }

  const mod = await import('fluent-ffmpeg');
  const ffmpeg = mod.default;

  try {
    const ffmpegPath = process.env.FFMPEG_PATH;
    const ffprobePath = process.env.FFPROBE_PATH;
    if (ffmpegPath && typeof (ffmpeg as any).setFfmpegPath === 'function') {
      (ffmpeg as any).setFfmpegPath(ffmpegPath);
    }
    if (ffprobePath && typeof (ffmpeg as any).setFfprobePath === 'function') {
      (ffmpeg as any).setFfprobePath(ffprobePath);
    }
  } catch {
    // non-fatal; fluent-ffmpeg will try PATH in local development
  }

  return ffmpeg;
}

function ensureDir(dir: string): Promise<void> {
  return fs.mkdir(dir, { recursive: true }).then(() => undefined);
}

export async function resolveMedia(
  filename: string | undefined,
  directory: 'tracks' | 'artwork'
): Promise<string | undefined> {
  if (!filename) {
    return undefined;
  }

  // If filename is already a URL, download directly from it
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    const ext = path.extname(new URL(filename).pathname) || '.dat';
    await ensureDir(SOCIAL_VIDEO_DIR);
    const tempPath = path.join(SOCIAL_VIDEO_DIR, `${uuidv4()}${ext}`);
    const response = await fetch(filename);
    if (!response.ok) {
      throw new Error(`Failed to download ${directory} from URL: ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tempPath, buffer);
    return tempPath;
  }

  const localDir = directory === 'tracks' ? TRACKS_DIR : ARTWORK_DIR;
  const localPath = path.join(localDir, filename);

  try {
    await fs.access(localPath);
    return localPath;
  } catch {
    // File not local — download from R2
    const r2Key = r2.getR2Key(filename, directory);
    const ext = path.extname(filename) || '.dat';
    await ensureDir(SOCIAL_VIDEO_DIR);
    const tempPath = path.join(SOCIAL_VIDEO_DIR, `${uuidv4()}${ext}`);

    const signedUrl = await r2.generateSignedDownloadUrl(r2Key, 3600);
    const response = await fetch(signedUrl);
    if (!response.ok) {
      throw new Error(`Failed to download ${r2Key} from R2: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tempPath, buffer);
    return tempPath;
  }
}

export function getVideoCacheKey(
  releaseId: string,
  trackIdOrAlbum: string,
  preset: VisualizerPreset
): string {
  return `social-videos/${releaseId}/${trackIdOrAlbum}-${preset}.mp4`;
}

export async function getCachedVideo(
  releaseId: string,
  trackIdOrAlbum: string,
  preset: VisualizerPreset
): Promise<{ url: string; key: string } | null> {
  if (!r2.isConfigured) return null;

  const key = getVideoCacheKey(releaseId, trackIdOrAlbum, preset);

  // Check if object actually exists before returning URL
  const exists = await r2.objectExists(key).catch(() => false);
  if (!exists) return null;

  const baseUrl = r2.publicUrl;
  if (baseUrl) {
    return { url: `${baseUrl}/${key}`, key };
  }

  const signed = await r2.generateSignedDownloadUrl(key, 3600).catch(() => null);
  if (signed) return { url: signed, key };

  return null;
}

export async function cacheVideoToR2(
  localPath: string,
  releaseId: string,
  trackIdOrAlbum: string,
  preset: VisualizerPreset
): Promise<string> {
  const key = getVideoCacheKey(releaseId, trackIdOrAlbum, preset);
  await ensureDir(SOCIAL_VIDEO_DIR);
  const result = await r2.uploadFile(localPath, key, 'video/mp4');
  return result.url;
}

export async function concatAudio(input: ConcatAudioInput): Promise<string> {
  if (input.audioPaths.length === 0) {
    throw new Error('No audio files to concatenate');
  }
  if (input.audioPaths.length === 1) {
    return input.audioPaths[0];
  }

  await ensureDir(path.dirname(input.outputPath));

  const ffmpeg = await getFfmpeg();

  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    for (const audioPath of input.audioPaths) {
      command.input(audioPath);
    }

    command
      .on('error', (err: Error) => reject(new Error(`Audio concat failed: ${err.message}`)))
      .on('end', () => resolve(input.outputPath))
      .mergeToFile(input.outputPath, SOCIAL_VIDEO_DIR);
  });
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const ffmpeg = await getFfmpeg();
  await ensureDir(path.dirname(input.outputPath));

  // Get audio duration first for explicit -t output option (more reliable than -shortest
  // with complex filter graphs in daily ffmpeg builds)
  const audioDuration = await getMediaDuration(input.audioPath);
  if (audioDuration <= 0) {
    throw new Error(`Could not determine audio duration for "${input.audioPath}"`);
  }

  const tempCleanup: string[] = [];
  let circleVideoPath: string | undefined;

  // Pre-generate circle frames for circular preset (before fluent-ffmpeg setup)
  if (input.preset === 'circular') {
    circleVideoPath = path.join(SOCIAL_VIDEO_DIR, `circle_${uuidv4()}.mp4`);
    tempCleanup.push(circleVideoPath);
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    await generateCircleVideo({
      audioPath: input.audioPath,
      outputPath: circleVideoPath,
      duration: audioDuration,
      ffmpegPath,
      color: input.color,
      onProgress: (pct) => input.onProgress?.(Math.round(pct * 0.4)),
      signal: input.signal,
    });
    if (input.signal?.aborted) {
      await cleanupTempFiles(...tempCleanup);
      throw new Error('Video generation cancelled');
    }
  }

  return new Promise((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(new Error('Video generation cancelled'));
      return;
    }

    const command = ffmpeg();
    command.input(input.audioPath);
    const hasArtwork = input.hasArtwork && !!input.artworkPath;
    if (hasArtwork) {
      command.input(input.artworkPath!);
      // Per-input -loop 1: tells the image demuxer to loop the single artwork frame
      // indefinitely, replacing the tpad/loop filter approach that hangs in daily builds
      command.loop();
    }

    // NCS-style background: blurred artwork with subtle blue tint fills full frame,
    // sharp artwork scaled to a polished centered size (~540px).
    // When no artwork, use a rich dark gradient (deep navy → dark purple).
    const hasText = !!input.title || !!input.artist;
    const escTxt = (s: string) => s.replace(/'/g, "'\\''").replace(/:/g, '\\:');
    const titleTxt = input.title ? escTxt(input.title) : '';
    const artistTxt = input.artist ? escTxt(input.artist) : '';

    // Build background filter chain — always outputs [bg], plus [art] when artwork exists
    const bgChain = hasArtwork
      ? '[1:v]split[art_raw][art_fill];' +
        '[art_fill]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,' +
        'boxblur=25:6,colorchannelmixer=rr=0.7:gg=0.7:bb=0.9,format=yuv420p[bg];' +
        '[art_raw]scale=580:580:force_original_aspect_ratio=decrease,' +
        'pad=640:640:(640-iw)/2:(640-ih)/2:color=0xFFFFFF@0.08,setsar=1,' +
        'drawbox=x=0:y=0:w=640:h=640:color=0xFFFFFF@0.25:t=2,format=yuv420p[art]'
      : 'gradients=s=1920x1080:c0=0x0a0a16:c1=0x18102a:c2=0x0c1620,format=yuv420p[bg]';

    // NOTE: fluent-ffmpeg's complexFilter only maps streams we explicitly label.
    // We must output both video AND audio labels, otherwise audio is silently dropped.
    let filterComplex: string;
    let filterOutputs: string[];
    switch (input.preset) {
      // ── circular (NCS-style canvas-powered ring + bars) ───────────────
      case 'circular': {
        if (!circleVideoPath) {
          reject(new Error('Circle video not pre-generated'));
          return;
        }
        // Add circle video as extra input
        // Input after audio: artwork is [1:v] (if hasArtwork), circle is after both
        //   No artwork: 0:a=audio, 1:v=circle
        //   With artwork: 0:a=audio, 1:v=artwork, 2:v=circle
        command.input(circleVideoPath);

        const circleInput = hasArtwork ? '2:v' : '1:v';

        // Modified bgChain: artwork at [1:v]
        const circBgChain = hasArtwork
          ? '[1:v]split[art_raw][art_fill];' +
            '[art_fill]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,' +
            'boxblur=25:6,colorchannelmixer=rr=0.7:gg=0.7:bb=0.9,format=yuv420p[bg];' +
            '[art_raw]scale=580:580:force_original_aspect_ratio=decrease,' +
            'pad=640:640:(640-iw)/2:(640-ih)/2:color=0xFFFFFF@0.08,setsar=1,' +
            'drawbox=x=0:y=0:w=640:h=640:color=0xFFFFFF@0.25:t=2,format=yuv420p[art]'
          : 'gradients=s=1920x1080:c0=0x0a0a16:c1=0x18102a:c2=0x0c1620,format=yuv420p[bg]';

        const overlayTarget = hasArtwork ? 'bg_art' : 'bg';
        const overlayX = hasArtwork ? 1920 - 800 - 100 : (1920 - 800) / 2;
        const overlayY = (1080 - 800) / 2;

        let fc = circBgChain;
        if (hasArtwork) {
          fc += ';[bg][art]overlay=100:(H-h)/2-40,format=yuv420p[bg_art]';
        }
        // Colorkey: remove black bg from circle frames; overlay with alpha
        fc += `;[${circleInput}]colorkey=0x000000:0.10:0.0,format=yuva420p[circle];` +
          `[${overlayTarget}][circle]overlay=${overlayX}:${overlayY},format=yuv420p[comp]`;
        if (hasText) {
          fc += `;[comp]drawtext=text='${titleTxt}':x=(w-text_w)/2:y=60:fontsize=34:fontcolor=White:shadowy=2:shadowcolor=black@0.7:${FONT_SPEC}[vid1]`;
          if (input.artist) {
            fc += `;[vid1]drawtext=text='${artistTxt}':x=(w-text_w)/2:y=102:fontsize=20:fontcolor=White@0.75:shadowy=2:shadowcolor=black@0.6:${FONT_SPEC}[vid]`;
          }
        }
        // Passthrough audio (no visual audio processing needed — circle is pre-rendered)
        fc += ';[0:a]anull[a_out]';
        filterComplex = fc;
        filterOutputs = [hasText && input.artist ? 'vid' : (hasText ? 'vid1' : 'comp'), 'a_out'];
        break;
      }

      // ── bars (default, NCS-style waveform bars) ───────────────────────
      case 'bars':
      default: {
        let fc = bgChain + ';[0:a]asplit[a_waves][a_out];' +
          '[a_waves]showwaves=s=1920x380:mode=cline:rate=25:' +
          'colors=0x00E5FF|0xFF3366|0xFFD740|0xAA44FF[waves];';
        if (hasArtwork) {
          fc += '[bg][art]overlay=(W-w)/2:(H-h)/2-40,format=yuv420p[bg_art];' +
            '[bg_art][waves]overlay=0:1080-380,format=yuv420p[comp];';
        } else {
          fc += '[bg][waves]overlay=0:1080-380,format=yuv420p[comp];';
        }
        if (hasText) {
          fc += `[comp]drawtext=text='${titleTxt}':x=(w-text_w)/2:y=60:fontsize=34:fontcolor=White:shadowy=2:shadowcolor=black@0.7:${FONT_SPEC}[vid1];`;
          if (input.artist) {
            fc += `[vid1]drawtext=text='${artistTxt}':x=(w-text_w)/2:y=102:fontsize=20:fontcolor=White@0.75:shadowy=2:shadowcolor=black@0.6:${FONT_SPEC}[vid]`;
          }
        }
        filterComplex = fc;
        filterOutputs = [hasText && input.artist ? 'vid' : (hasText ? 'vid1' : 'comp'), 'a_out'];
        break;
      }
    }

    // ── Brand logo overlay (bottom-left) ────────────────────────────
    const LOGO_PATH = path.resolve(process.cwd(), '../public/images/karhari-media-b1.png');
    if (existsSync(LOGO_PATH)) {
      command.input(LOGO_PATH);
      command.loop();
      const logoVIdx = input.preset === 'circular'
        ? (hasArtwork ? 3 : 2)
        : (hasArtwork ? 2 : 1);
      const lastLabel = filterOutputs[0];
      const sep = filterComplex.endsWith(';') ? '' : ';';
      filterComplex += `${sep}[${logoVIdx}:v]scale=90:-1:flags=lanczos,format=yuva420p[lg];` +
        `[${lastLabel}][lg]overlay=20:H-h-20[final_video]`;
      filterOutputs[0] = 'final_video';
    }

    // ── Apply filter complex & output options ───────────────────────
    const timeoutMs = Math.min(Math.max(audioDuration * 8000, 20 * 60 * 1000), 90 * 60 * 1000);
    const timeout = setTimeout(() => {
      try { (command as any).ffmpegProc?.kill('SIGKILL'); } catch {}
      reject(new Error(`Video generation timed out after ${Math.round(timeoutMs / 60000)}min`));
    }, timeoutMs);

    // Kill ffmpeg if cancelled
    const onAbort = () => {
      clearTimeout(timeout);
      cleanupTempFiles(...tempCleanup);
      try { (command as any).ffmpegProc?.kill('SIGKILL'); } catch {}
      reject(new Error('Video generation cancelled'));
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });

    command
      .complexFilter(filterComplex, filterOutputs)
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
        '-c:a aac',
        '-b:a 192k',
        '-pix_fmt yuv420p',
      ])
      .duration(audioDuration)
      .on('start', (cmdLine: string) => {
        console.log(`[ffmpeg] start: ${cmdLine}`);
      })
      .on('progress', (info: any) => {
        if (info.percent) {
          console.log(`[ffmpeg] ${input.outputPath.split(path.sep).pop()} ${info.percent.toFixed(1)}% (fps=${info.fps || '?'}, ${(info.currentKbps || 0).toFixed(0)}kbps)`);
          input.onProgress?.(info.percent);
        }
      })
      .on('stderr', (line: string) => {
        console.log(`[ffmpeg:stderr] ${line}`);
      })
      .on('error', (err: Error) => {
        clearTimeout(timeout);
        input.signal?.removeEventListener('abort', onAbort);
        cleanupTempFiles(...tempCleanup);
        reject(new Error(`Video generation failed: ${err.message}`));
      })
      .on('end', async () => {
        clearTimeout(timeout);
        input.signal?.removeEventListener('abort', onAbort);
        await cleanupTempFiles(...tempCleanup);
        const stat = await fs.stat(input.outputPath).catch(() => ({ size: 0 }));
        const duration = await getMediaDuration(input.outputPath);
        resolve({
          duration,
          fileSize: stat.size,
          outputPath: input.outputPath,
        });
      })
      .save(input.outputPath);
  });
}

async function getMediaDuration(filePath: string): Promise<number> {
  const ffmpeg = await getFfmpeg();
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, metadata: any) => {
      if (err || !metadata?.format?.duration) {
        resolve(0);
        return;
      }
      resolve(metadata.format.duration);
    });
  });
}

export async function cleanupTempFiles(...paths: string[]): Promise<void> {
  for (const filePath of paths) {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore
    }
  }
}

export function sanitizeFilename(name: string, maxLen = 80): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, maxLen)
    || 'video';
}

export async function generateTrackVideo(
  audioPath: string,
  artworkPath: string | undefined,
  title: string,
  artist: string,
  preset: VisualizerPreset,
  releaseId: string,
  trackId: string,
  options?: { outputDir?: string; keepLocal?: boolean },
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<{ localPath: string; r2Url: string; duration: number; fileSize: number }> {
  const dir = options?.outputDir || SOCIAL_VIDEO_DIR;
  await ensureDir(dir);
  const safeName = sanitizeFilename(`${trackId}_${title}` || trackId || 'track');
  const outputPath = path.join(dir, `${safeName}.mp4`);
  const hasArtwork = !!artworkPath;

  let result;
  try {
    result = await generateVideo({
      audioPath,
      artworkPath,
      title,
      artist,
      preset,
      outputPath,
      hasArtwork,
      onProgress,
      signal,
    });
  } catch (err) {
    await cleanupTempFiles(outputPath);
    throw err;
  }

  if (result.fileSize === 0) {
    await cleanupTempFiles(outputPath);
    throw new Error(`Generated video is empty (0 bytes) for "${title || trackId}"`);
  }

  const r2Url = await cacheVideoToR2(outputPath, releaseId, trackId, preset);

  if (!options?.keepLocal) {
    await cleanupTempFiles(outputPath);
  }

  return {
    localPath: result.outputPath,
    r2Url,
    duration: result.duration,
    fileSize: result.fileSize,
  };
}

export async function generateAlbumVideo(
  audioPaths: string[],
  artworkPath: string | undefined,
  albumTitle: string,
  artist: string,
  preset: VisualizerPreset,
  color: string | undefined,
  releaseId: string,
  options?: { outputDir?: string; keepLocal?: boolean },
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<{ localPath: string; r2Url: string; duration: number; fileSize: number }> {
  const dir = options?.outputDir || SOCIAL_VIDEO_DIR;
  await ensureDir(dir);

  const safeName = sanitizeFilename(`${releaseId}_${albumTitle}` || 'album');
  const concatOutput = path.join(dir, `${safeName}_concat.mp3`);
  const concatedAudio = audioPaths.length === 1
    ? audioPaths[0]
    : await concatAudio({ audioPaths, outputPath: concatOutput });

  const outputPath = path.join(dir, `${safeName}.mp4`);

  let result;
  try {
    result = await generateVideo({
      audioPath: concatedAudio,
      artworkPath,
      title: albumTitle,
      artist,
      preset,
      color,
      outputPath,
      hasArtwork: !!artworkPath,
      onProgress,
      signal,
    });
  } catch (err) {
    await cleanupTempFiles(outputPath);
    if (concatedAudio !== audioPaths[0]) await cleanupTempFiles(concatedAudio);
    throw err;
  }

  if (result.fileSize === 0) {
    await cleanupTempFiles(outputPath);
    if (concatedAudio !== audioPaths[0]) await cleanupTempFiles(concatedAudio);
    throw new Error(`Generated album video is empty (0 bytes) for "${albumTitle}"`);
  }

  const r2Url = await cacheVideoToR2(outputPath, releaseId, 'album', preset);

  if (concatedAudio !== audioPaths[0]) {
    await cleanupTempFiles(concatedAudio);
  }

  if (!options?.keepLocal) {
    await cleanupTempFiles(outputPath);
  }

  return {
    localPath: result.outputPath,
    r2Url,
    duration: result.duration,
    fileSize: result.fileSize,
  };
}
