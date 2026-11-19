import { create } from 'zustand';
import {
  apiClient,
  configureApiAuthHandlers,
  extractApiError,
  type ApiSuccessResponse,
} from '../services/api/client';

export interface AuthUserProfile {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  user: AuthUserProfile | null;
  accessToken: string | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;

  restoreSession: () => Promise<void>;
  register: (params: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => Promise<AuthUserProfile>;
  login: (params: { email: string; password: string }) => Promise<AuthUserProfile>;
  logout: () => Promise<void>;
  updateProfile: (params: { name: string; email: string }) => Promise<AuthUserProfile>;
  changePassword: (params: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<void>;
  clearAuth: () => void;
}

let restorePromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  initialized: false,
  loading: false,
  error: null,

  restoreSession: async () => {
    if (get().initialized) return;
    if (restorePromise) return restorePromise;

    restorePromise = (async () => {
      set({ loading: true, error: null });
      try {
        const res = await apiClient.post<
          ApiSuccessResponse<{ user: AuthUserProfile; accessToken: string }>
        >('/auth/refresh');
        set({
          user: res.data.data.user,
          accessToken: res.data.data.accessToken,
          initialized: true,
          loading: false,
        });
      } catch {
        set({
          user: null,
          accessToken: null,
          initialized: true,
          loading: false,
        });
      } finally {
        restorePromise = null;
      }
    })();

    return restorePromise;
  },

  register: async (params) => {
    set({ loading: true, error: null });
    try {
      const res = await apiClient.post<
        ApiSuccessResponse<{ user: AuthUserProfile; accessToken: string }>
      >('/auth/register', params);
      const { user, accessToken } = res.data.data;
      set({ user, accessToken, initialized: true, loading: false, error: null });
      return user;
    } catch (err) {
      const message = extractApiError(err, 'Registration failed');
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  login: async (params) => {
    set({ loading: true, error: null });
    try {
      const res = await apiClient.post<
        ApiSuccessResponse<{ user: AuthUserProfile; accessToken: string }>
      >('/auth/login', params);
      const { user, accessToken } = res.data.data;
      set({ user, accessToken, initialized: true, loading: false, error: null });
      return user;
    } catch (err) {
      const message = extractApiError(err, 'Login failed');
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Proceed to clear local auth state even if network call fails
    } finally {
      set({ user: null, accessToken: null, initialized: true, error: null });
    }
  },

  updateProfile: async (params) => {
    set({ loading: true, error: null });
    try {
      const res = await apiClient.put<ApiSuccessResponse<{ user: AuthUserProfile }>>(
        '/auth/profile',
        params,
      );
      const { user } = res.data.data;
      set({ user, loading: false });
      return user;
    } catch (err) {
      const message = extractApiError(err, 'Failed to update profile');
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  changePassword: async (params) => {
    set({ loading: true, error: null });
    try {
      await apiClient.put('/auth/change-password', params);
      set({ loading: false });
    } catch (err) {
      const message = extractApiError(err, 'Failed to change password');
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  clearAuth: () => {
    set({ user: null, accessToken: null, initialized: true });
  },
}));

configureApiAuthHandlers({
  getToken: () => useAuthStore.getState().accessToken,
  setToken: (token) => useAuthStore.setState({ accessToken: token }),
  onAuthFailure: () => useAuthStore.getState().clearAuth(),
});
