import React, { useRef, useEffect, lazy, Suspense } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AuthPage } from './AuthPage';

const OnboardingWizard = lazy(() => import('../onboarding/OnboardingWizard'));
const TrialChoiceScreen = lazy(() => import('../billing/TrialChoiceScreen'));

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, flowStep } = useAuth();
  const initialCheckDone = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      initialCheckDone.current = true;
    }
  }, [isLoading]);

  // Show loading spinner only during initial session validation
  if (isLoading && !initialCheckDone.current) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col items-center justify-center">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Spot Compare</h1>
            <p className="text-muted-foreground">Bullion Rate Tracker</p>
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>

        {/* Progress Dots */}
        <div className="flex items-center gap-2 mt-8">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    );
  }

  // App preview: user finished wizard, now exploring the real app before subscribing
  if (flowStep === 'app_preview' && isAuthenticated) {
    return <>{children}</>;
  }

  // Show onboarding wizard (user is authenticated but hasn't finished setup)
  if (flowStep === 'onboarding_wizard' && isAuthenticated) {
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }>
        <OnboardingWizard />
      </Suspense>
    );
  }

  // Trial choice: user finished onboarding, must choose Subscribe or Free Trial
  if (flowStep === 'trial_choice' && isAuthenticated) {
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }>
        <TrialChoiceScreen />
      </Suspense>
    );
  }

  // Show auth page if not authenticated
  if (!isAuthenticated) {
    return <AuthPage />;
  }

  // User is authenticated and onboarding complete, show protected content
  return <>{children}</>;
}
