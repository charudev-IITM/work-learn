import { X } from 'lucide-react';
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss';
import { formatCurrency } from '@comp-intel/shared/lib/formatters';
import { cn } from '../../lib/cn';
import type { WatchlistSuggestion } from '@comp-intel/shared/types/watchlist';

interface SuggestionCardProps {
  suggestion: WatchlistSuggestion;
  onAccept: (s: WatchlistSuggestion) => void;
  onDismiss: (s: WatchlistSuggestion) => void;
  onStopSuggesting: () => void;
}

export function SuggestionCard({ suggestion, onAccept, onDismiss, onStopSuggesting }: SuggestionCardProps) {
  const { handlers, style, isDismissing } = useSwipeDismiss({
    onDismiss: () => onDismiss(suggestion),
  });

  const isSimilar = suggestion.suggestion_type === 'similar_dealer';
  const borderColor = isSimilar ? 'border-amber-500/30' : 'border-violet-500/30';
  const initial = (suggestion.dealer_display_name || suggestion.dealer_id)[0]?.toUpperCase() || '?';

  return (
    <div className="px-3 sm:px-4 pb-2 animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div
        {...handlers}
        style={style}
        className={cn(
          'relative rounded-lg border p-3 cursor-pointer',
          'bg-white/5 dark:bg-white/[0.03] backdrop-blur-sm',
          borderColor,
          isDismissing && 'pointer-events-none',
        )}
        onClick={() => onAccept(suggestion)}
      >
        <div className="flex items-start gap-3">
          {/* Dealer avatar */}
          <div className={cn(
            'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold mt-0.5',
            isSimilar ? 'bg-amber-500/20 text-amber-400' : 'bg-violet-500/20 text-violet-400',
          )}>
            {initial}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate pr-6">{suggestion.dealer_display_name}</div>
            <div className="flex items-baseline justify-between gap-2 mt-0.5">
              <div className="text-xs text-muted-foreground truncate">{suggestion.script_display_name}</div>
              {suggestion.buy_rate != null && suggestion.buy_rate > 0 && (
                <div className="text-sm font-medium flex-shrink-0">
                  {formatCurrency(suggestion.buy_rate)}
                </div>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">{suggestion.reason}</div>
          </div>

          {/* Dismiss button — positioned top-right, clear of price */}
          <button
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-colors -mt-0.5 -mr-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(suggestion);
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stop suggesting — subtle, centered below card */}
      <div className="flex justify-center mt-1">
        <button
          className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors py-1 px-2"
          onClick={(e) => {
            e.stopPropagation();
            onStopSuggesting();
          }}
        >
          Don't show suggestions
        </button>
      </div>
    </div>
  );
}
