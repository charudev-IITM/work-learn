import { useState, useCallback, useEffect } from 'react';
import { TrendingUp, Gift, CreditCard, Loader2, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { authStorage } from '../../services/auth';
import { TrialCelebration } from './TrialCelebration';

const fireTrialConfetti = () => {
  const end = Date.now() + 1500;
  const colors = ['#fbbf24', '#f59e0b', '#d97706', '#10b981', '#34d399'];
  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors,
      zIndex: 9999,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors,
      zIndex: 9999,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
};

export default function TrialChoiceScreen() {
  const { claimTrial, subscription, refresh } = useSubscription();
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimedDays, setClaimedDays] = useState(7);
  const [error, setError] = useState<string | null>(null);

  // Only fetch if subscription data isn't already loaded (e.g., from SubscriptionProvider)
  useEffect(() => { if (!subscription) refresh(); }, [subscription, refresh]);

  const trialAvailable = subscription?.free_trial_available === true;

  const handleClaimTrial = useCallback(async () => {
    if (isClaiming) return;
    setIsClaiming(true);
    setError(null);
    try {
      const result = await claimTrial();
      setClaimedDays(result.days_remaining);
      setClaimed(true);
      fireTrialConfetti();
      // Clean up flow step persistence
      sessionStorage.removeItem('onboarding:trial_choice');
      // Update stored user to reflect onboarding_complete
      const user = authStorage.getUser();
      if (user) authStorage.setUser({ ...user, needs_onboarding: false });
      // Transition to authenticated after celebration (reuses existing event)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('onboarding:complete'));
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to activate trial');
      setIsClaiming(false);
    }
  }, [claimTrial, isClaiming]);

  const handleSubscribe = useCallback(() => {
    // Clean up flow step persistence
    sessionStorage.removeItem('onboarding:trial_choice');
    // Mark that user chose to subscribe from trial choice — persists across browser restart
    // This flag is checked by AuthContext.initializeAuth to skip onboarding_wizard
    localStorage.setItem('trial_choice_subscribe', 'true');
    window.dispatchEvent(new CustomEvent('onboarding:complete'));
  }, []);

  if (claimed) {
    return <TrialCelebration message={`Enjoy full access for ${claimedDays} days. Redirecting...`} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-center p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">Spot Compare</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full">
        {/* Celebration icon */}
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mb-6 shadow-lg">
          <Sparkles className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-2xl font-bold text-center mb-2">You're All Set!</h1>
        <p className="text-muted-foreground text-center text-sm mb-8">
          Your watchlist is ready. Choose how you'd like to get started.
        </p>

        {/* Trial option */}
        {trialAvailable && (
          <button
            onClick={handleClaimTrial}
            disabled={isClaiming}
            className="w-full mb-4 p-5 rounded-xl border-2 border-amber-500/50 bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 transition-all text-left group"
          >
            <div className="flex items-center gap-3 mb-2">
              <Gift className="w-5 h-5 text-amber-500" />
              <span className="font-semibold text-lg">
                {isClaiming ? 'Activating...' : 'Claim Free Trial'}
              </span>
              {isClaiming && <Loader2 className="w-4 h-4 animate-spin text-amber-500" />}
            </div>
            <p className="text-sm text-muted-foreground">
              Get full access to all features — completely free. No credit card required.
            </p>
          </button>
        )}

        {/* Subscribe option */}
        <button
          onClick={handleSubscribe}
          className="w-full p-5 rounded-xl border bg-card hover:bg-muted/50 transition-all text-left"
        >
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="w-5 h-5 text-primary" />
            <span className="font-semibold text-lg">Subscribe Now</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Start your subscription today with our launch pricing.
          </p>
        </button>

        {error && (
          <p className="mt-4 text-sm text-destructive text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
