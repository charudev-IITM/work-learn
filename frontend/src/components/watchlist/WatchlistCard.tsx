import React, { useState, useCallback } from 'react';
import { Trash2, Bell, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { AnimatedPrice } from '../ui/animated-price';
import { MultiplierControls } from './BrowseShared';
import { formatCurrency, getRelativeTime, isDataStale, isVeryStale } from '@comp-intel/shared/lib/formatters';
import { cn } from '../../lib/cn';
import { useDealerMetadata } from '../../contexts/DealerMetadataContext';
import { useWatchlistItemRate } from '../../hooks/useWatchlistItemRate';
import type { WatchlistScript, ViewMode } from '@comp-intel/shared/types/watchlist';

interface WatchlistCardProps {
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

export const WatchlistCard = React.memo(function WatchlistCard({
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
}: WatchlistCardProps) {
  const { getDealerCity, getDealerLogo } = useDealerMetadata();
  const { rate } = useWatchlistItemRate(script.dealerName, script.scriptName);

  const [isExpanded, setIsExpanded] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const multiplier = script.multiplier || 1;
  const hasLiveData = !!rate;
  const buyRate = hasLiveData ? (rate?.buy_rate || 0) : (script.originalRates?.buy || 0);
  const sellRate = hasLiveData ? (rate?.sell_rate || 0) : (script.originalRates?.sell || 0);
  const timestamp = hasLiveData
    ? (rate?.timestamp || script.addedAt)
    : (script.originalRates?.timestamp || script.addedAt);
  const hasRates = (hasLiveData || !!(script.originalRates?.buy || script.originalRates?.sell)) && (buyRate > 0 || sellRate > 0);
  const dataStale = isDataStale(timestamp);
  const veryStale = isVeryStale(timestamp);

  const isReference = script.id === referenceScriptId;

  // Calculate differences
  let buyDifference = 0;
  let sellDifference = 0;
  if (viewMode === 'differences' && referenceScriptId && !isReference && referenceBuyRate !== undefined) {
    buyDifference = buyRate * multiplier - (referenceBuyRate || 0) * (referenceMultiplier || 1);
    sellDifference = sellRate * multiplier - (referenceSellRate || 0) * (referenceMultiplier || 1);
  }

  const primaryDifference = differenceType === 'buy' ? buyDifference : sellDifference;
  const isDiffSignificant = Math.abs(primaryDifference) > 10;
  const isDiffPositive = primaryDifference > 0;

  // Primary rate — treat 0 as "no data" for display
  const rawPrimaryRate = viewMode === 'buy' ? buyRate : sellRate;
  const primaryRate = rawPrimaryRate > 0 ? rawPrimaryRate * multiplier : 0;
  const hasPrimaryRate = rawPrimaryRate > 0;

  const city = getDealerCity(script.dealerName);
  const logo = getDealerLogo(script.dealerName);
  const firstLetter = script.dealerName.charAt(0).toUpperCase();

  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, [role="button"], [tabindex]')) return;
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <div
      className={cn(
        'group bg-card rounded-xl shadow-sm hover:shadow-md watchlist-item',
        'backdrop-blur-sm bg-white/95 dark:bg-gray-900/95',
        'ring-1 ring-gray-200/50 dark:ring-gray-700/50 hover:ring-gray-300/70 dark:hover:ring-gray-600/70',
        viewMode === 'differences' && isReference && 'ring-2 ring-blue-400/50 bg-blue-50/30 dark:bg-blue-950/30',
        viewMode === 'differences' && !isReference && isDiffSignificant && (
          isDiffPositive
            ? 'ring-2 ring-red-400/50 bg-red-50/20 dark:bg-red-950/20'
            : 'ring-2 ring-green-400/50 bg-green-50/20 dark:bg-green-950/20'
        ),
        !hasRates && 'ring-amber-400/30 bg-amber-50/10 dark:bg-amber-950/10',
        veryStale && hasRates && 'opacity-50'
      )}
      onClick={handleTap}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Dealer avatar */}
          <div className="shrink-0 w-10 h-10 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700">
            {logo && !logoError ? (
              <img src={logo} alt={script.dealerName} className="w-8 h-8 object-contain" onError={() => setLogoError(true)} />
            ) : (
              <span className="text-sm font-bold text-muted-foreground">{firstLetter}</span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold truncate text-gray-900 dark:text-gray-100">
                {script.dealerName}
              </span>
              {showReorderButtons && (
                <div className="flex gap-0.5 shrink-0 ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={isFirst}
                    onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={isLast}
                    onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <div className="text-sm text-muted-foreground font-medium truncate">
              {script.scriptDisplayName || rate?.script_name || script.scriptName}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {city && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {city}
                </span>
              )}
              {hasRates ? (
                <span className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium',
                  dataStale
                    ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                    : 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                )}>
                  <div className={cn('w-1.5 h-1.5 rounded-full', dataStale ? 'bg-amber-500' : 'bg-green-500 animate-pulse')} />
                  {getRelativeTime(timestamp)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs">
                  <AlertCircle className="w-3 h-3" /> No Data
                </span>
              )}
              {multiplier !== 1 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold">
                  x{multiplier}
                </span>
              )}
            </div>
          </div>

          {/* Rate display */}
          <div className="text-right shrink-0">
            {viewMode === 'differences' ? (
              isReference ? (
                <div>
                  <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-0.5">REF</div>
                  {hasPrimaryRate && (
                    <div className="text-sm font-mono text-muted-foreground">
                      {formatCurrency(primaryRate)}
                    </div>
                  )}
                </div>
              ) : hasRates ? (
                <div>
                  <AnimatedPrice
                    value={primaryDifference}
                    formatter={(v) => (v >= 0 ? `+${formatCurrency(v)}` : formatCurrency(v))}
                    showTrend
                    className={cn(
                      'text-base font-bold font-mono',
                      isDiffSignificant
                        ? isDiffPositive ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                        : 'text-gray-600 dark:text-gray-400'
                    )}
                  />
                  {hasPrimaryRate && (
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">
                      {formatCurrency(primaryRate)}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-lg font-bold text-muted-foreground">--</span>
              )
            ) : hasPrimaryRate ? (
              <AnimatedPrice
                value={primaryRate}
                formatter={formatCurrency}
                showTrend
                className={cn(
                  'text-lg font-bold font-mono',
                  viewMode === 'buy' ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'
                )}
              />
            ) : (
              <span className="text-lg font-bold text-muted-foreground">--</span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 p-4 space-y-3">
          {hasRates && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{viewMode === 'buy' ? 'Sell' : 'Buy'}</span>
              <span className="font-mono font-medium">
                {(() => {
                  const oppositeRate = viewMode === 'buy' ? sellRate : buyRate;
                  return oppositeRate > 0 ? formatCurrency(oppositeRate * multiplier) : '--';
                })()}
              </span>
            </div>
          )}
          {hasRates && buyRate > 0 && sellRate > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Spread</span>
              <span className="font-mono font-medium text-muted-foreground">
                {formatCurrency((sellRate - buyRate) * multiplier)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Multiplier</span>
            <MultiplierControls
              multiplier={multiplier}
              onUpdate={(m) => onMultiplierChange(script.id, m)}
              triggerClassName="h-7 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onAlertClick(script.dealerName, script.scriptName, buyRate, sellRate); }} className="flex-1 gap-1.5 h-8">
              <Bell className="w-3.5 h-3.5" /> Alert
            </Button>
            <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="flex-1 gap-1.5 h-8">
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
