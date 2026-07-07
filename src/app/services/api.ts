/**
 * API service for communicating with the backend
 */

// Base URL for API calls
const API_BASE_URL = '/api';

/**
 * Interface for API response
 */
interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
}

/**
 * Fetch options with authentication
 */
const fetchOptions = (method: string, data?: any): RequestInit => {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  return options;
};

/**
 * Handle API response
 */
const handleResponse = async <T>(response: Response): Promise<ApiResponse<T>> => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      message: 'An error occurred while processing your request',
    }));

    throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
  }

  return response.json();
};

/**
 * API service with methods for common HTTP operations
 */
export const apiService = {
  /**
   * Make a GET request
   */
  get: async <T>(endpoint: string): Promise<ApiResponse<T>> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions('GET'));
    return handleResponse<T>(response);
  },

  /**
   * Make a POST request
   */
  post: async <T>(endpoint: string, data: any): Promise<ApiResponse<T>> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions('POST', data));
    return handleResponse<T>(response);
  },

  /**
   * Make a PUT request
   */
  put: async <T>(endpoint: string, data: any): Promise<ApiResponse<T>> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions('PUT', data));
    return handleResponse<T>(response);
  },

  /**
   * Make a DELETE request
   */
  delete: async <T>(endpoint: string): Promise<ApiResponse<T>> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions('DELETE'));
    return handleResponse<T>(response);
  },
};

export default apiService; 
