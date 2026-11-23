import axios from 'axios';

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: {
    code?: string;
    details?: unknown;
  };
}

export const API_BASE_URL = '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function extractApiError(err: unknown, fallback = 'Request failed'): string {
  if (axios.isAxiosError<ApiErrorResponse>(err)) {
    const apiMessage = err.response?.data?.message;
    if (apiMessage) return apiMessage;
    if (err.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
    if (!err.response) {
      return 'Cannot reach the backend server. Please ensure the application server is running.';
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
