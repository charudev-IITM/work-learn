import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { onboardingService } from '@comp-intel/shared/services/onboarding';
import { previewTimerService } from '@comp-intel/shared/services/previewTimer';
import type { OnboardingState } from '@comp-intel/shared/types/onboarding';

// ── Types ───────────────────────────────────────────────────────────────────

export type WizardStep = 'welcome' | 'theme' | 'commodities' | 'dealers';

const WIZARD_STEPS: WizardStep[] = ['welcome', 'theme', 'commodities', 'dealers'];

interface OnboardingState_ {
  currentStep: WizardStep;
  selectedCommodities: string[];
  selectedDealers: string[];
  createdWatchlistId: string | null;
  isLoading: boolean;
  isResumed: boolean;
  direction: 'forward' | 'backward';
}

interface OnboardingContextType extends OnboardingState_ {
  stepIndex: number;
  totalSteps: number;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: WizardStep) => void;
  toggleCommodity: (commodity: string) => void;
  toggleDealer: (dealerId: string) => void;
  setCreatedWatchlist: (id: string) => void;
  finishWizard: (mode?: 'trial' | 'preview' | 'paywall') => Promise<void>;
  exitToPaywall: () => void;
  expirePreview: () => Promise<void>;
  skipToEnd: (mode?: 'trial' | 'preview' | 'paywall') => Promise<void>;
}

// ── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_STEP'; step: WizardStep; direction: 'forward' | 'backward' }
  | { type: 'TOGGLE_COMMODITY'; commodity: string }
  | { type: 'TOGGLE_DEALER'; dealerId: string }
  | { type: 'SET_WATCHLIST_ID'; id: string }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'RESTORE_STATE'; state: Partial<OnboardingState_> };

const initialState: OnboardingState_ = {
  currentStep: 'welcome',
  selectedCommodities: [],
  selectedDealers: [],
  createdWatchlistId: null,
  isLoading: true,
  isResumed: false,
  direction: 'forward',
};

function reducer(state: OnboardingState_, action: Action): OnboardingState_ {
  switch (action.type) {
    case 'SET_STEP': {
      return {
        ...state,
        currentStep: action.step,
        direction: action.direction,
      };
    }
    case 'TOGGLE_COMMODITY': {
      const has = state.selectedCommodities.includes(action.commodity);
      return {
        ...state,
        selectedCommodities: has
          ? state.selectedCommodities.filter((c) => c !== action.commodity)
          : [...state.selectedCommodities, action.commodity],
      };
    }
    case 'TOGGLE_DEALER': {
      const has = state.selectedDealers.includes(action.dealerId);
      return {
        ...state,
        selectedDealers: has
          ? state.selectedDealers.filter((d) => d !== action.dealerId)
          : [...state.selectedDealers, action.dealerId],
      };
    }
    case 'SET_WATCHLIST_ID':
      return { ...state, createdWatchlistId: action.id };
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    case 'RESTORE_STATE':
      return { ...state, ...action.state, isLoading: false, isResumed: true };
    default:
      return state;
  }
}

