import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/cn';

export interface CoachMarkTarget {
  selector: string;
  title: string;
  body: string;
}

interface CoachMarkOverlayProps {
  targets: CoachMarkTarget[];
  onComplete: () => void;
  onSkip: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MAX_RETRIES = 6;
const RETRY_INTERVAL = 500; // ms

export function CoachMarkOverlay({ targets, onComplete, onSkip }: CoachMarkOverlayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'above' | 'below'>('below');
  const [isVisible, setIsVisible] = useState(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const current = targets[currentIndex];
  const isLast = currentIndex === targets.length - 1;

  // Clean up retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Reset retry count when target changes
  useEffect(() => {
    retryCountRef.current = 0;
  }, [currentIndex]);

  // Measure target element position — retries if element not yet in DOM
  const measureTarget = useCallback(() => {
    if (!current) return;
    const el = document.querySelector(current.selector);
    if (!el) {
      // Retry — the target component may still be mounting/loading
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        retryTimerRef.current = setTimeout(() => measureTarget(), RETRY_INTERVAL);
        return;
      }
      // Exhausted retries — skip this coach mark
      if (isLast) {
        onComplete();
      } else {
        setCurrentIndex((i) => i + 1);
      }
      return;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    // Position tooltip above if target is in bottom 40% of screen
    setTooltipPosition(rect.top > window.innerHeight * 0.6 ? 'above' : 'below');
    setIsVisible(true);
  }, [current, isLast, onComplete]);

  useLayoutEffect(() => {
    measureTarget();
  }, [measureTarget]);

  // Re-measure on resize (orientation change)
  useEffect(() => {
    const handleResize = () => measureTarget();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [measureTarget]);

  // Fade in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleNext = () => {
    setIsVisible(false);
    setTimeout(() => {
      if (isLast) {
        onComplete();
      } else {
        setCurrentIndex((i) => i + 1);
        setIsVisible(true);
      }
    }, 200);
  };

  if (!targetRect || !current) return null;

  const padding = 8;
  const spotlightStyle = {
    top: targetRect.top - padding,
    left: targetRect.left - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
  };

  const rawTooltipTop = tooltipPosition === 'above'
    ? targetRect.top - padding - 12 // 12px gap
    : targetRect.top + targetRect.height + padding + 12;
  // Clamp to prevent rendering off-screen
  const tooltipTop = tooltipPosition === 'above'
    ? Math.max(8, rawTooltipTop)
    : Math.min(window.innerHeight - 180, rawTooltipTop);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[999] transition-opacity duration-200',
        isVisible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {/* Background overlay — click anywhere to skip */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onSkip}
      />

      {/* Spotlight cutout */}
      <div
        className="absolute rounded-xl pointer-events-none"
        style={{
          ...spotlightStyle,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          zIndex: 1000,
        }}
      />

      {/* Tooltip */}
      <div
        className={cn(
          'absolute z-[1001] w-72 max-w-[calc(100vw-32px)]',
          'bg-card border border-border rounded-2xl p-4 shadow-2xl',
          'transition-all duration-200',
          tooltipPosition === 'above' && 'transform -translate-y-full',
        )}
        style={{
          top: tooltipTop,
          left: Math.max(16, Math.min(
            targetRect.left + targetRect.width / 2 - 144,
            window.innerWidth - 288 - 16,
          )),
        }}
      >
        {/* Step counter */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">
            {currentIndex + 1} of {targets.length}
          </span>
          <button
            onClick={onSkip}
            className="p-1 rounded-md hover:bg-muted transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        <h3 className="text-sm font-semibold text-foreground mb-1">
          {current.title}
        </h3>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          {current.body}
        </p>

        <div className="flex gap-2">
          <Button
            onClick={handleNext}
            size="sm"
            className="flex-1 h-9 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold"
          >
            {isLast ? 'Got it!' : 'Next'}
            {!isLast && <ArrowRight className="w-3.5 h-3.5 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Default coach mark targets for the watchlist screen */
export const WATCHLIST_COACH_MARKS: CoachMarkTarget[] = [
  {
    selector: '[data-coach="watchlist-tabs"]',
    title: 'Switch Watchlists',
    body: 'Swipe or tap to switch between your watchlists. You can create up to 5.',
  },
  {
    selector: '[data-coach="view-mode-toggle"]',
    title: 'Toggle Buy/Sell Rates',
    body: 'Switch between Buy and Sell rates, or enable Differences mode to compare.',
  },
  {
    selector: '[data-coach="add-scripts-btn"]',
    title: 'Add More Scripts',
    body: 'Tap here to search and add more rate scripts from any dealer.',
  },
];
