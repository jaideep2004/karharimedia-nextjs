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
};

type AssetReadiness = {
  ok: boolean;
  checks: AssetCheck[];
  errors: string[];
  warnings: string[];
};

const firstString = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();

function isFilename(value: string): boolean {
  return !/^https?:\/\//i.test(value) && !value.includes('/') && !value.includes('..');
}

function getR2Domain(): string {
  return process.env.R2_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN || '';
}

function isR2Configured(): boolean {
  return !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && getR2Domain());
}

async function checkRemoteAsset(kind: 'audio' | 'artwork', owner: string, value: string): Promise<AssetCheck> {
  const domain = getR2Domain();
  if (!domain) {
    return { kind, owner, value, ok: false, error: `${owner}: ${kind} — R2 not configured` };
  }
  const dir = kind === 'audio' ? 'tracks' : 'artwork';
  const url = `https://${domain}/${dir}/${value}`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) {
      return { kind, owner, value, ok: true, warning: `${owner}: ${kind} verified on R2` };
    }
    return { kind, owner, value, ok: false, error: `${owner}: ${kind} not found on R2` };
  } catch {
    return { kind, owner, value, ok: false, error: `${owner}: ${kind} — cannot reach R2` };
  }
}

async function checkLocalAsset(kind: 'audio' | 'artwork', owner: string, value?: string): Promise<AssetCheck> {
  if (!value) {
    return { kind, owner, ok: false, error: `${owner}: missing ${kind}` };
  }

  if (/^https?:\/\//i.test(value)) {
    return {
      kind, owner, value,
      ok: true,
      warning: `${owner}: remote ${kind} URL (not verified locally)`,
    };
  }

  if (isFilename(value) && isR2Configured()) {
    return checkRemoteAsset(kind, owner, value);
  }

  return { kind, owner, value, ok: true, warning: `${owner}: ${kind} path skipped (not on local disk)` };
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
