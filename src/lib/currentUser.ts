import { fetchBackend } from '@/app/api/_lib/backend';

export interface CurrentBackendUser {
  _id: string;
  name: string;
  email: string;
  role: 'artist' | 'label' | 'admin' | 'subadmin';
  artistName?: string;
  permissions?: string[];
  supportCategories?: string[];
  verification?: {
    status?: 'pending' | 'submitted' | 'approved' | 'rejected';
  };
}

export async function getCurrentBackendUser(): Promise<CurrentBackendUser> {
  const result = await fetchBackend('/api/auth/me');

  if (!result.ok) {
    throw new Error('Authentication required');
  }

  const payload = result.data as {
    success?: boolean;
    data?: CurrentBackendUser;
    message?: string;
  };

  if (!payload.success || !payload.data) {
    throw new Error(payload.message || 'Failed to load current user');
  }

  return payload.data;
}
