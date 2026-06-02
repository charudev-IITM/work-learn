import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import {
  AuthState,
  AuthContextType,
  AdminSignupCredentials,
  OnboardingData,
  User,
  AuthFlowStep,
} from '@comp-intel/shared/types/auth';
import { authService, authStorage } from '../services/auth';

// Restore in-progress OTP flow across page refresh (sessionStorage = tab-scoped)
let _parsed: { flowStep?: AuthFlowStep; pendingPhone?: string; isNewUser?: boolean } | null = null;
try {
  const _savedFlow = sessionStorage.getItem('auth:otp_flow');
  if (_savedFlow) _parsed = JSON.parse(_savedFlow);
} catch {
  sessionStorage.removeItem('auth:otp_flow');
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  flowStep: _parsed?.flowStep ?? 'phone_input',
  pendingPhone: _parsed?.pendingPhone ?? null,
  isNewUser: _parsed?.isNewUser ?? false,
};

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: User } }
  | { type: 'AUTH_ERROR'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_FLOW_STEP'; payload: { step: AuthFlowStep; phone?: string; isNewUser?: boolean } }
  | { type: 'RESET_FLOW' };

// Steps that represent an in-progress OTP flow worth persisting
const _OTP_FLOW_STEPS = new Set(['otp_verification', 'onboarding']);

function _persistOTPFlow(flowStep: string, pendingPhone: string | null, isNewUser: boolean) {
  if (_OTP_FLOW_STEPS.has(flowStep)) {
    sessionStorage.setItem('auth:otp_flow', JSON.stringify({ flowStep, pendingPhone, isNewUser }));
  } else {
    sessionStorage.removeItem('auth:otp_flow');
  }
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return { ...state, isLoading: true, error: null };

    case 'AUTH_SUCCESS':
      _persistOTPFlow('authenticated', null, false);
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        flowStep: 'authenticated',
        pendingPhone: null,
        isNewUser: false,
      };

    case 'AUTH_ERROR':
      return { ...state, isLoading: false, error: action.payload };

    case 'AUTH_LOGOUT':
      _persistOTPFlow('phone_input', null, false);
      return {
        ...initialState,
        isLoading: false,
      };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_FLOW_STEP': {
      const newPhone = action.payload.phone ?? state.pendingPhone;
      const newIsNew = action.payload.isNewUser ?? state.isNewUser;
      _persistOTPFlow(action.payload.step, newPhone, newIsNew);
      return {
        ...state,
        flowStep: action.payload.step,
        pendingPhone: newPhone,
        isNewUser: newIsNew,
        error: null,
        isLoading: false,
      };
    }

    case 'RESET_FLOW':
      _persistOTPFlow('phone_input', null, false);
      return {
        ...state,
        flowStep: 'phone_input',
        pendingPhone: null,
        isNewUser: false,
        error: null,
        isLoading: false,
      };

    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check existing auth on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const existingUser = authStorage.getUser();

        if (existingUser) {
          const isValid = await authService.validateToken();
          if (isValid) {
            dispatch({
              type: 'AUTH_SUCCESS',
              payload: { user: existingUser },
            });
            // Resume onboarding: check if in app preview, trial choice, chose-to-subscribe, or still in wizard
            if (existingUser.needs_onboarding) {
              const inPreview = localStorage.getItem('app_preview_active') === 'true';
              const inTrialChoice = sessionStorage.getItem('onboarding:trial_choice') === 'true';
              const choseSubscribe = localStorage.getItem('trial_choice_subscribe') === 'true';
              const hasTimeOnPaywall = sessionStorage.getItem('preview:has_time_remaining') === 'true';
              dispatch({
                type: 'SET_FLOW_STEP',
                payload: { step: inPreview ? 'app_preview' : inTrialChoice ? 'trial_choice' : (choseSubscribe || hasTimeOnPaywall) ? 'authenticated' : 'onboarding_wizard' },
              });
            }
            return;
          }
        }
        dispatch({ type: 'SET_LOADING', payload: false });
      } catch {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    initializeAuth();
  }, []);

  // Listen for unauthorized events from API interceptors (no page reload)
  useEffect(() => {
    const handleUnauthorized = () => {
      dispatch({ type: 'AUTH_LOGOUT' });
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  // Listen for session displacement (signed in on another device)
  useEffect(() => {
    const handleDisplaced = () => {
      authStorage.clear();
      dispatch({ type: 'AUTH_LOGOUT' });
    };
    window.addEventListener('auth:session-displaced', handleDisplaced);
    return () => window.removeEventListener('auth:session-displaced', handleDisplaced);
  }, []);

  // Listen for onboarding wizard completion
  useEffect(() => {
    const handleOnboardingComplete = () => {
      dispatch({ type: 'SET_FLOW_STEP', payload: { step: 'authenticated' } });
    };
    window.addEventListener('onboarding:complete', handleOnboardingComplete);
    return () => window.removeEventListener('onboarding:complete', handleOnboardingComplete);
  }, []);

  // Listen for onboarding preview entry (dealers step → app preview)
  useEffect(() => {
    const handleEnterPreview = () => {
      dispatch({ type: 'SET_FLOW_STEP', payload: { step: 'app_preview' } });
    };
    window.addEventListener('onboarding:enter-preview', handleEnterPreview);
    return () => window.removeEventListener('onboarding:enter-preview', handleEnterPreview);
  }, []);

  // Listen for trial choice screen (dealers step → trial choice)
  useEffect(() => {
    const handler = () => {
      dispatch({ type: 'SET_FLOW_STEP', payload: { step: 'trial_choice' } });
    };
    window.addEventListener('onboarding:trial-choice', handler);
    return () => window.removeEventListener('onboarding:trial-choice', handler);
  }, []);

  // ── OTP Flow ──────────────────────────────────────────────

  const sendOTP = useCallback(async (phone: string, captchaToken?: string, captchaProvider?: 'turnstile', isResend?: boolean) => {
    try {
      dispatch({ type: 'AUTH_START' });
      await authService.sendOTP(phone, captchaToken, captchaProvider, isResend);
      dispatch({
        type: 'SET_FLOW_STEP',
        payload: {
          step: 'otp_verification',
          phone,
        },
      });
    } catch (error: any) {
      dispatch({ type: 'AUTH_ERROR', payload: error.message || 'Failed to send OTP' });
      throw error;
    }
  }, []);

  const verifyOTP = useCallback(async (phone: string, otp: string) => {
    try {
      dispatch({ type: 'AUTH_START' });
      const result = await authService.verifyOTP(phone, otp);

      if (result.needs_onboarding) {
        // New user: go to onboarding
        dispatch({
          type: 'SET_FLOW_STEP',
          payload: { step: 'onboarding', phone, isNewUser: true },
        });
      } else {
        // Returning user: authenticated
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: { user: result.user },
        });
        // If user hasn't completed onboarding wizard, send them there
        if (result.user.needs_onboarding) {
          dispatch({
            type: 'SET_FLOW_STEP',
            payload: { step: 'onboarding_wizard' },
          });
        }
      }
    } catch (error: any) {
      dispatch({ type: 'AUTH_ERROR', payload: error.message || 'Invalid OTP' });
      throw error;
    }
  }, []);

  const completeOnboarding = useCallback(async (data: OnboardingData) => {
    try {
      dispatch({ type: 'AUTH_START' });
      const authData = await authService.completeOnboarding(data);
      // Set authenticated first (JWT cookie is set, user object available)
      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user: authData.user },
      });
      // Then transition to onboarding wizard (user.needs_onboarding will be true
      // since we no longer set onboarding_complete on the profile step)
      if (authData.user.needs_onboarding) {
        dispatch({
          type: 'SET_FLOW_STEP',
          payload: { step: 'onboarding_wizard' },
        });
      }
    } catch (error: any) {
      dispatch({
        type: 'AUTH_ERROR',
        payload: error.message || 'Failed to complete setup',
      });
      throw error;
    }
  }, []);

  const resetFlow = useCallback(() => {
    dispatch({ type: 'RESET_FLOW' });
  }, []);

  const adminSignup = useCallback(async (credentials: AdminSignupCredentials) => {
    try {
      dispatch({ type: 'AUTH_START' });
      const authData = await authService.adminSignup(credentials);
      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user: authData.user },
      });
    } catch (error: any) {
      dispatch({
        type: 'AUTH_ERROR',
        payload: error.message || 'Admin signup failed',
      });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      console.warn('Logout service failed');
    } finally {
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const contextValue = useMemo<AuthContextType>(() => ({
    ...state,
    sendOTP,
    verifyOTP,
    completeOnboarding,
    adminSignup,
    logout,
    clearError,
    resetFlow,
  }), [state, sendOTP, verifyOTP, completeOnboarding, adminSignup, logout, clearError, resetFlow]);

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
