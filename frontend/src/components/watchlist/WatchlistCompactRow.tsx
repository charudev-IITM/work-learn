import React, { useState, useCallback } from 'react';
import { ChevronUp, ChevronDown, Trash2, Bell } from 'lucide-react';
import { Button } from '../ui/button';
import { AnimatedPrice } from '../ui/animated-price';
import { MultiplierControls } from './BrowseShared';
import { formatCurrency, isDataStale, isVeryStale } from '@comp-intel/shared/lib/formatters';
import { cn } from '../../lib/cn';
import { useWatchlistItemRate } from '../../hooks/useWatchlistItemRate';
import type { WatchlistScript, ViewMode } from '@comp-intel/shared/types/watchlist';

interface WatchlistCompactRowProps {
  script: WatchlistScript;
  viewMode: ViewMode;
  differenceType: 'buy' | 'sell';
  referenceScriptId?: string;
  referenceBuyRate?: number;
  referenceSellRate?: number;
  referenceMultiplier?: number;
  onRemove: () => void;
  onMultiplierChange: (scriptId: string, multiplier: number) => void;
  onAlertClick: (dealerName: string, scriptName: string, buyRate: number, sellRate: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  showReorderButtons?: boolean;
}

export const WatchlistCompactRow = React.memo(function WatchlistCompactRow({
  script,
  viewMode,
  differenceType,
  referenceScriptId,
  referenceBuyRate,
  referenceSellRate,
  referenceMultiplier,
  onRemove,
  onMultiplierChange,
  onAlertClick,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  showReorderButtons,
}: WatchlistCompactRowProps) {
  const { rate } = useWatchlistItemRate(script.dealerName, script.scriptName);

  const [isExpanded, setIsExpanded] = useState(false);

  const multiplier = script.multiplier || 1;
  const hasLiveData = !!rate;
  const buyRate = hasLiveData ? (rate?.buy_rate || 0) : (script.originalRates?.buy || 0);
  const sellRate = hasLiveData ? (rate?.sell_rate || 0) : (script.originalRates?.sell || 0);
  const timestamp = hasLiveData ? (rate?.timestamp || script.addedAt) : (script.originalRates?.timestamp || script.addedAt);
  const hasRates = (hasLiveData || !!(script.originalRates?.buy || script.originalRates?.sell)) && (buyRate > 0 || sellRate > 0);
  const dataStale = isDataStale(timestamp);
  const veryStale = isVeryStale(timestamp);

  const isReference = script.id === referenceScriptId;

  // Differences
  let displayDiff = 0;
  if (viewMode === 'differences' && referenceScriptId && !isReference && referenceBuyRate !== undefined) {
    const bDiff = buyRate * multiplier - (referenceBuyRate || 0) * (referenceMultiplier || 1);
    const sDiff = sellRate * multiplier - (referenceSellRate || 0) * (referenceMultiplier || 1);
    displayDiff = differenceType === 'buy' ? bDiff : sDiff;
  }

  const rawPrimaryRate = viewMode === 'buy' ? buyRate : sellRate;
  const primaryRate = rawPrimaryRate > 0 ? rawPrimaryRate * multiplier : 0;
  const hasPrimaryRate = rawPrimaryRate > 0;

  // In diff mode, the "actual rate" uses differenceType (buy or sell)
  const diffActualRate = differenceType === 'buy' ? buyRate * multiplier : sellRate * multiplier;
  const hasDiffActualRate = (differenceType === 'buy' ? buyRate : sellRate) > 0;

  const handleTap = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, [role="button"]')) return;
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <div
      className={cn(
        'rounded-lg transition-colors',
        'bg-card hover:bg-muted/50',
        'border border-transparent',
        viewMode === 'differences' && isReference && 'border-blue-400/40 bg-blue-50/20 dark:bg-blue-950/20',
        !hasRates && 'opacity-60',
        veryStale && hasRates && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={handleTap}>
        {/* Freshness dot */}
        <div className={cn(
          'w-1.5 h-1.5 rounded-full shrink-0',
          !hasRates ? 'bg-gray-300 dark:bg-gray-600' : dataStale ? 'bg-amber-500' : 'bg-green-500'
        )} />

        {/* Dealer name (truncated) */}
        <span className="text-sm font-semibold truncate w-24 sm:w-32 shrink-0 text-gray-900 dark:text-gray-100">
          {script.dealerName}
        </span>

        {/* Script */}
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {script.scriptDisplayName || rate?.script_name || script.scriptName}
          {multiplier !== 1 && <span className="ml-1 text-blue-500 font-medium">x{multiplier}</span>}
        </span>

        {/* Rate */}
        <div className="shrink-0 text-right">
          {viewMode === 'differences' ? (
            isReference ? (
              <div className="flex items-center gap-1.5 justify-end">
                <span className="text-[10px] font-bold text-blue-500">REF</span>
                {hasDiffActualRate && (
                  <span className="text-xs font-mono text-muted-foreground">{formatCurrency(diffActualRate)}</span>
                )}
              </div>
            ) : hasRates ? (
              <div>
                <AnimatedPrice
                  value={displayDiff}
                  formatter={(v) => (v >= 0 ? `+${formatCurrency(v)}` : formatCurrency(v))}
                  showTrend
                  className={cn(
                    'text-sm font-bold font-mono',
                    Math.abs(displayDiff) > 10
                      ? displayDiff > 0 ? 'text-red-500' : 'text-green-500'
                      : 'text-muted-foreground'
                  )}
                />
                {hasDiffActualRate && (
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {formatCurrency(diffActualRate)}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">--</span>
            )
          ) : hasPrimaryRate ? (
            <AnimatedPrice
              value={primaryRate}
              formatter={formatCurrency}
              showTrend
              className={cn(
                'text-sm font-bold font-mono',
                viewMode === 'buy' ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'
              )}
            />
          ) : (
            <span className="text-sm text-muted-foreground">--</span>
          )}
        </div>

        {/* Reorder buttons */}
        {showReorderButtons && (
          <div className="flex flex-col gap-0 shrink-0">
            <Button variant="ghost" size="sm" className="h-4 w-5 p-0" disabled={isFirst} onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}>
              <ChevronUp className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-4 w-5 p-0" disabled={isLast} onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}>
              <ChevronDown className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Expanded controls */}
      {isExpanded && (
        <div className="border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 px-3 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Multiplier</span>
            <MultiplierControls
              multiplier={multiplier}
              onUpdate={(m) => onMultiplierChange(script.id, m)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={(e) => { e.stopPropagation(); onAlertClick(script.dealerName, script.scriptName, buyRate, sellRate); }}
              className="flex-1 gap-1.5 h-7 text-xs"
            >
              <Bell className="w-3 h-3" /> Alert
            </Button>
            <Button
              variant="destructive" size="sm"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="flex-1 gap-1.5 h-7 text-xs"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
