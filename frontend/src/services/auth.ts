import axios from 'axios';
import { initApiClient } from '@comp-intel/shared/services/apiClient';
import type {
  AdminSignupCredentials,
  AuthResponse,
  OTPSendResponse,
  OTPVerifyResponse,
  OnboardingData,
} from '@comp-intel/shared/types/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Axios instance with httpOnly cookie support
const authApi = axios.create({
  baseURL: `${API_BASE_URL}/api/auth`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// User data in localStorage (token is in httpOnly cookie)
const USER_KEY = 'comp_intel_user';

export const authStorage = {
  getUser: () => {
    try {
      const userJson = localStorage.getItem(USER_KEY);
      return userJson ? JSON.parse(userJson) : null;
    } catch {
      return null;
    }
  },

  setUser: (user: any): void => {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.warn('Failed to set user in storage:', e);
    }
  },

  removeUser: (): void => {
    try {
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.warn('Failed to remove user from storage:', e);
    }
  },

  clear: (): void => {
    authStorage.removeUser();
    // Clean up onboarding/trial flow flags to prevent cross-user contamination
    localStorage.removeItem('trial_choice_subscribe');
    localStorage.removeItem('app_preview_active');
    localStorage.removeItem('app_preview_tour_pending');
    localStorage.removeItem('app_preview_started_at');
    sessionStorage.removeItem('onboarding:trial_choice');
    sessionStorage.removeItem('preview:has_time_remaining');
  },
};

// Handle 401 responses
authApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clear();
    }
    return Promise.reject(error);
  }
);

export const authService = {
  // ── OTP Flow ──────────────────────────────────────────────

  async sendOTP(phone: string, captchaToken?: string, _captchaProvider?: 'turnstile', isResend?: boolean): Promise<OTPSendResponse> {
    try {
      const body: Record<string, string | boolean> = { phone };
      if (captchaToken) {
        body.turnstile_token = captchaToken;
      }
      if (isResend) body.is_resend = true;
      const response = await authApi.post('/otp/send', body);
      return response.data;
    } catch (error: any) {
      const message =
        error.response?.data?.detail || 'Failed to send OTP. Please try again.';
      throw new Error(message);
    }
  },

  async verifyOTP(phone: string, otp: string): Promise<OTPVerifyResponse> {
    try {
      const response = await authApi.post('/otp/verify', { phone, otp });
      const data = response.data;

      // If returning user (not needs_onboarding), store user
      if (!data.needs_onboarding && data.user?.id) {
        authStorage.setUser(data.user);
      }

      return data;
    } catch (error: any) {
      const message =
        error.response?.data?.detail || 'Invalid OTP. Please try again.';
      throw new Error(message);
    }
  },

  async completeOnboarding(data: OnboardingData): Promise<AuthResponse> {
    try {
      const response = await authApi.post('/onboarding', data);
      const authData = response.data;
      authStorage.setUser(authData.user);
      return authData;
    } catch (error: any) {
      const message =
        error.response?.data?.detail || 'Failed to complete profile setup.';
      throw new Error(message);
    }
  },

  async adminSignup(credentials: AdminSignupCredentials): Promise<AuthResponse> {
    try {
      const response = await authApi.post('/admin/signup', credentials);
      const authData = response.data;
      authStorage.setUser(authData.user);
      return authData;
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Admin signup failed.';
      throw new Error(message);
    }
  },

  async logout(): Promise<void> {
    try {
      await authApi.post('/logout');
    } catch {
      console.warn('Logout endpoint failed');
    } finally {
      authStorage.clear();
    }
  },

  async validateToken(): Promise<boolean> {
    try {
      await authApi.get('/validate');
      return true;
    } catch {
      authStorage.clear();
      return false;
    }
  },
};

// Shared authenticated API instance for other services
const createAuthenticatedApi = () => {
  const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  });

  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        const detail = error.response?.data?.detail;
        if (detail?.code === 'SESSION_INVALIDATED') {
          // Session was displaced by another login
          sessionStorage.setItem(
            'auth:displaced_msg',
            detail.message || 'Your session was signed in on another device.'
          );
          authStorage.clear();
          window.dispatchEvent(new CustomEvent('auth:session-displaced'));
        } else {
          authStorage.clear();
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
      }
      if (error.response?.status === 402) {
        window.dispatchEvent(new CustomEvent('billing:subscription-required'));
      }
      return Promise.reject(error);
    }
  );

  return api;
};

export const authenticatedApi = createAuthenticatedApi();

// Initialize the shared API client singleton so shared services can make authenticated calls
initApiClient(authenticatedApi);

export default authService;
