import { useMemo, useState, useCallback } from 'react';
import { TrendingUp } from 'lucide-react';
import { useWatchlist } from '../../contexts/WatchlistContext';
import { useDealerMetadata } from '../../contexts/DealerMetadataContext';
import { useWatchlistRates } from '../../hooks/useWatchlistRates';
import { getRate } from '@comp-intel/shared/stores/rateStore';
import { WatchlistToolbar } from './WatchlistToolbar';
import { WatchlistCard } from './WatchlistCard';
import { WatchlistCompactRow } from './WatchlistCompactRow';
import { AlertDialog } from '../alerts/AlertDialog';
import { WatchlistSuggestions } from './WatchlistSuggestions';
import type { WatchlistRateData } from '@comp-intel/shared/types/watchlist';
import { cn } from '../../lib/cn';
import watchlistService from '@comp-intel/shared/services/watchlist';

export function WatchlistContent() {
  const {
    watchlists,
    currentWatchlistId,
    viewMode,
    sortMode,
    layoutMode,
    cityFilter,
    referenceScriptId,
    differenceType,
    removeScriptFromWatchlist,
    updateScriptMultiplier,
    setSortMode,
  } = useWatchlist();

  const { getDealerCity } = useDealerMetadata();

  const currentWatchlist = watchlists.find(w => w.id === currentWatchlistId);
  const scripts = currentWatchlist?.scripts || [];

  // Performance: only re-render when competitors in THIS watchlist update
  const _rateVersion = useWatchlistRates(scripts);

  // State for alert dialog
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertTarget, setAlertTarget] = useState<{
    dealerName: string; scriptName: string; buyRate: number; sellRate: number;
  } | null>(null);

  // State for custom order
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [hasCustomOrder, setHasCustomOrder] = useState(false);

  // Build rate data from scripts + rateStore
  const watchlistWithRates = useMemo(() => {
    return scripts.map((script) => {
      const rateInfo = getRate(script.dealerName, script.scriptName);
      const hasLiveData = !!rateInfo;
      const hasOriginalRates = script.originalRates?.buy || script.originalRates?.sell;

      const item: WatchlistRateData = {
        scriptId: script.id,
        competitor: script.dealerName,
        script: script.scriptDisplayName || rateInfo?.script_name || script.scriptName,
        productType: script.productType,
        buyRate: hasLiveData ? (rateInfo?.buy_rate || 0) : (script.originalRates?.buy || 0),
        sellRate: hasLiveData ? (rateInfo?.sell_rate || 0) : (script.originalRates?.sell || 0),
        timestamp: hasLiveData ? (rateInfo?.timestamp || script.addedAt) : (script.originalRates?.timestamp || script.addedAt),
        hasLiveData: hasLiveData || !!hasOriginalRates,
        multiplier: script.multiplier || 1,
      };
      return item;
    });
  }, [scripts, _rateVersion]);

  // Add differences when in differences mode
  const watchlistWithDifferences = useMemo(() => {
    if (viewMode !== 'differences' || !referenceScriptId) return watchlistWithRates;
    const ref = watchlistWithRates.find(i => i.scriptId === referenceScriptId);
    if (!ref) return watchlistWithRates;

    return watchlistWithRates.map(item => {
      if (item.scriptId === referenceScriptId) {
        return { ...item, buyDifference: 0, sellDifference: 0, isReference: true };
      }
      return {
        ...item,
        buyDifference: item.buyRate * (item.multiplier || 1) - ref.buyRate * (ref.multiplier || 1),
        sellDifference: item.sellRate * (item.multiplier || 1) - ref.sellRate * (ref.multiplier || 1),
        isReference: false,
      };
    });
  }, [watchlistWithRates, viewMode, referenceScriptId]);

  // Sort
  const sortedData = useMemo(() => {
    const data = viewMode === 'differences' ? watchlistWithDifferences : watchlistWithRates;

    if (hasCustomOrder && sortMode === 'none' && customOrder.length > 0) {
      const byId = new Map(data.map(d => [d.scriptId, d]));
      return customOrder.map(id => byId.get(id)).filter(Boolean) as WatchlistRateData[];
    }

    const sorted = [...data];
    switch (sortMode) {
      case 'rate-desc':
        return sorted.sort((a, b) => {
          const aR = viewMode === 'buy' ? a.buyRate * (a.multiplier || 1) : a.sellRate * (a.multiplier || 1);
          const bR = viewMode === 'buy' ? b.buyRate * (b.multiplier || 1) : b.sellRate * (b.multiplier || 1);
          return bR - aR;
        });
      case 'rate-asc':
        return sorted.sort((a, b) => {
          const aR = viewMode === 'buy' ? a.buyRate * (a.multiplier || 1) : a.sellRate * (a.multiplier || 1);
          const bR = viewMode === 'buy' ? b.buyRate * (b.multiplier || 1) : b.sellRate * (b.multiplier || 1);
          return aR - bR;
        });
      case 'difference-desc':
        if (viewMode === 'differences') {
          return sorted.sort((a, b) => {
            const aD = differenceType === 'buy' ? (a.buyDifference || 0) : (a.sellDifference || 0);
            const bD = differenceType === 'buy' ? (b.buyDifference || 0) : (b.sellDifference || 0);
            return Math.abs(bD) - Math.abs(aD);
          });
        }
        return sorted;
      case 'difference-asc':
        if (viewMode === 'differences') {
          return sorted.sort((a, b) => {
            const aD = differenceType === 'buy' ? (a.buyDifference || 0) : (a.sellDifference || 0);
            const bD = differenceType === 'buy' ? (b.buyDifference || 0) : (b.sellDifference || 0);
            return Math.abs(aD) - Math.abs(bD);
          });
        }
        return sorted;
      case 'dealer':
        return sorted.sort((a, b) => a.competitor.localeCompare(b.competitor));
      case 'added':
        return sorted.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      default:
        return sorted;
    }
  }, [watchlistWithRates, watchlistWithDifferences, sortMode, viewMode, differenceType, hasCustomOrder, customOrder]);

  // City filter
  const filteredData = useMemo(() => {
    if (!cityFilter) return sortedData;
    return sortedData.filter(item => getDealerCity(item.competitor) === cityFilter);
  }, [sortedData, cityFilter, getDealerCity]);

  // Reference rates for passing to children
  const refItem = useMemo(() => {
    if (!referenceScriptId) return undefined;
    return watchlistWithRates.find(i => i.scriptId === referenceScriptId);
  }, [watchlistWithRates, referenceScriptId]);

  // Handlers
  const handleRemove = useCallback((scriptId: string) => {
    if (currentWatchlistId) removeScriptFromWatchlist(currentWatchlistId, scriptId);
  }, [currentWatchlistId, removeScriptFromWatchlist]);

  const handleMultiplierChange = useCallback((scriptId: string, multiplier: number) => {
    if (currentWatchlistId) updateScriptMultiplier(currentWatchlistId, scriptId, multiplier);
  }, [currentWatchlistId, updateScriptMultiplier]);

  const handleAlertClick = useCallback((dealerName: string, scriptName: string, buyRate: number, sellRate: number) => {
    setAlertTarget({ dealerName, scriptName, buyRate, sellRate });
    setAlertDialogOpen(true);
  }, []);

  // Mobile reorder (move up/down)
  const handleMoveItem = useCallback((index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= filteredData.length) return;

    const ids = filteredData.map(d => d.scriptId);
    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];

    setCustomOrder(ids);
    setHasCustomOrder(true);
    setSortMode('none');

    // Persist to backend
    if (currentWatchlistId) {
      watchlistService.reorderScripts(currentWatchlistId, ids).catch(console.error);
    }
  }, [filteredData, currentWatchlistId, setSortMode]);

  const showReorderButtons = sortMode === 'none';

  if (!currentWatchlist) {
    return <div className="p-4 text-center text-muted-foreground">Watchlist not found</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <WatchlistToolbar sortedData={filteredData} scriptCount={filteredData.length} />

      <div data-coach="watchlist-rates" className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <TrendingUp className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              {cityFilter ? 'No scripts in this city' : 'Empty Watchlist'}
            </h3>
            <p className="text-muted-foreground">
              {cityFilter ? 'Try selecting a different city or "All Cities"' : 'Add scripts to track rates from different dealers'}
            </p>
          </div>
        ) : layoutMode === 'card' ? (
          <div className={cn('p-3 sm:p-4 space-y-3', viewMode === 'differences' && 'differences-mode')}>
            {filteredData.map((item, index) => {
              const script = scripts.find(s => s.id === item.scriptId);
              if (!script) return null;
              return (
                <WatchlistCard
                  key={item.scriptId}
                  script={script}
                  viewMode={viewMode}
                  differenceType={differenceType}
                  referenceScriptId={referenceScriptId}
                  referenceBuyRate={refItem?.buyRate}
                  referenceSellRate={refItem?.sellRate}
                  referenceMultiplier={refItem?.multiplier}
                  onRemove={() => handleRemove(item.scriptId)}
                  onMultiplierChange={handleMultiplierChange}
                  onAlertClick={handleAlertClick}
                  onMoveUp={() => handleMoveItem(index, 'up')}
                  onMoveDown={() => handleMoveItem(index, 'down')}
                  isFirst={index === 0}
                  isLast={index === filteredData.length - 1}
                  showReorderButtons={showReorderButtons}
                />
              );
            })}
          </div>
        ) : (
          /* Compact layout */
          <div className="p-2 sm:p-3 space-y-1">
            {filteredData.map((item, index) => {
              const script = scripts.find(s => s.id === item.scriptId);
              if (!script) return null;
              return (
                <WatchlistCompactRow
                  key={item.scriptId}
                  script={script}
                  viewMode={viewMode}
                  differenceType={differenceType}
                  referenceScriptId={referenceScriptId}
                  referenceBuyRate={refItem?.buyRate}
                  referenceSellRate={refItem?.sellRate}
                  referenceMultiplier={refItem?.multiplier}
                  onRemove={() => handleRemove(item.scriptId)}
                  onMultiplierChange={handleMultiplierChange}
                  onAlertClick={handleAlertClick}
                  onMoveUp={() => handleMoveItem(index, 'up')}
                  onMoveDown={() => handleMoveItem(index, 'down')}
                  isFirst={index === 0}
                  isLast={index === filteredData.length - 1}
                  showReorderButtons={showReorderButtons}
                />
              );
            })}
          </div>
        )}

        {/* Suggestion Cards */}
        {currentWatchlistId && <WatchlistSuggestions watchlistId={currentWatchlistId} />}
      </div>

      {/* Alert Dialog */}
      {alertTarget && (
        <AlertDialog
          open={alertDialogOpen}
          onOpenChange={setAlertDialogOpen}
          dealerName={alertTarget.dealerName}
          scriptName={alertTarget.scriptName}
          currentBuyRate={alertTarget.buyRate}
          currentSellRate={alertTarget.sellRate}
        />
      )}
    </div>
  );
}
