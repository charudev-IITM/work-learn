import { useRef, useCallback, useState, type CSSProperties, type TouchEventHandler } from 'react';

const DISMISS_THRESHOLD = -80; // px — swipe left past this to dismiss
const VERTICAL_ABORT_RATIO = 1.5; // abort if |deltaY| > ratio * |deltaX| early

interface UseSwipeDismissOptions {
  onDismiss: () => void;
}

interface UseSwipeDismissReturn {
  handlers: {
    onTouchStart: TouchEventHandler;
    onTouchMove: TouchEventHandler;
    onTouchEnd: TouchEventHandler;
  };
  style: CSSProperties;
  isDismissing: boolean;
}

export function useSwipeDismiss({ onDismiss }: UseSwipeDismissOptions): UseSwipeDismissReturn {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const aborted = useRef(false);
  const [translateX, setTranslateX] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);

  const onTouchStart: TouchEventHandler = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = 0;
    aborted.current = false;
    setIsDismissing(false);
  }, []);

  const onTouchMove: TouchEventHandler = useCallback((e) => {
    if (aborted.current) return;

    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;

    // Abort swipe if vertical scroll is dominant (early in gesture)
    if (Math.abs(deltaX) < 10 && Math.abs(deltaY) > Math.abs(deltaX) * VERTICAL_ABORT_RATIO) {
      aborted.current = true;
      setTranslateX(0);
      return;
    }

    // Only allow left swipe (negative deltaX)
    if (deltaX > 0) {
      currentX.current = 0;
      setTranslateX(0);
      return;
    }

    currentX.current = deltaX;
    setTranslateX(deltaX);
  }, []);

  const onTouchEnd: TouchEventHandler = useCallback(() => {
    if (aborted.current) return;

    if (currentX.current < DISMISS_THRESHOLD) {
      // Dismiss: animate out to the left
      setIsDismissing(true);
      setTranslateX(-window.innerWidth);
      setTimeout(onDismiss, 200);
    } else {
      // Snap back
      setTranslateX(0);
    }
    currentX.current = 0;
  }, [onDismiss]);

  const opacity = isDismissing ? 0 : Math.max(0, 1 - Math.abs(translateX) / 200);

  const style: CSSProperties = {
    transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
    opacity,
    transition: translateX === 0 || isDismissing ? 'transform 0.2s ease-out, opacity 0.2s ease-out' : 'none',
  };

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    style,
    isDismissing,
  };
}
