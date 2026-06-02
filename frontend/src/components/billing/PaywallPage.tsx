import { useState, useRef, useEffect, useCallback } from 'react';
import { TrendingUp, Loader2, X, Zap, BarChart3, Bell, Calculator, Newspaper, Sparkles, Clock, CheckCircle2, AlertTriangle, RefreshCw, Play, Gift } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Button } from '../ui/button';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription, ACTIVE_STATUSES } from '../../contexts/SubscriptionContext';
import { openRazorpayCheckout, billingService } from '../../services/billing';
import { PLANS, type PlanType } from '@comp-intel/shared/types/billing';
import { useStats } from '../../hooks/useStats';
import { previewTimerService } from '@comp-intel/shared/services/previewTimer';
import { formatCountdown } from '@comp-intel/shared/lib/formatters';
import { TrialCelebration } from './TrialCelebration';

const STATIC_FEATURES = [
  { icon: BarChart3, text: 'Rate comparison, spreads & difference mode' },
  { icon: Sparkles, text: 'SONA AI — your personal bullion assistant' },
  { icon: Bell, text: 'Custom price alerts with instant notifications' },
  { icon: Calculator, text: 'Built-in calculator with live rate formulas' },
  { icon: Newspaper, text: 'Curated bullion news with market sentiment' },
];

const fireConfetti = () => {
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
  confetti({ ...defaults, particleCount: 50, origin: { x: 0.2, y: 0.6 } });
  confetti({ ...defaults, particleCount: 50, origin: { x: 0.8, y: 0.6 } });
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('declined') || msg.includes('failed') || msg.includes('insufficient')) {
      return 'Payment could not be processed. Please try again or use a different payment method.';
    }
    if (msg.includes('network') || msg.includes('timeout')) {
      return 'Could not confirm your payment. If money was deducted, it will be refunded within 5-7 days.';
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

// -- Checkout state persistence (sessionStorage) --
const CHECKOUT_KEY = 'billing:checkout_progress';

function saveCheckoutState(subId: string, planType: string) {
  sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify({
    subscriptionId: subId,
    planType,
    createdAt: Date.now(),
  }));
}

function clearCheckoutState() {
  sessionStorage.removeItem(CHECKOUT_KEY);
}

function getCheckoutState(): { subscriptionId: string; planType: string; createdAt: number } | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Expire after 15 minutes (stale checkout)
    if (Date.now() - parsed.createdAt > 15 * 60 * 1000) {
      sessionStorage.removeItem(CHECKOUT_KEY);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(CHECKOUT_KEY);
    return null;
  }
}

// -- Exponential backoff for payment polling --
const POLL_BASE_MS = 1_000;
const POLL_CAP_MS = 30_000;
const POLL_MAX_DURATION = 5 * 60 * 1000; // 5 minutes

function getPollDelay(attempt: number): number {
  const exponential = Math.min(POLL_CAP_MS, POLL_BASE_MS * Math.pow(2, attempt));
  return Math.random() * exponential; // full jitter
}

