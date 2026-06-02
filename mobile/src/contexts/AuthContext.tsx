import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import type {
  AuthState,
  AuthContextType,
  OnboardingData,
  User,
  AuthFlowStep,
} from '@comp-intel/shared/types/auth';
import { authService, authStorage, onUnauthorized } from '../services/auth';

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  flowStep: 'phone_input',
  pendingPhone: null,
  isNewUser: false,
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

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return { ...state, isLoading: true, error: null };
    case 'AUTH_SUCCESS':
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
      return { ...initialState, isLoading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_FLOW_STEP':
      return {
        ...state,
        flowStep: action.payload.step,
        pendingPhone: action.payload.phone ?? state.pendingPhone,
        isNewUser: action.payload.isNewUser ?? state.isNewUser,
        error: null,
        isLoading: false,
      };
    case 'RESET_FLOW':
      return { ...state, flowStep: 'phone_input', pendingPhone: null, isNewUser: false, error: null, isLoading: false };
    default:
      return state;
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check existing auth on mount
  useEffect(() => {
    (async () => {
      try {
        const existingUser = await authStorage.getUser();
        if (existingUser) {
          const isValid = await authService.validateToken();
          if (isValid) {
            dispatch({ type: 'AUTH_SUCCESS', payload: { user: existingUser } });
            return;
          }
        }
        dispatch({ type: 'SET_LOADING', payload: false });
      } catch {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    })();
  }, []);

  // Listen for 401 responses from API interceptor
  useEffect(() => {
    onUnauthorized(() => dispatch({ type: 'AUTH_LOGOUT' }));
    return () => onUnauthorized(() => {});
  }, []);

  const sendOTP = useCallback(async (phone: string) => {
    try {
      dispatch({ type: 'AUTH_START' });
      await authService.sendOTP(phone);
      dispatch({
        type: 'SET_FLOW_STEP',
        payload: { step: 'otp_verification', phone },
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
        dispatch({
          type: 'SET_FLOW_STEP',
          payload: { step: 'onboarding', phone, isNewUser: true },
        });
      } else {
        dispatch({ type: 'AUTH_SUCCESS', payload: { user: result.user } });
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
      dispatch({ type: 'AUTH_SUCCESS', payload: { user: authData.user } });
    } catch (error: any) {
      dispatch({ type: 'AUTH_ERROR', payload: error.message || 'Failed to complete setup' });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // best-effort
    } finally {
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  }, []);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);
  const resetFlow = useCallback(() => dispatch({ type: 'RESET_FLOW' }), []);

  // Stubs for legacy admin auth (not used on mobile)
  const login = useCallback(async () => { throw new Error('Not supported on mobile'); }, []);
  const signup = useCallback(async () => { throw new Error('Not supported on mobile'); }, []);
  const adminSignup = useCallback(async () => { throw new Error('Not supported on mobile'); }, []);

  const contextValue = useMemo<AuthContextType>(() => ({
    ...state,
    sendOTP,
    verifyOTP,
    completeOnboarding,
    login,
    signup,
    adminSignup,
    logout,
    clearError,
    resetFlow,
  }), [state, sendOTP, verifyOTP, completeOnboarding, login, signup, adminSignup, logout, clearError, resetFlow]);

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export default AuthContext;
