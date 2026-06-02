import { useSyncExternalStore, useMemo, useCallback } from 'react';
import { subscribe, getVersion } from '@comp-intel/shared/stores/rateStore';
import type { WatchlistScript } from '@comp-intel/shared/types/watchlist';

/**
 * Composite version hook: only triggers a re-render when a competitor
 * that is actually in the current watchlist receives new data.
 *
 * Replaces the old useGlobalRateVersion() which re-rendered on every
 * update from all 16+ competitors, even if the watchlist only contained 3.
 */
export function useWatchlistRates(scripts: WatchlistScript[]): number {
  // Build a stable list of unique competitor names
  const competitors = useMemo(() => {
    const set = new Set<string>();
    for (const s of scripts) set.add(s.dealerName);
    return Array.from(set).sort();
  }, [scripts]);

  // Stable snapshot reference — only changes when competitors list changes.
  // Prevents useSyncExternalStore from re-subscribing on every render.
  const getSnapshot = useCallback(() => {
    let composite = 0;
    for (const c of competitors) {
      composite += getVersion(c);
    }
    return composite;
  }, [competitors]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