export function PaywallPage() {
  const { user, logout } = useAuth();
  const { subscription, createSubscription, refresh, claimTrial, forcePaywall, setForcePaywall } = useSubscription();
  const stats = useStats();
  const [isClaimingTrial, setIsClaimingTrial] = useState(false);

  const FEATURES = [
    { icon: Zap, text: `Live rates from ${stats.dealers}+ dealers across ${stats.cities}+ cities` },
    ...STATIC_FEATURES,
  ];
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [resumableCheckout, setResumableCheckout] = useState<{
    subscriptionId: string; planType: string;
  } | null>(null);

  // "Continue Exploring" state — shown when user exited preview with time remaining
  const [previewTimeRemaining, setPreviewTimeRemaining] = useState<number | null>(null);

  const subscribingRef = useRef(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // Check if user has preview time remaining
  useEffect(() => {
    const hasTime = sessionStorage.getItem('preview:has_time_remaining');
    if (!hasTime) return;

    previewTimerService.getStatus().then((status) => {
      if (!status.expired && status.remaining_seconds > 0) {
        setPreviewTimeRemaining(status.remaining_seconds);
      } else {
        // Expired — clean up
        sessionStorage.removeItem('preview:has_time_remaining');
      }
    }).catch(() => {
      // Keep banner visible — let user try Continue Exploring which will re-check
    });
  }, []);

  // Check for in-progress checkout from previous page load
  useEffect(() => {
    const saved = getCheckoutState();
    if (saved) {
      setResumableCheckout(saved);
    }
  }, []);

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 10000);
  }, []);

  const dismissError = () => {
    setError(null);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
  };

  const celebrateAndTransition = useCallback(() => {
    setPaymentSuccess(true);
    setAwaitingWebhook(false);
    setPollingTimedOut(false);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    // Clean up trial-choice-to-subscribe flag — subscription is confirmed
    localStorage.removeItem('trial_choice_subscribe');
    fireConfetti();
    // Refresh subscription context after celebration — retry once on failure
    setTimeout(() => {
      refresh().catch(() => {
        setTimeout(() => refresh().catch(() => {}), 3000);
      });
    }, 2500);
  }, [refresh]);

  // beforeunload warning during active checkout
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (awaitingWebhook || isProcessing) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [awaitingWebhook, isProcessing]);

  // Visibility API — check status when tab comes back to foreground
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && awaitingWebhook) {
        billingService.getStatus().then((status) => {
          if (status.status && ACTIVE_STATUSES.has(status.status)) {
            clearCheckoutState();
            celebrateAndTransition();
          }
        }).catch(() => { /* ignore */ });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [awaitingWebhook, celebrateAndTransition]);

  const startBackoffPolling = useCallback(() => {
    const pollStartTime = Date.now();
    let pollAttempt = 0;

    const pollWithBackoff = async () => {
      if (Date.now() - pollStartTime > POLL_MAX_DURATION) {
        setAwaitingWebhook(false);
        setPollingTimedOut(true);
        return;
      }

      try {
        const status = await billingService.getStatus();
        if (status.status && ACTIVE_STATUSES.has(status.status)) {
          clearCheckoutState();
          celebrateAndTransition();
          return;
        }
      } catch {
        // Ignore individual poll errors — backoff handles retries
      }

      const delay = getPollDelay(pollAttempt);
      pollAttempt++;
      pollTimeoutRef.current = setTimeout(pollWithBackoff, delay);
    };

    pollWithBackoff();
  }, [celebrateAndTransition]);

  const handleCheckoutSuccess = useCallback(async (response: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }) => {
    subscribingRef.current = false;
    setIsProcessing(false);
    setAwaitingWebhook(true);

    // Retry verify-payment 3x before falling back to polling
    let verifySuccess = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await billingService.verifyPayment(
          response.razorpay_payment_id,
          response.razorpay_subscription_id,
          response.razorpay_signature,
        );
        verifySuccess = true;
        break;
      } catch {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    if (verifySuccess) {
      clearCheckoutState();
      celebrateAndTransition();
    } else {
      // Fall back to exponential backoff polling
      startBackoffPolling();
    }
  }, [celebrateAndTransition, startBackoffPolling]);

  const handleSubscribe = async (planOverride?: PlanType) => {
    if (subscribingRef.current) return;
    subscribingRef.current = true;
    setError(null);
    setIsProcessing(true);

    const plan = planOverride ?? selectedPlan;
    try {
      const subData = await createSubscription(plan);
      saveCheckoutState(subData.razorpay_subscription_id, plan);
      setResumableCheckout(null);

      await openRazorpayCheckout(
        subData,
        user?.phone,
        user?.name,
        handleCheckoutSuccess,
        () => {
          // User dismissed Razorpay modal — just reset, no error
          // Don't clear sessionStorage — user might retry
          setIsProcessing(false);
          subscribingRef.current = false;
        },
        (error) => {
          setIsProcessing(false);
          subscribingRef.current = false;
          showError(error.description || 'Payment failed. Please try again.');
        },
      );
    } catch (err: unknown) {
      showError(getErrorMessage(err));
      setIsProcessing(false);
      subscribingRef.current = false;
    }
  };

  const handleRetryCheck = async () => {
    setPollingTimedOut(false);
    setAwaitingWebhook(true);
    try {
      const status = await billingService.getStatus();
      if (status.status && ACTIVE_STATUSES.has(status.status)) {
        clearCheckoutState();
        celebrateAndTransition();
        return;
      }
      // Still not active — tell user clearly
      setAwaitingWebhook(false);
      setPollingTimedOut(true);
      showError(
        status.status === 'created'
          ? 'Payment not yet received. If you completed payment, it may take a few minutes to process.'
          : `Subscription status: ${status.status}. Please contact support if payment was deducted.`
      );
    } catch {
      setAwaitingWebhook(false);
      setPollingTimedOut(true);
    }
  };

  const handleContinueExploring = useCallback(async () => {
    try {
      const status = await previewTimerService.resume();
      if (status.expired || status.remaining_seconds <= 0) {
        // Timer expired while on paywall — stay here, hide the banner
        sessionStorage.removeItem('preview:has_time_remaining');
        setPreviewTimeRemaining(null);
        return;
      }
    } catch {
      // Resume failed — don't enter preview without a confirmed running timer
      console.warn('Failed to resume preview timer, staying on paywall');
      return;
    }
    sessionStorage.removeItem('preview:has_time_remaining');
    localStorage.setItem('app_preview_active', 'true');
    window.dispatchEvent(new CustomEvent('onboarding:enter-preview'));
  }, []);

  const [trialSuccess, setTrialSuccess] = useState(false);

  const handleClaimTrial = useCallback(async () => {
    if (isClaimingTrial) return;
    setIsClaimingTrial(true);
    setError(null);
    try {
      await claimTrial();
      setTrialSuccess(true);
      fireConfetti();
      setTimeout(() => fireConfetti(), 800);
      // Refresh subscription context so isAccessGranted flips after celebration
      setTimeout(() => refresh().catch(() => {}), 2500);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to activate trial');
    } finally {
      setIsClaimingTrial(false);
    }
  }, [claimTrial, isClaimingTrial, showError, refresh]);

  const showStatusMessage =
    subscription?.status === 'halted' || subscription?.status === 'cancelled';

  // --- Trial Celebration UI ---
  if (trialSuccess) {
    return <TrialCelebration />;
  }

  // --- Subscription Celebration UI ---
  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">Spot Compare</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full">
          <div className="animate-[fadeIn_0.5s_ease-out] flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-[scaleIn_0.4s_ease-out]">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold">Welcome to SpotCompare Pro!</h1>
            <p className="text-muted-foreground">
              Your subscription is now active. Redirecting to your dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">Spot Compare</span>
        </div>
        {forcePaywall ? (
          <Button variant="ghost" size="sm" onClick={() => setForcePaywall(false)} className="text-muted-foreground">
            Back to App
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground">
            Sign Out
          </Button>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full">
        {showStatusMessage && (
          <div className="w-full mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-start gap-2">
              <X className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">
                  {subscription?.status === 'halted'
                    ? 'Payment failed'
                    : 'Subscription cancelled'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {subscription?.status === 'halted'
                    ? 'We were unable to charge your payment method. Please subscribe again.'
                    : 'Your subscription has ended. Resubscribe to regain access.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Continue Exploring banner — user has preview time left */}
        {previewTimeRemaining !== null && previewTimeRemaining > 0 && !awaitingWebhook && !isProcessing && (
          <div className="w-full mb-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                You have {formatCountdown(previewTimeRemaining)} left to explore
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleContinueExploring}>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Continue Exploring
            </Button>
          </div>
        )}

        {/* Recovery banner for in-progress checkout */}
        {resumableCheckout && !awaitingWebhook && !isProcessing && (
          <div className="w-full mb-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">
              You have a pending payment. Would you like to continue?
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                const savedPlan = resumableCheckout?.planType as PlanType | undefined;
                if (savedPlan) setSelectedPlan(savedPlan);
                handleSubscribe(savedPlan);
              }}>
                Resume Payment ({resumableCheckout?.planType})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                clearCheckoutState();
                setResumableCheckout(null);
              }} className="text-muted-foreground">
                Start Over
              </Button>
            </div>
          </div>
        )}

        {/* Limited Time Offer Ribbon */}
        <div className="w-full mb-4 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 shadow-md">
          <Clock className="w-4 h-4 animate-pulse" />
          <span className="text-sm font-bold tracking-wide">LIMITED TIME LAUNCH OFFER</span>
          <Clock className="w-4 h-4 animate-pulse" />
        </div>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">Unlock SpotCompare Pro</h1>
          <p className="text-muted-foreground text-sm">
            Real-time rates, AI insights & trading tools — all in one app
          </p>
        </div>

        {/* Plan Toggle */}
        <div className="w-full bg-muted rounded-xl p-1 flex mb-6">
          {(['monthly', 'annual'] as PlanType[]).map((plan) => (
            <button
              key={plan}
              onClick={() => setSelectedPlan(plan)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                selectedPlan === plan
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {PLANS[plan].label}
              {PLANS[plan].savings && (
                <span className="ml-2 text-xs text-green-600 font-semibold">
                  {PLANS[plan].savings}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Price Display */}
        <div className="w-full bg-card border rounded-xl p-6 mb-6 text-center relative overflow-hidden">
          {/* Discount Badge */}
          <div className="absolute -right-8 top-3 bg-red-500 text-white text-xs font-bold px-10 py-1 rotate-45 shadow-sm">
            {PLANS[selectedPlan].discount}
          </div>
          <div className="text-sm line-through text-muted-foreground/60 mb-1">
            {PLANS[selectedPlan].originalPrice}
          </div>
          <div className="text-4xl font-bold mb-1 text-green-600">{PLANS[selectedPlan].totalLabel}</div>
          {selectedPlan === 'annual' && (
            <div className="text-sm text-muted-foreground">{PLANS.annual.billedLabel}</div>
          )}
          <div className="text-xs text-muted-foreground/50 mt-1">
            incl. 18% GST
          </div>
        </div>

        {/* Features */}
        <ul className="w-full space-y-3 mb-8">
          {FEATURES.map((feature) => (
            <li key={feature.text} className="flex items-start gap-3 text-sm">
              <feature.icon className="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
              <span>{feature.text}</span>
            </li>
          ))}
        </ul>

        {/* Error Banner */}
        {error && (
          <div className="w-full mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg animate-[fadeIn_0.3s_ease-out]">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="flex-1 text-sm text-destructive">{error}</p>
              <button onClick={dismissError} className="text-destructive/60 hover:text-destructive shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* CTA / Status */}
        {awaitingWebhook ? (
          <div className="w-full flex flex-col items-center gap-2 py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Confirming your subscription...</p>
          </div>
        ) : pollingTimedOut ? (
          <div className="w-full flex flex-col items-center gap-3 py-4">
            <p className="text-sm text-muted-foreground text-center">
              Payment verification is taking longer than expected. Your payment may still be processing.
            </p>
            <Button variant="outline" size="sm" onClick={handleRetryCheck}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Check Status
            </Button>
          </div>
        ) : (
          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={() => handleSubscribe()}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...
              </>
            ) : (
              `Subscribe — ${PLANS[selectedPlan].totalLabel}`
            )}
          </Button>
        )}

        {/* Free Trial CTA — visible for existing users who haven't claimed */}
        {subscription?.free_trial_available && !awaitingWebhook && !isProcessing && (
          <button
            onClick={handleClaimTrial}
            disabled={isClaimingTrial}
            className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/5 transition-colors"
          >
            <Gift className="w-4 h-4" />
            <span className="text-sm font-semibold">
              {isClaimingTrial ? 'Activating...' : 'Or claim your free trial'}
            </span>
          </button>
        )}

        <p className="mt-4 text-xs text-muted-foreground text-center">
          Prices include 18% GST. Cancel anytime.
        </p>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
