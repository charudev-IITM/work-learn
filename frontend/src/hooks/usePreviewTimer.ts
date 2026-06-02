import { useState, useEffect, useRef, useCallback } from 'react';
import { previewTimerService, PREVIEW_DURATION_SECONDS } from '@comp-intel/shared/services/previewTimer';

interface UsePreviewTimerOptions {
  enabled: boolean;
  onExpire: () => void;
}

export interface UsePreviewTimerReturn {
  remainingSeconds: number;
  isPaused: boolean;
  showResumeOverlay: boolean;
  onResumeTap: () => void;
  isLoading: boolean;
}

const DISABLED_RETURN: UsePreviewTimerReturn = {
  remainingSeconds: 0,
  isPaused: false,
  showResumeOverlay: false,
  onResumeTap: () => {},
  isLoading: false,
};

export function usePreviewTimer({ enabled, onExpire }: UsePreviewTimerOptions): UsePreviewTimerReturn {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Server sync reference point
  const serverRemainingRef = useRef(0);
  const syncedAtRef = useRef(Date.now());
  const expiredRef = useRef(false);
  const isLoadingRef = useRef(true); // ref mirror of isLoading for sync reads in event handlers
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // Sync from server status — handles expiry detection
  const syncFromServer = useCallback((status: { remaining_seconds: number; paused: boolean; expired: boolean }) => {
    serverRemainingRef.current = status.remaining_seconds;
    syncedAtRef.current = Date.now();
    setRemainingSeconds(status.remaining_seconds);
    setIsPaused(status.paused);

    if (status.expired && !expiredRef.current) {
      expiredRef.current = true;
      setIsPaused(true);
      try { onExpireRef.current(); } catch { /* prevent callback errors from breaking timer */ }
    }
  }, []);

  // Initial sync + start timer on mount
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      isLoadingRef.current = false;
      return;
    }

    // Reset loading state when re-enabling (e.g., Continue Exploring)
    setIsLoading(true);
    isLoadingRef.current = true;

    let cancelled = false;

    const init = async () => {
      try {
        // start() is idempotent and returns full status
        const status = await previewTimerService.start();
        if (cancelled) return;

        syncFromServer(status);

        if (status.paused && !status.expired) {
          setShowResumeOverlay(true);
        }
      } catch {
        if (cancelled) return;
        // Fallback: show full duration paused — user taps resume to retry server sync
        serverRemainingRef.current = PREVIEW_DURATION_SECONDS;
        syncedAtRef.current = Date.now();
        setRemainingSeconds(PREVIEW_DURATION_SECONDS);
        setIsPaused(true);
        setShowResumeOverlay(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }
    };

    init();

    return () => { cancelled = true; };
  }, [enabled, syncFromServer]);

  // Countdown interval — ticks locally between server syncs
  useEffect(() => {
    if (!enabled || isPaused) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - syncedAtRef.current) / 1000);
      const display = Math.max(0, serverRemainingRef.current - elapsed);
      setRemainingSeconds(display);

      if (display <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        setIsPaused(true);
        clearInterval(interval);
        try { onExpireRef.current(); } catch { /* prevent callback errors from leaking interval */ }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, isPaused]);

  // Visibility change handler — pause on hide, show overlay on visible
  useEffect(() => {
    if (!enabled) return;

    const handleVisibility = () => {
      // Skip if we haven't completed initial server sync yet
      if (isLoadingRef.current) return;
      if (expiredRef.current) return;

      if (document.visibilityState === 'hidden') {
        setIsPaused(true);
        setShowResumeOverlay(true);
        previewTimerService.pause().catch(() => {});
      } else if (document.visibilityState === 'visible') {
        setShowResumeOverlay(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [enabled]);

  // Resume tap handler
  const onResumeTap = useCallback(async () => {
    if (expiredRef.current) return;

    try {
      const status = await previewTimerService.resume();
      syncFromServer(status);
      // syncFromServer handles expiry — just dismiss overlay
      setShowResumeOverlay(false);
    } catch {
      // Keep overlay visible for retry — user can tap again
    }
  }, [syncFromServer]);

  if (!enabled) return DISABLED_RETURN;

  return { remainingSeconds, isPaused, showResumeOverlay, onResumeTap, isLoading };
}
