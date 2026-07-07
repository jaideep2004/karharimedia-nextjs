import type { UserRole } from '@/types/user';

export type AdminPermission =
  | 'users'
  | 'review'
  | 'payouts'
  | 'dsp_delivery'
  | 'settings'
  | 'analytics'
  | 'support';

export type AdminAccessUser = {
  role?: UserRole | 'admin' | 'subadmin' | string;
  permissions?: string[];
} | null | undefined;

type AdminRouteAccess =
  | { kind: 'admin' }
  | { kind: 'permission'; permission: AdminPermission }
  | { kind: 'dashboard' };

const ADMIN_ROUTE_RULES: Array<{ prefix: string; access: AdminRouteAccess }> = [
  { prefix: '/admin/dashboard', access: { kind: 'dashboard' } },
  { prefix: '/admin/users/new', access: { kind: 'admin' } },
  { prefix: '/admin/users', access: { kind: 'permission', permission: 'users' } },
  { prefix: '/admin/releases', access: { kind: 'permission', permission: 'review' } },
  { prefix: '/admin/tracks', access: { kind: 'permission', permission: 'review' } },
  { prefix: '/admin/tracks', access: { kind: 'permission', permission: 'review' } },
  { prefix: '/admin/dsp-deliveries', access: { kind: 'permission', permission: 'dsp_delivery' } },
  { prefix: '/admin/analytics', access: { kind: 'permission', permission: 'analytics' } },
  { prefix: '/admin/payouts', access: { kind: 'permission', permission: 'payouts' } },
  { prefix: '/admin/royalties', access: { kind: 'permission', permission: 'payouts' } },
  { prefix: '/admin/support', access: { kind: 'permission', permission: 'support' } },
  { prefix: '/admin/knowledge-base', access: { kind: 'permission', permission: 'support' } },
  { prefix: '/admin/music-publishing', access: { kind: 'permission', permission: 'settings' } },
  { prefix: '/admin/vevo-video-distribution', access: { kind: 'permission', permission: 'settings' } },
  { prefix: '/admin/youtube-network', access: { kind: 'permission', permission: 'settings' } },
  { prefix: '/admin/settings', access: { kind: 'permission', permission: 'settings' } },
  { prefix: '/admin/export', access: { kind: 'admin' } },
];

const FIRST_ALLOWED_PATH_BY_PERMISSION: Record<AdminPermission, string> = {
  users: '/admin/users',
  review: '/admin/releases',
  dsp_delivery: '/admin/dsp-deliveries',
  analytics: '/admin/analytics',
  payouts: '/admin/payouts',
  settings: '/admin/settings',
  support: '/admin/support',
};

const SUBADMIN_PERMISSION_ORDER: AdminPermission[] = [
  'users',
  'review',
  'dsp_delivery',
  'analytics',
  'payouts',
  'support',
  'settings',
];

export const isFullAdmin = (user: AdminAccessUser) => user?.role === 'admin';

export const isSubadmin = (user: AdminAccessUser) => user?.role === 'subadmin';

export const isAdminLike = (user: AdminAccessUser) => isFullAdmin(user) || isSubadmin(user);

export const hasAdminPermission = (user: AdminAccessUser, permission: AdminPermission) => {
  if (isFullAdmin(user)) return true;
  if (!isSubadmin(user)) return false;

  const permissions = user?.permissions;
  return Array.isArray(permissions) && permissions.includes(permission);
};

export const getFirstAllowedAdminPath = (user: AdminAccessUser) => {
  if (isFullAdmin(user)) return '/admin/dashboard';
  if (!isSubadmin(user)) return '/dashboard';

  const permission = SUBADMIN_PERMISSION_ORDER.find((item) => hasAdminPermission(user, item));
  return permission ? FIRST_ALLOWED_PATH_BY_PERMISSION[permission] : '/dashboard';
};

export const getAdminRouteAccess = (pathname: string): AdminRouteAccess => {
  const rule = ADMIN_ROUTE_RULES.find((item) => pathname.startsWith(item.prefix));
  return rule?.access ?? { kind: 'admin' };
};

export const canAccessAdminPath = (user: AdminAccessUser, pathname: string) => {
  if (!isAdminLike(user)) return false;
  if (isFullAdmin(user)) return true;

  const access = getAdminRouteAccess(pathname);
  if (access.kind === 'dashboard' || access.kind === 'admin') return false;

  return hasAdminPermission(user, access.permission);
};
