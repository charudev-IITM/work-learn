import { useSyncExternalStore } from 'react'
import { getVersion, getGlobalVersion, subscribe } from '@comp-intel/shared/stores/rateStore'

/**
 * Subscribe to version changes for a specific competitor.
 * Component re-renders only when that competitor's data changes.
 */
export function useRateVersion(competitor: string): number {
  return useSyncExternalStore(
    subscribe,
    () => getVersion(competitor)
  )
}

/**
 * Subscribe to any rate store change.
 * Use sparingly - re-renders on every competitor update.
 */
export function useGlobalRateVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => getGlobalVersion()
  )
}
