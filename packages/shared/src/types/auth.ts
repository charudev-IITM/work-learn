export interface User {
  id: string;
  username: string;
  phone?: string;
  name?: string;
  business?: string;
  createdAt: string;
  is_admin: boolean;
  needs_onboarding?: boolean;
}

// OTP flow
export interface OTPSendResponse {
  message: string;
}

export interface OTPVerifyResponse {
  user: User;
  message: string;
  needs_onboarding: boolean;
}

export interface OnboardingData {
  phone: string;
  name: string;
  business?: string;
}

// Legacy admin auth
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface SignupCredentials {
  username: string;
  password: string;
  masterKey: string;
}

export interface AdminSignupCredentials {
  username: string;
  password: string;
  adminKey: string;
}

export interface AuthResponse {
  user: User;
  token?: string;
  refreshToken?: string;
}

export type AuthFlowStep = 'phone_input' | 'otp_verification' | 'onboarding' | 'onboarding_wizard' | 'app_preview' | 'trial_choice' | 'authenticated';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  flowStep: AuthFlowStep;
  pendingPhone: string | null;
  isNewUser: boolean;
}

export interface AuthContextType extends AuthState {
  sendOTP: (phone: string, captchaToken?: string, captchaProvider?: 'turnstile', isResend?: boolean) => Promise<void>;
  verifyOTP: (phone: string, otp: string) => Promise<void>;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
  adminSignup: (credentials: AdminSignupCredentials) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  resetFlow: () => void;
}
