import { Loader2, TrendingUp } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import { PaywallPage } from './PaywallPage';

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { isAccessGranted, isLoading, forcePaywall } = useSubscription();
  const { flowStep } = useAuth();

  // During app preview, bypass subscription check entirely
  if (flowStep === 'app_preview') return <>{children}</>;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col items-center justify-center">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Spot Compare</h1>
            <p className="text-muted-foreground">Bullion Rate Tracker</p>
          </div>
        </div>
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAccessGranted || forcePaywall) {
    return <PaywallPage />;
  }

  return <>{children}</>;
}
