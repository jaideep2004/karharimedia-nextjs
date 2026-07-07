'use client';

import Cookies from 'js-cookie';

type CookieAttributes = Parameters<typeof Cookies.set>[2];

const TOKEN_COOKIE = 'token';
const COOKIE_DAYS = 30;

function shouldUseSharedDomain() {
  if (typeof window === 'undefined') return false;
  return process.env.NODE_ENV === 'production' && window.location.hostname.endsWith('karharimedia.com');
}

export function getAuthCookieOptions(): CookieAttributes {
  const options: CookieAttributes = {
    expires: COOKIE_DAYS,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };

  if (shouldUseSharedDomain()) {
    options.domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || '.karharimedia.com';
  }

  return options;
}

export function getAuthTokenCookie() {
  return Cookies.get(TOKEN_COOKIE) || null;
}

export function setAuthTokenCookie(token: string) {
  Cookies.set(TOKEN_COOKIE, token, getAuthCookieOptions());
}

export function removeAuthTokenCookie() {
  Cookies.remove(TOKEN_COOKIE, { path: '/' });
  Cookies.remove(TOKEN_COOKIE, {
    path: '/',
    domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN || '.karharimedia.com',
  });
}
