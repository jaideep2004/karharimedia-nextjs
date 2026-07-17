import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtDecode } from 'jwt-decode';

// Define public paths that don't require authentication
const publicPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/artist', '/help', '/'];

// Define paths to exclude from middleware processing
const excludedPaths = [
  '/_next',
  '/favicon.ico',
  '/api',
  '/static',
  '/_error',    
];

const HELP_HOST = process.env.NEXT_PUBLIC_HELP_HOST || 'help.karharimedia.com';

const normalizeHost = (host: string | null) => (host || '').split(':')[0].toLowerCase();

const getRequestHost = (request: NextRequest) =>
  normalizeHost(request.headers.get('x-forwarded-host') || request.headers.get('host'));

const isHelpHost = (host: string) => host === HELP_HOST;

// Helper function to validate token
const validateToken = (token: string) => {
  try {
    const decoded: any = jwtDecode(token);
    const currentTime = Date.now() / 1000;
    
    // Check if token is expired
    if (decoded.exp < currentTime) {
      console.log('Token expired');
      return null;
    }
    
    return decoded;
  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = getRequestHost(request);
  console.log('Middleware processing path:', pathname);
  
  // Skip middleware for excluded paths
  if (excludedPaths.some(path => pathname.startsWith(path))) {
    console.log('Excluded path, skipping middleware');
    return NextResponse.next();
  }

  // Check if the requested path is public
  const isPublicPath = publicPaths.some(path => 
    pathname === path || pathname.startsWith(`${path}/`)
  );
  console.log('Is public path?', isPublicPath);

  // Check if user is authenticated via token in cookies
  const token = request.cookies.get('token')?.value;
  let isAuthenticated = false;
  let userRole = null;
  
  if (token) {
    const decoded = validateToken(token);
    isAuthenticated = !!decoded;
    userRole = decoded?.role;
    console.log('User role from token:', userRole);
  }
  
  console.log('Is authenticated?', isAuthenticated);

  if (isHelpHost(host)) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = pathname === '/'
      ? '/help'
      : pathname.startsWith('/help')
        ? pathname
        : `/help${pathname}`;
    console.log('Help host rewrite to:', rewriteUrl.pathname);
    return NextResponse.rewrite(rewriteUrl);
  }

  // Handle authentication redirects
  if (isAuthenticated) {
    // If trying to access login/signup when already authenticated, redirect to appropriate dashboard
    if (pathname === '/login' || pathname === '/signup') {
      const redirectUrl = userRole === 'admin' || userRole === 'subadmin' ? '/admin/dashboard' : '/dashboard';
      console.log('Already authenticated, redirecting to:', redirectUrl);
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
    
    // Check admin access for admin routes
    if (pathname.startsWith('/admin') && userRole !== 'admin' && userRole !== 'subadmin') {
      console.log('Non-admin user trying to access admin area, redirecting to dashboard');
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  } else if (!isPublicPath) {
    // If not authenticated and trying to access private path, redirect to login
    console.log('Private path, not authenticated - redirecting to login');
    const url = new URL('/login', request.url);
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // Allow the request to proceed
  console.log('Request proceeding normally');
  return NextResponse.next();
}

// Configure which paths should trigger the middleware
export const config = {
  matcher: [
    // Match all routes except for static files and API routes
    '/((?!api|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}; 
