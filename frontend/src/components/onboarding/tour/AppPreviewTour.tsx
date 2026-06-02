import { useState, useEffect, useCallback } from 'react';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { Button } from '../../ui/button';
import { CoachMarkOverlay, type CoachMarkTarget } from './CoachMarkOverlay';
import { useNavigation, type AppView } from '../../../contexts/NavigationContext';
import { cn } from '../../../lib/cn';

interface TourPhase {
  view?: AppView;
  targets: CoachMarkTarget[];
}

const TOUR_PHASES: TourPhase[] = [
  {
    view: 'watchlist',
    targets: [
      {
        selector: '[data-coach="watchlist-rates"]',
        title: 'Live Rates',
        body: 'Real-time buy & sell rates from your selected dealers, updated every second.',
      },
    ],
  },
  {
    view: 'watchlist',
    targets: [
      {
        selector: '[data-coach="view-mode-toggle"]',
        title: 'Compare Rates',
        body: 'Switch between Buy, Sell, and Diff mode to compare dealers side by side.',
      },
    ],
  },
  {
    view: 'watchlist',
    targets: [
      {
        selector: '[data-coach="add-scripts-btn"]',
        title: 'Add More Scripts',
        body: 'Search and add rate scripts from any dealer in our network.',
      },
    ],
  },
  {
    view: 'dashboard',
    targets: [
      {
        selector: '[data-coach="dashboard-home"]',
        title: 'Your Dashboard',
        body: 'Market overview, price alerts, and top rates — all in one place.',
      },
    ],
  },
  {
    targets: [
      {
        selector: '[data-coach="goldie-orb"]',
        title: 'Meet SONA AI',
        body: 'Your AI assistant for gold market insights, rate queries, and more.',
      },
    ],
  },
];

interface AppPreviewTourProps {
  onSubscribe?: () => void;
}

export function AppPreviewTour({ onSubscribe }: AppPreviewTourProps) {
  const [phaseIndex, setPhaseIndex] = useState(-1); // -1 = not started
  const [showCoach, setShowCoach] = useState(false);
  const [showCTA, setShowCTA] = useState(false);
  const { navigate } = useNavigation();
  // Start tour after a short delay if pending
  useEffect(() => {
    const pending = localStorage.getItem('app_preview_tour_pending');
    if (pending !== 'true') return;

    const timer = setTimeout(() => setPhaseIndex(0), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Navigate + show coach mark for current phase
  useEffect(() => {
    if (phaseIndex < 0 || phaseIndex >= TOUR_PHASES.length) return;

    const phase = TOUR_PHASES[phaseIndex];
    setShowCoach(false);

    if (phase.view) {
      navigate(phase.view);
      // Wait for view to render before showing coach marks
      const timer = setTimeout(() => setShowCoach(true), 800);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setShowCoach(true), 300);
      return () => clearTimeout(timer);
    }
  }, [phaseIndex, navigate]);

  const advancePhase = useCallback(() => {
    const nextPhase = phaseIndex + 1;
    if (nextPhase >= TOUR_PHASES.length) {
      // Tour complete — show final CTA
      setShowCoach(false);
      setShowCTA(true);
      localStorage.removeItem('app_preview_tour_pending');
    } else {
      setPhaseIndex(nextPhase);
    }
  }, [phaseIndex]);

  const skipTour = useCallback(() => {
    setShowCoach(false);
    setShowCTA(false);
    setPhaseIndex(-1);
    localStorage.removeItem('app_preview_tour_pending');
  }, []);

  // Not started or dismissed
  if (phaseIndex < 0 && !showCTA) return null;

  // Show coach mark for current phase
  if (showCoach && phaseIndex >= 0 && phaseIndex < TOUR_PHASES.length) {
    return (
      <CoachMarkOverlay
        targets={TOUR_PHASES[phaseIndex].targets}
        onComplete={advancePhase}
        onSkip={skipTour}
      />
    );
  }

  // Final CTA overlay
  if (showCTA) {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" onClick={skipTour} />
        <div
          className={cn(
            'relative z-[1001] w-80 max-w-[calc(100vw-32px)]',
            'bg-card border border-border rounded-2xl p-6 shadow-2xl',
            'text-center animate-in fade-in-0 zoom-in-95 duration-300',
          )}
        >
          <button
            onClick={skipTour}
            className="absolute top-3 right-3 p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-amber-500" />
          </div>

          <h3 className="text-lg font-semibold text-foreground mb-2">
            You're All Set!
          </h3>
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            {onSubscribe
              ? 'Subscribe to unlock real-time rates, price alerts, SONA AI, and more.'
              : 'Explore real-time rates, price alerts, SONA AI, and more.'}
          </p>

          <div className="flex flex-col gap-2">
            {onSubscribe ? (
              <Button
                onClick={onSubscribe}
                className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold"
              >
                Subscribe to Unlock
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            ) : (
              <Button
                onClick={skipTour}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold"
              >
                Start Exploring
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}
            {onSubscribe && (
              <button
                onClick={skipTour}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                Keep exploring
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
