import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { initApiClient } from '@comp-intel/shared/services/apiClient';
import type {
  AuthResponse,
  OTPSendResponse,
  OTPVerifyResponse,
  OnboardingData,
} from '@comp-intel/shared/types/auth';

const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:8888';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

// ── Secure Storage ────────────────────────────────────────────

export const authStorage = {
  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },

  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },

  async getUser() {
    try {
      const json = await SecureStore.getItemAsync(USER_KEY);
      return json ? JSON.parse(json) : null;
    } catch {
      return null;
    }
  },

  async setUser(user: any): Promise<void> {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  },
};

// ── Unauthorized callback ─────────────────────────────────────

let _onUnauthorized: (() => void) | null = null;

export function onUnauthorized(cb: () => void) {
  _onUnauthorized = cb;
}

// ── Authenticated API instance ────────────────────────────────

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach bearer token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401/402 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clear();
      _onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

// Wire up the shared service singleton
initApiClient(api);

// ── Auth API (unauthenticated calls to /api/auth/*) ──────────

const authApi = axios.create({
  baseURL: `${API_BASE_URL}/api/auth`,
  headers: { 'Content-Type': 'application/json' },
});

export const authService = {
  async sendOTP(phone: string): Promise<OTPSendResponse> {
    try {
      const response = await authApi.post('/otp/send', { phone });
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.detail || 'Failed to send OTP. Please try again.'
      );
    }
  },

  async verifyOTP(phone: string, otp: string): Promise<OTPVerifyResponse> {
    try {
      const response = await authApi.post('/otp/verify', { phone, otp });
      const data = response.data;

      // Store token + user for returning users
      if (!data.needs_onboarding && data.token) {
        await authStorage.setToken(data.token);
        await authStorage.setUser(data.user);
      }

      return data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.detail || 'Invalid OTP. Please try again.'
      );
    }
  },

  async completeOnboarding(data: OnboardingData): Promise<AuthResponse> {
    try {
      const response = await authApi.post('/onboarding', data);
      const authData = response.data;

      if (authData.token) {
        await authStorage.setToken(authData.token);
      }
      await authStorage.setUser(authData.user);

      return authData;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.detail || 'Failed to complete profile setup.'
      );
    }
  },

  async logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Best-effort server logout
    } finally {
      await authStorage.clear();
    }
  },

  async validateToken(): Promise<boolean> {
    try {
      await api.get('/api/auth/validate');
      return true;
    } catch {
      await authStorage.clear();
      return false;
    }
  },
};

export default authService;
