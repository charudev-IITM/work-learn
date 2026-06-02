import { authenticatedApi } from './auth';
import type { SubscriptionInfo, CreateSubscriptionResponse, ClaimTrialResponse, PlanType } from '@comp-intel/shared/types/billing';

export const billingService = {
  async getStatus(): Promise<SubscriptionInfo> {
    const response = await authenticatedApi.get('/api/billing/status');
    return response.data;
  },

  async createSubscription(planType: PlanType): Promise<CreateSubscriptionResponse> {
    const response = await authenticatedApi.post('/api/billing/create-subscription', {
      plan_type: planType,
    });
    return response.data;
  },

  async verifyPayment(
    razorpay_payment_id: string,
    razorpay_subscription_id: string,
    razorpay_signature: string,
  ): Promise<void> {
    await authenticatedApi.post('/api/billing/verify-payment', {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    }, {
      timeout: 15000, // 15 second timeout
    });
  },

  async cancelSubscription(cancelAtCycleEnd = true): Promise<void> {
    await authenticatedApi.post('/api/billing/cancel', {
      cancel_at_cycle_end: cancelAtCycleEnd,
    });
  },

  async claimTrial(): Promise<ClaimTrialResponse> {
    const response = await authenticatedApi.post('/api/billing/claim-trial');
    return response.data;
  },
};

export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

/** Lazily load the Razorpay checkout SDK only when needed. */
let razorpayPromise: Promise<void> | null = null;

function loadRazorpaySDK(): Promise<void> {
  if ((window as any).Razorpay) return Promise.resolve();
  if (razorpayPromise) return razorpayPromise;
  razorpayPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayPromise = null;
      reject(new Error('Failed to load Razorpay SDK'));
    };
    document.head.appendChild(script);
  });
  return razorpayPromise;
}

/**
 * Opens Razorpay checkout for a subscription.
 * The SDK is lazy-loaded on first call — no global script tag needed.
 */
export async function openRazorpayCheckout(
  params: CreateSubscriptionResponse,
  userPhone: string | undefined,
  userName: string | undefined,
  onSuccess: (response: RazorpayPaymentResponse) => void,
  onDismiss: () => void,
  onFailure?: (error: { code: string; description: string; reason: string }) => void,
): Promise<void> {
  await loadRazorpaySDK();

  const options = {
    key: params.checkout_key,
    subscription_id: params.razorpay_subscription_id,
    name: 'SpotCompare',
    description: params.plan_type === 'annual' ? 'Annual Plan' : 'Monthly Plan',
    retry: {
      enabled: true,
      max_count: 4, // Razorpay-managed retries within checkout modal
    },
    timeout: 600, // 10 minutes (seconds) — covers UPI mandate creation
    prefill: {
      contact: userPhone ?? '',
      name: userName ?? '',
    },
    method: {
      card: true,
      upi: true,
      netbanking: true,
      wallet: true,
      emandate: true,
    },
    theme: { color: '#2563eb' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (response: any) => {
      onSuccess({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_subscription_id: response.razorpay_subscription_id,
        razorpay_signature: response.razorpay_signature,
      });
    },
    modal: {
      ondismiss: onDismiss,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rzp = new (window as any).Razorpay(options);

  // Capture payment failures (declined, UPI timeout, etc.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rzp.on('payment.failed', (resp: any) => {
    const err = resp.error ?? {};
    console.error('[Razorpay] Payment failed:', err);
    onFailure?.({
      code: err.code ?? 'UNKNOWN',
      description: err.description ?? 'Payment failed',
      reason: err.reason ?? 'unknown',
    });
  });

  rzp.open();
}
