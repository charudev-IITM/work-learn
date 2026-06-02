export type SubscriptionStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'cancelled'
  | 'completed'
  | 'paused'
  | 'admin_exempt'
  | 'trial_active'
  | 'trial_expired';

export type PlanType = 'monthly' | 'annual';

export interface SubscriptionInfo {
  has_subscription: boolean;
  status: SubscriptionStatus | null;
  plan_type: PlanType | null;
  current_period_end: string | null;
  razorpay_subscription_id: string | null;
  checkout_key: string;
  trial_ends_at: string | null;
  trial_days_remaining: number;
  free_trial_available: boolean;
  preview_enabled: boolean;
}

export interface ClaimTrialResponse {
  trial_ends_at: string;
  days_remaining: number;
}

export interface CreateSubscriptionResponse {
  razorpay_subscription_id: string;
  razorpay_plan_id: string;
  checkout_key: string;
  plan_type: PlanType;
}

export interface BillingContextType {
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
  isAccessGranted: boolean;
  forcePaywall: boolean;
  setForcePaywall: (show: boolean) => void;
  refresh: () => Promise<void>;
  createSubscription: (planType: PlanType) => Promise<CreateSubscriptionResponse>;
  cancelSubscription: (cancelAtCycleEnd?: boolean) => Promise<void>;
  claimTrial: () => Promise<ClaimTrialResponse>;
}

export const GST_RATE = 0.18;

export const PLANS = {
  monthly: {
    label: 'Monthly',
    price: 999,
    gstAmount: 180,
    totalPrice: 1179,
    originalPrice: '\u20B91,769/month',
    priceLabel: '\u20B9999/month',
    totalLabel: '\u20B91,179/month',
    description: 'Billed monthly',
    savings: 'Save 33%',
    discount: '33% OFF',
  },
  annual: {
    label: 'Annual',
    price: 9999,
    gstAmount: 1800,
    totalPrice: 11799,
    originalPrice: '\u20B921,226/year',
    priceLabel: '\u20B9833/month',
    totalLabel: '\u20B9983/month',
    billedLabel: '\u20B911,799/year',
    description: 'Billed annually',
    savings: 'Save 44%',
    discount: '44% OFF',
  },
} as const;
