import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { OnboardingProvider, useOnboarding, type WizardStep } from '../../contexts/OnboardingContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { Skeleton } from '../ui/skeleton';
import { WizardShell } from './ui/WizardShell';
import { WelcomeStep } from './steps/WelcomeStep';
import { ThemeStep } from './steps/ThemeStep';
import { CommodityStep } from './steps/CommodityStep';
import { DealerStep } from './steps/DealerStep';
import { cn } from '../../lib/cn';

function WizardContent() {
  const {
    currentStep,
    stepIndex,
    totalSteps,
    isLoading,
    direction,
    nextStep,
    prevStep,
    finishWizard,
    skipToEnd,
  } = useOnboarding();

  const [animating, setAnimating] = useState(false);
  const [displayedStep, setDisplayedStep] = useState<WizardStep>(currentStep);
  const [animDir, setAnimDir] = useState<'forward' | 'backward'>('forward');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevStepRef = useRef(currentStep);
  const { subscription } = useSubscription();

  // Animate step transitions
  useEffect(() => {
    if (currentStep !== prevStepRef.current) {
      setAnimDir(direction);
      setAnimating(true);
      const timeout = setTimeout(() => {
        setDisplayedStep(currentStep);
        setAnimating(false);
      }, 200);
      prevStepRef.current = currentStep;
      return () => clearTimeout(timeout);
    }
  }, [currentStep, direction]);

  // Show loading while restoring state
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col">
        {/* Progress bar skeleton */}
        <div className="px-5 pt-4 pb-3">
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
        {/* Step content skeleton */}
        <div className="flex-1 flex flex-col items-center px-6 pt-12 space-y-6">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
          <div className="w-full max-w-sm space-y-3 mt-8">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </div>
        {/* Bottom CTA skeleton */}
        <div className="px-5 py-3">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // Show transition state when creating watchlist
  if (isTransitioning) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        <p className="text-muted-foreground text-sm">Building your watchlist...</p>
      </div>
    );
  }

  // Determine routing mode from platform settings (default to 'trial' if subscription data hasn't loaded yet)
  const routingMode: 'trial' | 'preview' | 'paywall' = !subscription ? 'trial'
    : subscription.free_trial_available ? 'trial'
    : subscription.preview_enabled ? 'preview'
    : 'paywall';

  // Dealer step → create watchlist → route based on platform settings
  const handleDealerNext = async () => {
    setIsTransitioning(true);
    await finishWizard(routingMode);
  };

  // Determine shell props based on current step
  const showBack = stepIndex > 0 && displayedStep !== 'welcome';
  const showProgress = displayedStep !== 'welcome';

  const renderStep = () => {
    switch (displayedStep) {
      case 'welcome':
        return <WelcomeStep onNext={nextStep} />;
      case 'theme':
        return <ThemeStep onNext={nextStep} />;
      case 'commodities':
        return <CommodityStep onNext={nextStep} />;
      case 'dealers':
        return <DealerStep onNext={handleDealerNext} />;
      default:
        return null;
    }
  };

  return (
    <WizardShell
      currentStep={stepIndex}
      totalSteps={totalSteps}
      showBack={showBack}
      showSkip={false}
      showProgress={showProgress}
      onBack={prevStep}
      onSkip={() => skipToEnd(routingMode)}
    >
      <div
        className={cn(
          'flex-1 flex flex-col transition-all duration-200',
          animating && animDir === 'forward' && 'opacity-0 translate-x-8',
          animating && animDir === 'backward' && 'opacity-0 -translate-x-8',
          !animating && 'opacity-100 translate-x-0',
        )}
      >
        {renderStep()}
      </div>
    </WizardShell>
  );
}

export default function OnboardingWizard() {
  return (
    <OnboardingProvider>
      <WizardContent />
    </OnboardingProvider>
  );
}
