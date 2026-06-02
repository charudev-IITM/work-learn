import { useSyncExternalStore, useMemo, useCallback } from 'react';
import { subscribe, getVersion } from '@comp-intel/shared/stores/rateStore';
import type { WatchlistScript } from '@comp-intel/shared/types/watchlist';

export function useWatchlistRates(scripts: WatchlistScript[]): number {
  const competitors = useMemo(() => {
    const set = new Set<string>();
    for (const s of scripts) set.add(s.dealerName);
    return Array.from(set).sort();
  }, [scripts]);

  const getSnapshot = useCallback(() => {
    let composite = 0;
    for (const c of competitors) {
      composite += getVersion(c);
    }
    return composite;
  }, [competitors]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
