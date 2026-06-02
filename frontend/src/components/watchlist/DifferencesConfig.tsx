import { TrendingUp, TrendingDown, Shuffle, Target } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useWatchlist } from '../../contexts/WatchlistContext';
import type { WatchlistRateData } from '@comp-intel/shared/types/watchlist';

interface DifferencesConfigProps {
  sortedData: WatchlistRateData[];
}

export function DifferencesConfig({ sortedData }: DifferencesConfigProps) {
  const { differenceType, setDifferenceType, referenceScriptId, setReferenceScript } = useWatchlist();

  return (
    <div className="bg-gradient-to-r from-purple-50/80 to-blue-50/80 dark:from-purple-950/20 dark:to-blue-950/20 p-2.5 rounded-lg border border-purple-200/40 dark:border-purple-800/40">
      <div className="flex items-center justify-between gap-2">
        {/* Compare Type */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Target className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
          <ToggleGroup
            type="single"
            value={differenceType}
            onValueChange={(v: 'buy' | 'sell') => v && setDifferenceType(v)}
            className="flex gap-0.5 p-0.5 bg-white/70 dark:bg-gray-900/70 rounded-md shadow-sm border border-gray-200/60 dark:border-gray-700/60"
          >
            <ToggleGroupItem
              value="buy"
              className="h-7 px-2.5 text-xs font-medium rounded-sm data-[state=on]:bg-blue-500 data-[state=on]:text-white"
            >
              <TrendingDown className="w-3 h-3 mr-1" />
              Buy
            </ToggleGroupItem>
            <ToggleGroupItem
              value="sell"
              className="h-7 px-2.5 text-xs font-medium rounded-sm data-[state=on]:bg-orange-500 data-[state=on]:text-white"
            >
              <TrendingUp className="w-3 h-3 mr-1" />
              Sell
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Reference Script */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Shuffle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 border-blue-300 dark:border-blue-700 bg-white/80 dark:bg-gray-900/80 h-7 px-2 text-xs"
              >
                <span className="max-w-16 truncate font-medium">
                  {referenceScriptId
                    ? sortedData.find((i) => i.scriptId === referenceScriptId)?.competitor || 'Select'
                    : 'Ref'}
                </span>
                <Shuffle className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {sortedData
                .filter((i) => i.hasLiveData)
                .map((item) => (
                  <DropdownMenuItem
                    key={item.scriptId}
                    onClick={() => setReferenceScript(item.scriptId)}
                    className={referenceScriptId === item.scriptId ? 'bg-accent' : ''}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{item.competitor}</span>
                      <span className="text-xs text-muted-foreground">{item.script}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
