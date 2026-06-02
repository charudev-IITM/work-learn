import { CreditCard, AlertTriangle } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { cn } from '../../lib/cn';

export function SubscriptionBadge() {
  const { subscription } = useSubscription();

  if (!subscription || subscription.status === 'admin_exempt') return null;
  if (!subscription.has_subscription) return null;

  const isWarning = subscription.status === 'pending' || subscription.status === 'halted';
  const label = subscription.plan_type === 'annual' ? 'Annual' : 'Monthly';

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        isWarning
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
          : 'bg-primary/10 text-primary'
      )}
    >
      {isWarning ? <AlertTriangle className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
      {isWarning ? 'Payment issue' : label}
    </div>
  );
}
