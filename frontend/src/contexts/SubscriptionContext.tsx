import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { billingService } from '../services/billing';
import type {
  BillingContextType,
  SubscriptionInfo,
  PlanType,
  CreateSubscriptionResponse,
  ClaimTrialResponse,
} from '@comp-intel/shared/types/billing';

const SubscriptionContext = createContext<BillingContextType | null>(null);

// "pending" = Razorpay is retrying a failed charge; access continues until "halted"
export const ACTIVE_STATUSES = new Set(['active', 'authenticated', 'admin_exempt', 'pending', 'trial_active']);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [forcePaywall, setForcePaywall] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const status = await billingService.getStatus();
      setSubscription(status);
    } catch (error) {
      console.error('Failed to fetch subscription status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (isAuthenticated && user) {
      setIsLoading(true);
      refresh();
    } else {
      setSubscription(null);
      setIsLoading(false);
    }
  }, [isAuthenticated, user, refresh]);

  // Listen for 402 events from axios interceptor
  useEffect(() => {
    const handler = () => {
      refresh();
    };
    window.addEventListener('billing:subscription-required', handler);
    return () => window.removeEventListener('billing:subscription-required', handler);
  }, [refresh]);

  const createSubscription = useCallback(
    async (planType: PlanType): Promise<CreateSubscriptionResponse> => {
      return billingService.createSubscription(planType);
    },
    []
  );

  const cancelSubscription = useCallback(
    async (cancelAtCycleEnd = true) => {
      await billingService.cancelSubscription(cancelAtCycleEnd);
      await refresh();
    },
    [refresh]
  );

  const claimTrial = useCallback(async (): Promise<ClaimTrialResponse> => {
    const result = await billingService.claimTrial();
    // Optimistically update subscription state from the claim response
    setSubscription(prev => prev ? {
      ...prev,
      status: 'trial_active' as const,
      trial_ends_at: result.trial_ends_at,
      trial_days_remaining: result.days_remaining,
      free_trial_available: false,
    } : prev);
    return result;
  }, []);

  const isAccessGranted = useMemo(() => {
    if (user?.is_admin === true) return true;
    if (!subscription?.status) return false;
    if (ACTIVE_STATUSES.has(subscription.status)) return true;
    // Cancelled but still within paid period (matches backend logic in subscription_service.py:92-97)
    if (subscription.status === 'cancelled' && subscription.current_period_end) {
      return new Date() < new Date(subscription.current_period_end);
    }
    return false;
  }, [user, subscription]);

  const value: BillingContextType = {
    subscription,
    isLoading,
    isAccessGranted,
    forcePaywall,
    setForcePaywall,
    refresh,
    createSubscription,
    cancelSubscription,
    claimTrial,
  };

  return (
    <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
