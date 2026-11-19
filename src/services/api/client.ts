import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

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

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

type TokenGetter = () => string | null;
type TokenSetter = (token: string | null) => void;
type UnauthorizedHandler = () => void;

let getAccessToken: TokenGetter = () => null;
let setAccessToken: TokenSetter = () => {};
let onUnauthorized: UnauthorizedHandler = () => {};

export function configureApiAuthHandlers(handlers: {
  getToken: TokenGetter;
  setToken: TokenSetter;
  onAuthFailure: UnauthorizedHandler;
}): void {
  getAccessToken = handlers.getToken;
  setAccessToken = handlers.setToken;
  onUnauthorized = handlers.onAuthFailure;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<ApiSuccessResponse<{ accessToken: string }>>(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true, timeout: 10000 },
      )
      .then((res) => {
        const nextToken = res.data.data.accessToken;
        setAccessToken(nextToken);
        return nextToken;
      })
      .catch(() => {
        setAccessToken(null);
        onUnauthorized();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    const status = error.response?.status;
    const url = originalRequest?.url ?? '';

    const isAuthRoute =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh');

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
    }

    return Promise.reject(error);
  },
);

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
