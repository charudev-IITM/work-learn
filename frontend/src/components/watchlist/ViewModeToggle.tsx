import { TrendingUp, TrendingDown, Target } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { useWatchlist } from '../../contexts/WatchlistContext';
import type { ViewMode } from '@comp-intel/shared/types/watchlist';

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useWatchlist();

  return (
    <ToggleGroup
      type="single"
      value={viewMode}
      onValueChange={(v: ViewMode) => v && setViewMode(v)}
      data-coach="view-mode-toggle"
      className="grid grid-cols-3 w-full max-w-xs h-9 bg-muted/50 rounded-lg p-0.5 gap-0.5"
    >
      <ToggleGroupItem
        value="buy"
        className="text-sm font-medium data-[state=on]:bg-blue-500 data-[state=on]:text-white data-[state=on]:shadow-sm rounded-md transition-all duration-150"
      >
        <TrendingDown className="w-3.5 h-3.5 mr-1" />
        Buy
      </ToggleGroupItem>
      <ToggleGroupItem
        value="sell"
        className="text-sm font-medium data-[state=on]:bg-orange-500 data-[state=on]:text-white data-[state=on]:shadow-sm rounded-md transition-all duration-150"
      >
        <TrendingUp className="w-3.5 h-3.5 mr-1" />
        Sell
      </ToggleGroupItem>
      <ToggleGroupItem
        value="differences"
        className="text-sm font-medium data-[state=on]:bg-purple-500 data-[state=on]:text-white data-[state=on]:shadow-sm rounded-md transition-all duration-150"
      >
        <Target className="w-3.5 h-3.5 mr-1" />
        Diff
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