// ── Context ─────────────────────────────────────────────────────────────────

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { user } = useAuth();
  const persistDebounce = useRef<ReturnType<typeof setTimeout>>();

  // Derived — no need to keep in sync manually in every reducer case
  const stepIndex = useMemo(() => WIZARD_STEPS.indexOf(state.currentStep), [state.currentStep]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (persistDebounce.current) clearTimeout(persistDebounce.current);
    };
  }, []);

  // Load state from backend on mount (for resume)
  useEffect(() => {
    if (!user) return;

    const loadState = async () => {
      try {
        const saved: OnboardingState = await onboardingService.getState();
        if (saved.step) {
          const step = saved.step as WizardStep;
          const idx = WIZARD_STEPS.indexOf(step);
          if (idx >= 0) {
            dispatch({
              type: 'RESTORE_STATE',
              state: {
                currentStep: step,
                selectedCommodities: saved.commodities || [],
                selectedDealers: saved.dealer_ids || [],
                createdWatchlistId: saved.watchlist_id || null,
              },
            });
            return;
          }
        }
      } catch {
        // First time — no saved state
      }
      dispatch({ type: 'SET_LOADING', loading: false });
    };

    loadState();
  }, [user]);

  // Persist state to backend (debounced)
  const persistState = useCallback(
    (step: WizardStep, commodities: string[], dealerIds: string[]) => {
      if (persistDebounce.current) clearTimeout(persistDebounce.current);
      persistDebounce.current = setTimeout(async () => {
        try {
          await onboardingService.updateState({
            step,
            commodities,
            dealer_ids: dealerIds,
          });
        } catch {
          // Silent fail — state is also in local reducer
        }
      }, 500);
    },
    [],
  );

  // ── Actions ─────────────────────────────────────────────────

  const nextStep = useCallback(() => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < WIZARD_STEPS.length) {
      const next = WIZARD_STEPS[nextIdx];
      dispatch({ type: 'SET_STEP', step: next, direction: 'forward' });
      persistState(next, state.selectedCommodities, state.selectedDealers);
      // Fire analytics event
      onboardingService.recordEvent(state.currentStep, 'completed').catch(() => {});
      onboardingService.recordEvent(next, 'entered').catch(() => {});
    }
  }, [stepIndex, state.currentStep, state.selectedCommodities, state.selectedDealers, persistState]);

  const prevStep = useCallback(() => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) {
      const prev = WIZARD_STEPS[prevIdx];
      dispatch({ type: 'SET_STEP', step: prev, direction: 'backward' });
    }
  }, [stepIndex]);

  const goToStep = useCallback(
    (step: WizardStep) => {
      const idx = WIZARD_STEPS.indexOf(step);
      const direction = idx > stepIndex ? 'forward' : 'backward';
      dispatch({ type: 'SET_STEP', step, direction });
      persistState(step, state.selectedCommodities, state.selectedDealers);
    },
    [stepIndex, state.selectedCommodities, state.selectedDealers, persistState],
  );

  const toggleCommodity = useCallback(
    (commodity: string) => {
      dispatch({ type: 'TOGGLE_COMMODITY', commodity });
    },
    [],
  );

  const toggleDealer = useCallback(
    (dealerId: string) => {
      dispatch({ type: 'TOGGLE_DEALER', dealerId });
    },
    [],
  );

  const setCreatedWatchlist = useCallback((id: string) => {
    dispatch({ type: 'SET_WATCHLIST_ID', id });
  }, []);

  // Shared: create watchlist from onboarding selections
  const _createWatchlist = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const result = await onboardingService.createWatchlist(
        state.selectedCommodities,
        state.selectedDealers,
      );
      dispatch({ type: 'SET_WATCHLIST_ID', id: result.watchlist_id });
      onboardingService.recordEvent('dealers', 'completed').catch(() => {});
    } catch (err) {
      // Proceed without watchlist — user can add dealers manually
      console.error('Failed to create watchlist:', err);
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [state.selectedCommodities, state.selectedDealers]);

  // finishWizard: create watchlist, then route based on platform settings
  // mode: 'trial' → trial choice screen, 'preview' → 10-min app preview, 'paywall' → straight to paywall
  const finishWizard = useCallback(async (mode: 'trial' | 'preview' | 'paywall' = 'trial') => {
    await _createWatchlist();
    // Tour flag only for modes where user enters the app (not paywall)
    if (mode !== 'paywall') {
      localStorage.setItem('app_preview_tour_pending', 'true');
    }

    if (mode === 'trial') {
      sessionStorage.setItem('onboarding:trial_choice', 'true');
      window.dispatchEvent(new CustomEvent('onboarding:trial-choice'));
    } else if (mode === 'preview') {
      localStorage.setItem('app_preview_active', 'true');
      onboardingService.recordEvent('app_preview', 'entered').catch(() => {});
      window.dispatchEvent(new CustomEvent('onboarding:enter-preview'));
    } else {
      // paywall — mark onboarding complete in DB, update localStorage, then go to authenticated
      try {
        await onboardingService.complete();
      } catch (err) {
        console.error('Failed to mark onboarding complete:', err);
      }
      const storedUser = localStorage.getItem('comp_intel_user');
      if (storedUser) {
        try {
          const u = JSON.parse(storedUser);
          u.needs_onboarding = false;
          localStorage.setItem('comp_intel_user', JSON.stringify(u));
        } catch { /* ignore */ }
      }
      window.dispatchEvent(new CustomEvent('onboarding:complete'));
    }
  }, [_createWatchlist]);

  // exitToPaywall: user tapped Subscribe, time may remain — reversible
  const exitToPaywall = useCallback(() => {
    // Pause server timer so it doesn't tick while user reads the paywall
    previewTimerService.pause().catch(() => {});
    // Don't call onboardingService.complete() — no DB write
    localStorage.removeItem('app_preview_active');
    localStorage.removeItem('app_preview_tour_pending');
    sessionStorage.setItem('preview:has_time_remaining', 'true');
    onboardingService.recordEvent('app_preview', 'exit_to_paywall').catch(() => {});
    // Transition to authenticated → SubscriptionGuard shows PaywallPage
    window.dispatchEvent(new CustomEvent('onboarding:complete'));
  }, []);

  // expirePreview: timer hit 0 — irreversible
  const expirePreview = useCallback(async () => {
    try {
      await onboardingService.complete();
      onboardingService.recordEvent('app_preview', 'completed', {
        commodities: state.selectedCommodities,
        dealers: state.selectedDealers,
        reason: 'timer_expired',
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to mark onboarding complete:', err);
      // Still transition even if the API call fails
    }
    // Update the stored user to reflect onboarding_complete
    const storedUser = localStorage.getItem('comp_intel_user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        user.needs_onboarding = false;
        localStorage.setItem('comp_intel_user', JSON.stringify(user));
      } catch { /* ignore */ }
    }
    // Clear all preview flags
    localStorage.removeItem('app_preview_active');
    localStorage.removeItem('app_preview_tour_pending');
    localStorage.removeItem('app_preview_started_at');
    sessionStorage.removeItem('preview:has_time_remaining');
    // Transition to authenticated → SubscriptionGuard shows PaywallPage
    window.dispatchEvent(new CustomEvent('onboarding:complete'));
  }, [state.selectedCommodities, state.selectedDealers]);

  // Listen for preview:expired event from usePreviewTimer → expirePreview
  useEffect(() => {
    const handleExpired = () => { expirePreview(); };
    window.addEventListener('preview:expired', handleExpired);
    return () => window.removeEventListener('preview:expired', handleExpired);
  }, [expirePreview]);

  const skipToEnd = useCallback(async (mode?: 'trial' | 'preview' | 'paywall') => {
    onboardingService.recordEvent(state.currentStep, 'skipped').catch(() => {});
    await finishWizard(mode);
  }, [state.currentStep, finishWizard]);

  const contextValue = useMemo<OnboardingContextType>(() => ({
    ...state,
    stepIndex,
    totalSteps: WIZARD_STEPS.length,
    nextStep,
    prevStep,
    goToStep,
    toggleCommodity,
    toggleDealer,
    setCreatedWatchlist,
    finishWizard,
    exitToPaywall,
    expirePreview,
    skipToEnd,
  }), [state, stepIndex, nextStep, prevStep, goToStep, toggleCommodity, toggleDealer,
    setCreatedWatchlist, finishWizard, exitToPaywall,
    expirePreview, skipToEnd]);

  return (
    <OnboardingContext.Provider value={contextValue}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

export { WIZARD_STEPS };
