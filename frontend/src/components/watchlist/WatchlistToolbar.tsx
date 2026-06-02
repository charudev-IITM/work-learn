import { useMemo } from 'react';
import { useWatchlist } from '../../contexts/WatchlistContext';
import { ViewModeToggle } from './ViewModeToggle';
import { LayoutToggle } from './LayoutToggle';
import { CityFilter } from './CityFilter';
import { SortDropdown } from './SortDropdown';
import { DifferencesConfig } from './DifferencesConfig';
import { getRate } from '@comp-intel/shared/stores/rateStore';
import { useWatchlistRates } from '../../hooks/useWatchlistRates';
import type { WatchlistRateData } from '@comp-intel/shared/types/watchlist';
import { isDataStale } from '@comp-intel/shared/lib/formatters';
import { cn } from '../../lib/cn';

interface WatchlistToolbarProps {
  sortedData: WatchlistRateData[];
  scriptCount: number;
}

export function WatchlistToolbar({ sortedData, scriptCount }: WatchlistToolbarProps) {
  const { viewMode, watchlists, currentWatchlistId } = useWatchlist();
  const currentWatchlist = watchlists.find(w => w.id === currentWatchlistId);
  const scripts = currentWatchlist?.scripts || [];

  // Subscribe to rate changes so freshness re-evaluates on every tick
  const _rateVersion = useWatchlistRates(scripts);

  // Determine freshness by reading directly from the rateStore (source of truth)
  const hasAnyFreshData = useMemo(() => {
    return scripts.some((s) => {
      const rate = getRate(s.dealerName, s.scriptName);
      if (!rate?.timestamp) return false;
      return !isDataStale(rate.timestamp);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scripts, _rateVersion]);

  return (
    <div className="sticky top-0 bg-background/95 backdrop-blur border-b z-10 space-y-2 p-2 sm:p-3">
      {/* Top row: name, live indicator, controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h2 className="text-sm sm:text-base font-semibold truncate">
            {currentWatchlist?.name || 'Watchlist'}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                hasAnyFreshData ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
              )}
            />
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {hasAnyFreshData ? 'Live' : 'Stale'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {scriptCount} script{scriptCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <CityFilter />
          <LayoutToggle />
          <SortDropdown />
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex justify-center px-2">
        <ViewModeToggle />
      </div>

      {/* Differences config (conditional) */}
      {viewMode === 'differences' && <DifferencesConfig sortedData={sortedData} />}
    </div>
  );
}

