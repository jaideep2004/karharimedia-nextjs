import axios from 'axios';
import Cookies from 'js-cookie';
import { getConfiguredApiBaseUrl } from '@/lib/urlConfig';

// Check if we're in the browser
const isBrowser = typeof window !== 'undefined';

// For server-side requests, use the full URL
// For client-side requests, use relative URLs to avoid CORS issues
const API_BASE_URL = isBrowser 
  ? '/api'  // This will be handled by Next.js API routes
  : getConfiguredApiBaseUrl();

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for cookies to be sent with requests
});

// Add a request interceptor
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      const publicAuthPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/admin-login'];
      const pathname = window.location.pathname;
      const alreadyOnAuthPage = publicAuthPaths.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
      );

      if (!alreadyOnAuthPage) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Generic API response type
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
}

// Helper function to handle API errors
const handleApiError = (error: any) => {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.error('API Error Response:', error.response.data);
    throw new Error(error.response.data.message || error.response.data.error || 'An error occurred');
  } else if (error.request) {
    // The request was made but no response was received
    console.error('API Error Request:', error.request);
    throw new Error('No response from server. Please check your connection.');
  } else {
    // Something happened in setting up the request that triggered an Error
    console.error('API Error:', error.message);
    throw error;
  }
};

// API functions for Authentication
export const authAPI = {
  login: async (email: string, password: string) => {
    try {
      const response = await api.post<ApiResponse<{ token: string; user: any }>>(
        '/auth/login', 
        { email, password }
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  signup: async (userData: any) => {
    try {
      const response = await api.post<ApiResponse<{ token: string; user: any }>>(
        '/auth/register', 
        userData
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  getProfile: async () => {
    try {
      const response = await api.get<ApiResponse<any>>('/auth/me');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  updateProfile: async (userData: any) => {
    try {
      const response = await api.put<ApiResponse<any>>('/auth/me', userData);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  changePassword: async (passwordData: { currentPassword: string; newPassword: string }) => {
    try {
      const response = await api.put<ApiResponse<any>>('/auth/change-password', passwordData);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  checkArtistNameAvailability: async (name: string): Promise<{ available: boolean }> => {
    try {
      const response = await api.get<ApiResponse<{ available: boolean }>>(
        `/auth/check-artist-name?name=${encodeURIComponent(name)}`
      );
      return response.data.data ?? { available: false };
    } catch {
      throw new Error('Unable to verify artist name availability. Please try again.');
    }
  },
};

// Types for Track API
export interface Track {
  id: string;
  title: string;
  artist: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Track API
export const trackAPI = {
  getTracks: async (params: any = {}): Promise<{ success: boolean; data: any[]; pagination?: any; counts?: any; error?: string }> => {
    try {
      const response = await api.get('/tracks', { params });
      return {
        success: response.data?.success !== false,
        data: Array.isArray(response.data?.data) ? response.data.data : [],
        pagination: response.data?.pagination,
        counts: response.data?.counts,
        error: response.data?.error,
      };
    } catch (error) {
      console.error('Error fetching tracks:', error);
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Failed to fetch tracks',
      };
    }
  },

  getTrackById: async (id: string): Promise<ApiResponse<Track>> => {
    try {
      const response = await api.get<ApiResponse<Track>>(`/tracks/${id}`);
      return response.data;
    } catch {
      console.warn(`Track with ID ${id} not found, using mock data`);
      return {
        success: true,
        message: 'Using mock data',
        data: {
          id,
          title: 'Sample Track',
          artist: 'Sample Artist',
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    }
  },

  createTrack: async (data: Omit<Track, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Track>> => {
    try {
      const response = await api.post<ApiResponse<Track>>('/tracks', data);
      return response.data;
    } catch (error) {
      console.error('Error creating track:', error);
      return {
        success: false,
        error: 'Failed to create track',
        message: 'Failed to create track. Please try again later.',
      };
    }
  },

  updateTrack: async (id: string, data: Partial<Track>): Promise<ApiResponse<Track>> => {
    try {
      const response = await api.put<ApiResponse<Track>>(`/tracks/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating track ${id}:`, error);
      return {
        success: false,
        error: 'Failed to update track',
        message: 'Failed to update track. Please try again later.',
      };
    }
  },

  deleteTrack: async (id: string): Promise<ApiResponse<{ id: string }>> => {
    try {
      const response = await api.delete<ApiResponse<{ id: string }>>(`/tracks/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting track ${id}:`, error);
      return {
        success: false,
        error: 'Failed to delete track',
        message: 'Failed to delete track. Please try again later.',
      };
    }
  }
};

// API functions for Releases
export const releaseAPI = {
  getReleases: async (params: any = {}) => {
    try {
      const response = await api.get('/releases', { params });
      // API route returns { success, releases }
      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.releases || [],
          pagination: response.data.pagination,
          counts: response.data.counts,
        };
      } else {
        return {
          success: false,
          data: [],
          pagination: response.data?.pagination,
          counts: response.data?.counts,
          error: response.data?.error || 'Failed to fetch releases',
        };
      }
    } catch (error) {
      console.error('Error fetching releases:', error);
      return {
        success: false,
        data: [],
        pagination: undefined,
        counts: undefined,
        error: (error as any).message || 'Unknown error',
      };
    }
  },

  getReleaseById: async (id: string) => {
    try {
      const response = await api.get(`/releases/${id}`);
      if (response.data && response.data.success) {
        return { success: true, data: response.data.release };
      }
      return { success: false, error: response.data?.error || 'Failed to fetch release' };
    } catch (error) {
      return { success: false, error: (error as any).message || 'Unknown error' };
    }
  },

  deleteRelease: async (id: string) => {
    try {
      const response = await api.delete(`/admin/releases/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  updateReleaseStatus: async (
    id: string,
    status: 'approved' | 'rejected' | 'pending',
    reason?: string
  ) => {
    try {
      const response = await api.patch(`/releases/${id}/status`, { status, reason });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  deleteReleaseTrack: async (releaseId: string, trackKey: string | number, reason?: string) => {
    try {
      const response = await api.delete(`/releases/${releaseId}/tracks/${trackKey}`, {
        data: { reason },
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  adminUpdateRelease: async (id: string, fields: Record<string, any>) => {
    try {
      const response = await api.patch(`/releases/${id}/admin-edit`, fields);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

// API functions for Royalties
export const royaltyAPI = {
  getRoyalties: async (filters?: any) => {
    try {
      const response = await api.get<ApiResponse<any[]>>('/royalties', { params: filters });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getRoyaltyById: async (id: string) => {
    try {
      const response = await api.get<ApiResponse<any>>(`/royalties/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getRoyaltyReports: async (year: number, month: number) => {
    try {
      const response = await api.get<ApiResponse<any>>('/royalties/reports', {
        params: { year, month }
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

// API functions for Payouts
export const payoutAPI = {
  requestPayout: async (payoutData: any) => {
    try {
      const response = await api.post<ApiResponse<any>>('/payouts/request', payoutData);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getPayouts: async () => {
    try {
      const response = await api.get<ApiResponse<any[]>>('/payouts');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getPayoutById: async (id: string) => {
    try {
      const response = await api.get<ApiResponse<any>>(`/payouts/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  updatePayoutStatus: async (id: string, status: string, reason?: string) => {
    try {
      const response = await api.patch<ApiResponse<any>>(`/payouts/${id}/status`, {
        status,
        reason
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

// API functions for Notifications
export const notificationAPI = {
  getNotifications: async () => {
    try {
      const response = await api.get('/notifications');
      const payload = response.data;
      const notifications =
        payload?.data?.notifications ||
        payload?.notifications ||
        payload?.data ||
        payload ||
        [];
      return {
        success: true,
        data: Array.isArray(notifications) ? notifications : []
      };
    } catch (error) {
      console.error('Error fetching notifications:', error);
      // Return empty array for development
      return {
        success: true,
        data: []
      };
    }
  },

  markAsRead: async (id: string) => {
    try {
      const response = await api.patch<ApiResponse<any>>(`/notifications/${id}/read`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  markAllAsRead: async () => {
    try {
      const response = await api.patch<ApiResponse<any>>('/notifications/read-all');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

export type SupportTicketStatus = 'open' | 'in_review' | 'waiting_for_user' | 'resolved' | 'closed';
export type SupportTicketCategory =
  | 'kyc_verification'
  | 'release_rejection'
  | 'copyright_issue'
  | 'dsp_delivery'
  | 'royalties_payments'
  | 'technical_issue'
  | 'account_support'
  | 'other';
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportTicketSort = 'latest' | 'oldest' | 'priority' | 'status';

export const SUPPORT_CATEGORIES: Array<{ value: SupportTicketCategory; label: string }> = [
  { value: 'kyc_verification', label: 'KYC Verification' },
  { value: 'release_rejection', label: 'Release Rejection' },
  { value: 'copyright_issue', label: 'Copyright Issue' },
  { value: 'dsp_delivery', label: 'DSP Delivery' },
  { value: 'royalties_payments', label: 'Royalties / Payments' },
  { value: 'technical_issue', label: 'Technical Issue' },
  { value: 'account_support', label: 'Account Support' },
  { value: 'other', label: 'Other' },
];

export const SUPPORT_PRIORITIES: Array<{ value: SupportTicketPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const supportAPI = {
  getTickets: async (params: Record<string, string | number> = {}) => {
    try {
      const response = await api.get<ApiResponse<any>>('/support/tickets', { params });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  createTicket: async (payload: {
    subject?: string;
    category: SupportTicketCategory;
    customIssue?: string;
    priority?: SupportTicketPriority;
    message: string;
    related?: { releaseId?: string; trackId?: string; knowledgeBaseArticleId?: string };
  }) => {
    try {
      const response = await api.post<ApiResponse<any>>('/support/tickets', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getTicket: async (id: string) => {
    try {
      const response = await api.get<ApiResponse<any>>(`/support/tickets/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  addMessage: async (id: string, body: string) => {
    try {
      const response = await api.post<ApiResponse<any>>(`/support/tickets/${id}/messages`, { body });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  uploadAttachment: async (id: string, file: File, body?: string) => {
    try {
      const formData = new FormData();
      formData.append('attachment', file);
      if (body) formData.append('body', body);
      const response = await api.post<ApiResponse<any>>(`/support/tickets/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  closeTicket: async (id: string) => {
    try {
      const response = await api.patch<ApiResponse<any>>(`/support/tickets/${id}/close`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  markRead: async (id: string) => {
    try {
      const response = await api.patch<ApiResponse<any>>(`/support/tickets/${id}/read`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

export const adminSupportAPI = {
  getTickets: async (params: Record<string, string | number> = {}) => {
    try {
      const response = await api.get<ApiResponse<any>>('/admin/support/tickets', { params });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getTicket: supportAPI.getTicket,

  assignTicket: async (id: string, assigneeId: string) => {
    try {
      const response = await api.patch<ApiResponse<any>>(`/admin/support/tickets/${id}/assign`, { assigneeId });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  updateStatus: async (id: string, status: SupportTicketStatus, reason?: string) => {
    try {
      const response = await api.patch<ApiResponse<any>>(`/admin/support/tickets/${id}/status`, { status, reason });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  addMessage: async (id: string, body: string) => {
    try {
      const response = await api.post<ApiResponse<any>>(`/admin/support/tickets/${id}/messages`, { body });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  uploadAttachment: async (id: string, file: File, body?: string) => {
    try {
      const formData = new FormData();
      formData.append('attachment', file);
      if (body) formData.append('body', body);
      const response = await api.post<ApiResponse<any>>(`/admin/support/tickets/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  addInternalNote: async (id: string, body: string) => {
    try {
      const response = await api.post<ApiResponse<any>>(`/admin/support/tickets/${id}/internal-notes`, { body });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  markRead: async (id: string) => {
    try {
      const response = await api.patch<ApiResponse<any>>(`/admin/support/tickets/${id}/read`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

export type KnowledgeBaseArticleStatus = 'draft' | 'published' | 'archived';

export type KnowledgeBaseCategory = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  iconUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type KnowledgeBaseSection = {
  _id: string;
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type KnowledgeBaseArticle = {
  _id: string;
  categoryId: string | KnowledgeBaseCategory;
  sectionId?: string | KnowledgeBaseSection;
  title: string;
  slug: string;
  excerpt?: string;
  status: KnowledgeBaseArticleStatus;
  content?: Record<string, unknown>;
  contentHtml?: string;
  contentText?: string;
  faqBlocks?: Array<{ question: string; answer: string }>;
  videoEmbeds?: Array<{ url: string; title?: string }>;
  imageRefs?: Array<{ url: string; alt?: string }>;
  seo?: { title?: string; description?: string; keywords?: string[] };
  relatedArticleIds?: KnowledgeBaseArticle[] | string[];
  createdAt?: string;
  publishedAt?: string;
  updatedAt?: string;
};

export type KnowledgeBaseTree = {
  categories: KnowledgeBaseCategory[];
  sections: KnowledgeBaseSection[];
  articles: KnowledgeBaseArticle[];
};

export const knowledgeBaseAPI = {
  getTree: async () => {
    try {
      const response = await api.get<ApiResponse<KnowledgeBaseTree>>('/knowledge-base/categories');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  search: async (q: string, limit = 10) => {
    try {
      const response = await api.get<ApiResponse<{ articles: KnowledgeBaseArticle[] }>>('/knowledge-base/search', {
        params: { q, limit },
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getArticle: async (slug: string) => {
    try {
      const response = await api.get<ApiResponse<KnowledgeBaseArticle>>(`/knowledge-base/articles/${slug}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

export const adminKnowledgeBaseAPI = {
  getTree: async () => {
    try {
      const response = await api.get<ApiResponse<KnowledgeBaseTree>>('/admin/knowledge-base/tree');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  createCategory: async (payload: Partial<KnowledgeBaseCategory>) => {
    try {
      const response = await api.post<ApiResponse<KnowledgeBaseCategory>>('/admin/knowledge-base/categories', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  updateCategory: async (id: string, payload: Partial<KnowledgeBaseCategory>) => {
    try {
      const response = await api.patch<ApiResponse<KnowledgeBaseCategory>>(`/admin/knowledge-base/categories/${id}`, payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  createSection: async (payload: Partial<KnowledgeBaseSection>) => {
    try {
      const response = await api.post<ApiResponse<KnowledgeBaseSection>>('/admin/knowledge-base/sections', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  updateSection: async (id: string, payload: Partial<KnowledgeBaseSection>) => {
    try {
      const response = await api.patch<ApiResponse<KnowledgeBaseSection>>(`/admin/knowledge-base/sections/${id}`, payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getArticles: async (params: Record<string, string | number> = {}) => {
    try {
      const response = await api.get<ApiResponse<{ articles: KnowledgeBaseArticle[]; pagination: any }>>('/admin/knowledge-base/articles', { params });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  createArticle: async (payload: Partial<KnowledgeBaseArticle>) => {
    try {
      const response = await api.post<ApiResponse<KnowledgeBaseArticle>>('/admin/knowledge-base/articles', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  updateArticle: async (id: string, payload: Partial<KnowledgeBaseArticle>) => {
    try {
      const response = await api.patch<ApiResponse<KnowledgeBaseArticle>>(`/admin/knowledge-base/articles/${id}`, payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  publishArticle: async (id: string) => {
    try {
      const response = await api.post<ApiResponse<KnowledgeBaseArticle>>(`/admin/knowledge-base/articles/${id}/publish`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  archiveArticle: async (id: string) => {
    try {
      const response = await api.delete<ApiResponse<KnowledgeBaseArticle>>(`/admin/knowledge-base/articles/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  bulkArchiveArticles: async (ids: string[]) => {
    try {
      const response = await api.post<ApiResponse<{ archivedIds: string[]; count: number }>>(
        '/admin/knowledge-base/articles/bulk-archive',
        { ids }
      );
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  uploadMedia: async (file: File, onProgress?: (progress: number) => void) => {
    try {
      const formData = new FormData();
      formData.append('media', file);
      const response = await api.post<ApiResponse<{
        fileName: string;
        key: string;
        url: string;
        contentType: string;
        mediaType: 'image' | 'video';
        size: number;
      }>>('/admin/knowledge-base/media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (!onProgress || !event.total) return;
          onProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)));
        },
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};

// API functions for public endpoints (no authentication required)
export const publicAPI = {
  // Get a public setting
  getSetting: async (key: string) => {
    try {
      const response = await api.get<ApiResponse<any>>(`/settings/${key}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching public setting ${key}:`, error);
      return { success: false, message: `Failed to fetch setting: ${key}`, data: null };
    }
  },
  
  // Check if signups are enabled
  checkSignupEnabled: async () => {
    try {
      const response = await api.get<{ success: boolean; enabled: boolean; message?: string }>('/settings/signup-enabled');
      return {
        success: response.data?.success === true,
        enabled: response.data?.enabled === true
      };
    } catch (error) {
      console.error('Error checking if signups are enabled:', error);
      // Default to disabled if there's an error
      return { success: false, enabled: false };
    }
  },
};

// API functions for Admin
export const adminAPI = {
  getUsers: async (params: any = {}) => {
    try {
      // Ensure params are properly formatted
      const queryParams = new URLSearchParams();
      
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.search) queryParams.append('search', params.search);
      if (params.status) queryParams.append('status', params.status);
      if (params.sort) queryParams.append('sort', params.sort);
      
      const queryString = queryParams.toString();
      const url = `/admin/users${queryString ? `?${queryString}` : ''}`;
      
      console.log('Fetching users from:', url);
      const response = await api.get<ApiResponse<any>>(url);
      console.log('User response data:', response.data);
      
      // If the response has data.users structure, return it directly
      // Otherwise, wrap the data in the expected structure
      if (response.data.success && response.data.data) {
        if (response.data.data.users) {
          return response.data;
        } else {
          // If data exists but not in users property, restructure it
          return {
            ...response.data,
            data: {
              users: Array.isArray(response.data.data) ? response.data.data : [],
              total: response.data?.data?.pagination?.total || 0
            }
          };
        }
      }
      
      return response.data;
    } catch (error) {
      console.error('Error in getUsers:', error);
      return handleApiError(error);
    }
  },

  getUserById: async (id: string) => {
    try {
      const response = await api.get<ApiResponse<any>>(`/admin/users/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  createUser: async (userData: any) => {
    try {
      console.log('Creating user with data:', userData);
      const response = await api.post<ApiResponse<any>>('/admin/users', userData);
      console.log('Create user response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error creating user:', error);
      return handleApiError(error);
    }
  },

  updateUser: async (id: string, userData: any) => {
    try {
      const response = await api.put<ApiResponse<any>>(`/admin/users/${id}`, userData);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  reviewUserVerification: async (
    id: string,
    data: { status: 'approved' | 'rejected' | 'submitted' | 'pending'; rejectionReason?: string; notes?: string }
  ) => {
    try {
      const response = await api.patch<ApiResponse<any>>(`/admin/users/${id}/verification`, data);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  deleteUser: async (id: string) => {
    try {
      const response = await api.delete<ApiResponse<any>>(`/admin/users/${id}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getDashboardStats: async () => {
    try {
      // Use the Next.js API route that proxies to the backend
      const response = await api.get<ApiResponse<any>>('/admin/stats');
      
      if (response.data.success && response.data.data) {
        return response.data;
      } else {
        console.warn('Could not fetch dashboard stats, using defaults');
        // Return default stats if the endpoint is not available
        return {
          success: true,
          data: {
        totalUsers: 0,
        totalTracks: 0,
        pendingTracks: 0,
        pendingPayouts: 0,
        totalRevenue: 0,
        totalReleases: 0,
            pendingReleases: 0
          }
        };
      }
    } catch (error) {
      console.warn('Could not fetch dashboard stats, using defaults:', error);
      // Return default stats if the endpoint is not available
      return {
        success: true,
        data: {
          totalUsers: 0,
          totalTracks: 0,
          pendingTracks: 0,
          pendingPayouts: 0,
          totalRevenue: 0,
          totalReleases: 0,
          pendingReleases: 0
        }
      };
    }
  },

  // Additional admin endpoints
  getTracks: async (params: any = {}) => {
    try {
      const response = await api.get<ApiResponse<any[]>>('/admin/tracks', { params });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getPayouts: async (params: any = {}) => {
    try {
      // Ensure params are properly formatted
      const queryParams = new URLSearchParams();
      
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.status) queryParams.append('status', params.status);
      if (params.sort) queryParams.append('sort', params.sort);
      
      const queryString = queryParams.toString();
      const url = `/admin/payouts${queryString ? `?${queryString}` : ''}`;
      
      const response = await api.get<ApiResponse<any[]>>(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching payouts:', error);
      return { success: false, message: 'Failed to fetch payouts', data: [] };
    }
  },
  
  // Settings management
  getSettings: async () => {
    try {
      const response = await api.get<ApiResponse<any>>('/admin/settings');
      console.log('Settings response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching settings:', error);
      return { success: false, message: 'Failed to fetch settings', data: null };
    }
  },
  
  getSetting: async (key: string) => {
    try {
      console.log(`Fetching setting: ${key}`);
      const response = await api.get<ApiResponse<any>>(`/admin/settings/${key}`);
      console.log(`Setting ${key} response:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error fetching setting ${key}:`, error);
      return { success: false, message: `Failed to fetch setting: ${key}`, data: null };
    }
  },
  
  updateSetting: async (key: string, value: any) => {
    try {
      console.log(`Updating setting ${key} with value:`, value);
      const response = await api.put<ApiResponse<any>>(`/admin/settings/${key}`, { value });
      console.log(`Setting ${key} update response:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error updating setting ${key}:`, error);
      return { success: false, message: `Failed to update setting: ${key}`, data: null };
    }
  },

  listDspProviders: async () => {
    try {
      const response = await api.get<ApiResponse<any>>('/admin/dsp-providers');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  registerDspProvider: async (payload: {
    key: string;
    displayName: string;
    enabled?: boolean;
    integrationMode?: 'shell' | 'sandbox' | 'live';
    credentials?: Record<string, string>;
    config?: Record<string, string | number | boolean>;
  }) => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/dsp-providers', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  bootstrapPhase1DspProviders: async () => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/dsp-providers-bootstrap');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  listDspDeliveries: async (params: Record<string, string | number> = {}) => {
    try {
      const response = await api.get<ApiResponse<any>>('/admin/dsp-delivery-jobs', { params });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  getDspDelivery: async (jobId: string) => {
    try {
      const response = await api.get<ApiResponse<any>>(`/admin/dsp-delivery-jobs/${jobId}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  listBromaOutlets: async () => {
    try {
      const response = await api.get<ApiResponse<any>>('/admin/broma-outlets');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  dispatchDspDelivery: async (payload: { trackId: string; providerKey: string; operation?: 'deliver' | 'update' | 'takedown' }) => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/dsp-delivery-dispatch', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  retryDspDelivery: async (jobId: string) => {
    try {
      const response = await api.post<ApiResponse<any>>(`/admin/dsp-delivery-jobs/${jobId}/retry`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  retryIndividualDspDelivery: async (jobId: string) => {
    try {
      const response = await api.post<ApiResponse<any>>(`/admin/dsp/deliveries/${jobId}/retry-individual`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  refreshDspDeliveryStatus: async (jobId: string) => {
    try {
      const response = await api.post<ApiResponse<any>>(`/admin/dsp-delivery-jobs/${jobId}/refresh-status`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  clearDspDeliveryLogs: async (jobId: string) => {
    try {
      const response = await api.delete<ApiResponse<any>>(`/admin/dsp-delivery-jobs/${jobId}/logs`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  processDueDspDeliveries: async (payload: { maxJobs?: number; workerId?: string; dispatchOnly?: boolean } = {}) => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/dsp-delivery-process-due', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  processAllDspDeliveries: async (workerId?: string) => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/dsp/deliveries/process-all', { workerId });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  deleteDspDelivery: async (jobId: string) => {
    try {
      const response = await api.delete<ApiResponse<any>>(`/admin/dsp-delivery-jobs/${jobId}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  listBromaDrafts: async (page?: number) => {
    try {
      const response = await api.get<ApiResponse<any>>('/admin/dsp/broma/drafts', { params: { page } });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  retryAllBromaDrafts: async () => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/dsp/broma/drafts/retry-all');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  forceProcessBromaDrafts: async () => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/dsp/broma/drafts/force-process');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  syncBromaOutlets: async () => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/broma-outlets-sync');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  syncBromaReleaseStatuses: async (payload: { releaseIds?: string[]; limit?: number; skip?: number; syncId?: string } = {}) => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/broma-release-statuses-sync', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  requeueStuckBromaJobs: async (payload: { maxJobs?: number; olderThanMinutes?: number } = {}) => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/broma-requeue-stuck', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },

  cleanupBromaDrafts: async (payload: { action?: 'list' | 'delete_orphans' | 'resume_orphans'; maxDrafts?: number } = {}) => {
    try {
      const response = await api.post<ApiResponse<any>>('/admin/broma-drafts-cleanup', payload);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
};
