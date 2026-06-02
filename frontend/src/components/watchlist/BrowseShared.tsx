import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Check, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { formatCurrency, isDataStale } from '@comp-intel/shared/lib/formatters';
import { cn } from '../../lib/cn';

export type AddState = 'adding' | 'removing' | 'error';

// ── Add/Remove Button ────────────────────────────────────────────────────────

export function AddButton({
  state,
  isInWatchlist,
  onAdd,
  onRemove,
}: {
  state?: AddState;
  isInWatchlist: boolean;
  onAdd: () => void;
  onRemove?: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset confirm state when watchlist status changes
  useEffect(() => {
    setConfirmRemove(false);
    return () => clearTimeout(timerRef.current);
  }, [isInWatchlist]);

  if (state === 'adding' || state === 'removing') {
    return (
      <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        className="h-7 px-2 rounded-md bg-destructive/10 flex items-center justify-center gap-1 shrink-0 hover:bg-destructive/20 active:scale-95"
        title="Failed — tap to retry"
      >
        <AlertCircle className="w-3 h-3 text-destructive" />
        <span className="text-[10px] font-medium text-destructive">Retry</span>
      </button>
    );
  }

  if (isInWatchlist) {
    if (confirmRemove) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirmRemove(false);
            clearTimeout(timerRef.current);
            onRemove?.();
          }}
          className="h-7 px-2 rounded-md bg-destructive/10 flex items-center justify-center gap-1 shrink-0 hover:bg-destructive/20 active:scale-95 transition-all"
        >
          <Trash2 className="w-3 h-3 text-destructive" />
          <span className="text-[10px] font-medium text-destructive">Remove</span>
        </button>
      );
    }
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setConfirmRemove(true);
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setConfirmRemove(false), 3000);
        }}
        className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 hover:bg-primary/20 active:scale-95 transition-all"
      >
        <Check className="w-3.5 h-3.5 text-primary" />
      </button>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={(e) => { e.stopPropagation(); onAdd(); }}
      className="h-7 w-7 p-0 shrink-0"
    >
      <Plus className="w-3.5 h-3.5" />
    </Button>
  );
}

// ── Inline Multiplier Controls ───────────────────────────────────────────────

const MULTIPLIER_PRESETS = [0.1, 0.5, 1, 2, 5, 10, 100] as const;

export function MultiplierControls({
  multiplier,
  onUpdate,
  triggerClassName,
}: {
  multiplier: number;
  onUpdate: (multiplier: number) => void;
  triggerClassName?: string;
}) {
  const [customValue, setCustomValue] = useState('');

  const handleCustomSubmit = useCallback(() => {
    const value = parseFloat(customValue);
    if (!isNaN(value) && value > 0) {
      onUpdate(value);
      setCustomValue('');
    }
  }, [customValue, onUpdate]);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className={triggerClassName ?? "h-6 text-xs px-2"}>x{multiplier}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {MULTIPLIER_PRESETS.map((m) => (
            <DropdownMenuItem
              key={m}
              onClick={() => onUpdate(m)}
              className={multiplier === m ? 'bg-accent' : ''}
            >
              x{m}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Custom"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSubmit(); e.stopPropagation(); }}
                onClick={(e) => e.stopPropagation()}
                className="h-6 text-xs"
              />
              <Button size="sm" onClick={(e) => { e.stopPropagation(); handleCustomSubmit(); }} className="h-6 text-xs" disabled={!customValue}>
                Set
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Script Result Row ───────────────────────────────────────────────────────

export interface ScriptRowData {
  id: string;
  dealerName: string;         // dealer_id / competitor key (for API calls + watchlist matching)
  dealerDisplayName?: string; // human-readable name (for UI display, falls back to dealerName)
  scriptName: string;
  scriptDisplayName: string;
  productType: string;
  buyRate?: number;
  sellRate?: number;
  timestamp?: string;
}

export const ScriptRow = React.memo(function ScriptRow({
  script,
  isInWatchlist,
  addState,
  onAdd,
  onRemove,
  multiplier,
  onMultiplierChange,
}: {
  script: ScriptRowData;
  isInWatchlist: boolean;
  addState?: AddState;
  onAdd: (script: ScriptRowData) => void;
  onRemove?: (script: ScriptRowData) => void;
  multiplier?: number;
  onMultiplierChange?: (script: ScriptRowData, multiplier: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Collapse when script is removed from watchlist
  useEffect(() => {
    if (!isInWatchlist) setExpanded(false);
  }, [isInWatchlist]);

  const hasBuy = (script.buyRate || 0) > 0;
  const hasSell = (script.sellRate || 0) > 0;
  const hasRates = hasBuy || hasSell;
  const stale = script.timestamp ? isDataStale(script.timestamp) : false;
  const showControls = expanded && isInWatchlist && onMultiplierChange;

  const handleAdd = useCallback(() => onAdd(script), [onAdd, script]);
  const handleRemove = useCallback(() => onRemove?.(script), [onRemove, script]);
  const handleMultiplier = useCallback(
    (m: number) => onMultiplierChange?.(script, m),
    [onMultiplierChange, script],
  );

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/30',
          isInWatchlist && 'cursor-pointer',
        )}
        onClick={() => {
          if (isInWatchlist && onMultiplierChange) setExpanded(prev => !prev);
        }}
      >
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            !hasRates ? 'bg-gray-300 dark:bg-gray-600' : stale ? 'bg-amber-500' : 'bg-green-500'
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate text-foreground">
            {script.dealerDisplayName || script.dealerName}
          </div>
          <div className="text-xs text-muted-foreground break-words">
            {script.scriptDisplayName || script.scriptName}
          </div>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          {hasBuy && (
            <div className="text-xs font-mono leading-tight">
              <span className="text-muted-foreground/70">B </span>
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                {formatCurrency(script.buyRate!)}
              </span>
            </div>
          )}
          {hasSell && (
            <div className="text-xs font-mono leading-tight">
              <span className="text-muted-foreground/70">S </span>
              <span className="text-orange-600 dark:text-orange-400 font-medium">
                {formatCurrency(script.sellRate!)}
              </span>
            </div>
          )}
          {!hasRates && <span className="text-xs text-muted-foreground">--</span>}
        </div>
        <AddButton
          state={addState}
          isInWatchlist={isInWatchlist}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      </div>
      {/* Inline multiplier strip */}
      {showControls && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20 border-t border-border/30">
          <span className="text-[10px] text-muted-foreground">Multiplier</span>
          <MultiplierControls
            multiplier={multiplier ?? 1}
            onUpdate={handleMultiplier}
          />
        </div>
      )}
    </div>
  );
});
