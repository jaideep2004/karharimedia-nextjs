const DEV_BACKEND_ORIGIN = () => `http://${'localhost'}:${process.env.BACKEND_PORT || 5000}`;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const stripApiSuffix = (value: string) => trimTrailingSlash(value).replace(/\/api\/?$/, '');

export function getBrowserApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL || '';
  return configured ? trimTrailingSlash(configured) : '/api';
}

export function getConfiguredBackendOrigin() {
  const configured =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    process.env.BACKEND_URL ||
    '';

  if (configured) return stripApiSuffix(configured);

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return DEV_BACKEND_ORIGIN();
}

export function getConfiguredApiBaseUrl() {
  if (typeof window !== 'undefined') return getBrowserApiBaseUrl();
  return `${getConfiguredBackendOrigin()}/api`;
}

const R2_PUBLIC_DOMAIN = () => (process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');

export function resolveMediaUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data|blob):/i.test(raw)) return raw;

  const r2Domain = R2_PUBLIC_DOMAIN();
  const backendOrigin = getConfiguredBackendOrigin();

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        return `${backendOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      if (r2Domain && parsed.pathname.startsWith('/uploads/')) {
        const backendHost = new URL(backendOrigin).hostname;
        if (parsed.hostname === backendHost) {
          const r2Path = parsed.pathname.replace(/^\/uploads\//, '/');
          return `https://${r2Domain}${r2Path}${parsed.search}${parsed.hash}`;
        }
      }
    } catch {
      return raw;
    }
    return raw;
  }

  if (r2Domain) {
    const knownDirs = ['artwork/', 'tracks/', 'support/', 'knowledge-base/'];
    for (const dir of knownDirs) {
      if (raw.startsWith(dir) || raw.startsWith('/' + dir)) {
        const clean = raw.replace(/^\/+/, '');
        return `https://${r2Domain}/${clean}`;
      }
    }
  }

  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (path.startsWith('/uploads/')) {
    if (r2Domain) {
      const r2Path = path.replace(/^\/uploads\//, '/');
      return `https://${r2Domain}${r2Path}`;
    }
    return `${backendOrigin}${path}`;
  }
  return path;
}
