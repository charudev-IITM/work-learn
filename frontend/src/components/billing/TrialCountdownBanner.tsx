import { Gift, Clock } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';

export function TrialCountdownBanner() {
  const { subscription, setForcePaywall } = useSubscription();

  if (subscription?.status !== 'trial_active') return null;

  const days = subscription.trial_days_remaining;
  const isUrgent = days <= 1;

  const handleSubscribe = () => {
    setForcePaywall(true);
  };

  return (
    <div className={`shrink-0 flex items-center justify-between px-4 py-2.5 text-white ${
      isUrgent
        ? 'bg-gradient-to-r from-red-500 to-orange-500'
        : 'bg-gradient-to-r from-amber-500 to-amber-600'
    }`}>
      <div className="flex items-center gap-2 min-w-0">
        <Gift className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium truncate">
          {days === 0
            ? 'Trial ends today'
            : `${days} day${days !== 1 ? 's' : ''} left in trial`}
        </span>
        {isUrgent && <Clock className="w-3 h-3 animate-pulse" />}
      </div>
      <button
        onClick={handleSubscribe}
        className="shrink-0 ml-3 px-4 py-1.5 bg-white text-amber-700 text-sm font-semibold rounded-full hover:bg-amber-50 active:bg-amber-100 transition-colors"
      >
        Subscribe
      </button>
    </div>
  );
}
