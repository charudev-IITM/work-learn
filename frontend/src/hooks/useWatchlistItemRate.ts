import { useSyncExternalStore } from 'react';
import { subscribe, getVersion, getRate, RateEntry } from '@comp-intel/shared/stores/rateStore';

/**
 * Per-item rate hook. The component only re-renders when the specific
 * competitor's data changes — not on every WebSocket tick.
 *
 * Returns the RateEntry (or undefined) plus a version number that
 * React uses to decide whether to re-render.
 */
export function useWatchlistItemRate(
  competitor: string,
  symbol: string
): { rate: RateEntry | undefined; version: number } {
  const version = useSyncExternalStore(
    subscribe,
    () => getVersion(competitor)
  );

  // getRate is a cheap Map.get — no allocation unless the value changed
  const rate = getRate(competitor, symbol);

  return { rate, version };
}
