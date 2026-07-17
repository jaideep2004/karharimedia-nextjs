import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

type ReleaseLike = Record<string, any> & {
  tracks?: Array<Record<string, any>>;
};

type AssetCheck = {
  kind: 'audio' | 'artwork';
  owner: string;
  value?: string;
  ok: boolean;
  error?: string;
  warning?: string;
  sizeBytes?: number;
  checksumSha256?: string;
};

type AssetReadiness = {
  ok: boolean;
  checks: AssetCheck[];
  errors: string[];
  warnings: string[];
};

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac']);
const ARTWORK_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
const MAX_ARTWORK_BYTES = 25 * 1024 * 1024;

const SERVER_UPLOADS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'server', 'uploads');

const firstString = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();

function normalizeUploadPath(value?: string) {
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    return null;
  }

  const cleaned = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (cleaned.startsWith('uploads/')) return cleaned.slice('uploads/'.length);
  if (cleaned.startsWith('/uploads/')) return cleaned.slice('/uploads/'.length);
  return cleaned;
}

function resolveUploadPath(kind: 'audio' | 'artwork', value?: string) {
  const normalized = normalizeUploadPath(value);
  if (!normalized) return null;

  const hasDirectory = normalized.includes('/');
  const relativePath = hasDirectory ? normalized : path.join(kind === 'audio' ? 'tracks' : 'artwork', normalized);
  const fullPath = path.resolve(/*turbopackIgnore: true*/ SERVER_UPLOADS_DIR, relativePath);
  const uploadRoot = path.resolve(/*turbopackIgnore: true*/ SERVER_UPLOADS_DIR);
  if (!fullPath.startsWith(uploadRoot)) return null;
  return fullPath;
}

async function checksumFile(filePath: string) {
  const hash = crypto.createHash('sha256');
  const data = await fs.readFile(filePath);
  hash.update(data);
  return hash.digest('hex');
}

async function checkLocalAsset(kind: 'audio' | 'artwork', owner: string, value?: string): Promise<AssetCheck> {
  if (!value) {
    return { kind, owner, ok: false, error: `${owner}: missing ${kind}` };
  }

  const filePath = resolveUploadPath(kind, value);
  if (!filePath) {
    if (/^https?:\/\//i.test(value)) {
      return {
        kind,
        owner,
        value,
        ok: true,
        warning: `${owner}: remote ${kind} URL cannot be checked locally`,
      };
    }
    return { kind, owner, value, ok: false, error: `${owner}: invalid ${kind} path` };
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return { kind, owner, value, ok: false, error: `${owner}: ${kind} is not a file` };

    const ext = path.extname(filePath).toLowerCase();
    const validExt = kind === 'audio' ? AUDIO_EXTENSIONS.has(ext) : ARTWORK_EXTENSIONS.has(ext);
    if (!validExt) return { kind, owner, value, ok: false, error: `${owner}: unsupported ${kind} type ${ext || 'unknown'}` };

    const maxSize = kind === 'audio' ? MAX_AUDIO_BYTES : MAX_ARTWORK_BYTES;
    if (stat.size <= 0) return { kind, owner, value, ok: false, error: `${owner}: ${kind} file is empty` };
    if (stat.size > maxSize) return { kind, owner, value, ok: false, error: `${owner}: ${kind} file is too large` };

    return {
      kind,
      owner,
      value,
      ok: true,
      sizeBytes: stat.size,
      checksumSha256: await checksumFile(filePath),
    };
  } catch {
    return { kind, owner, value, ok: false, error: `${owner}: ${kind} file not found` };
  }
}

export async function validateReleaseAssetsForDelivery(release: ReleaseLike): Promise<AssetReadiness> {
  const tracks = Array.isArray(release.tracks) ? release.tracks : [];
  const releaseArtwork = firstString(release.artwork, release.artworkUrl, release.artworkFile, release.coverArt);
  const checks: AssetCheck[] = [];

  checks.push(await checkLocalAsset('artwork', 'release', releaseArtwork));

  for (const [index, track] of tracks.entries()) {
    const owner = `track ${index + 1}`;
    const audio = firstString(track.audioFile, track.audioUrl, track.audio, track.fileUrl);
    const artwork = firstString(track.artwork, track.artworkUrl, track.coverArt, releaseArtwork);
    checks.push(await checkLocalAsset('audio', owner, audio));
    checks.push(await checkLocalAsset('artwork', owner, artwork));
  }

  const errors = checks.flatMap((check) => (check.error ? [check.error] : []));
  const warnings = checks.flatMap((check) => (check.warning ? [check.warning] : []));

  return {
    ok: errors.length === 0,
    checks,
    errors,
    warnings,
  };
}
