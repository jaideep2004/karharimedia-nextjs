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

export function resolveMediaUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data|blob):/i.test(raw)) return raw;

  const backendOrigin = getConfiguredBackendOrigin();

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        return `${backendOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      return raw;
    }
    return raw;
  }

  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (path.startsWith('/uploads/')) {
    return `${backendOrigin}${path}`;
  }
  return path;
}
