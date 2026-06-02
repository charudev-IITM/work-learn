import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useWatchlist } from '../../contexts/WatchlistContext';
import { getAllRates } from '@comp-intel/shared/stores/rateStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScriptRow, type AddState, type ScriptRowData } from './BrowseShared';

interface RateEntry {
  competitor: string;
  script_name: string;
  symbol: string;
  buy_rate?: number;
  sell_rate?: number;
  timestamp?: string;
  productType: string;
}

export function ScriptSearch() {
  const {
    isSearchOpen,
    searchTerm,
    setSearchOpen,
    setSearchTerm,
    addScriptToWatchlist,
    currentWatchlistId,
    watchlists,
  } = useWatchlist();

  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<RateEntry[]>([]);
  const [addStates, setAddStates] = useState<Record<string, AddState>>({});

  // Search through rateStore data (in-memory, instant — fed by WebSocket)
  const searchRateStore = useCallback((query: string): RateEntry[] => {
    if (!query.trim()) return [];

    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const results: RateEntry[] = [];
    const allRates = getAllRates();

    allRates.forEach(entry => {
      const text = [entry.competitor, entry.script_name || '', entry.script].join(' ').toLowerCase();
      if (terms.every(term => text.includes(term))) {
        results.push({
          competitor: entry.competitor,
          script_name: entry.script_name || entry.script,
          symbol: entry.script,
          buy_rate: entry.buy_rate,
          sell_rate: entry.sell_rate,
          timestamp: entry.timestamp,
          productType: entry.productType,
        });
      }
    });

    return results;
  }, []);

  // 300ms debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(localSearchTerm);
      setSearchResults(searchRateStore(localSearchTerm));
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearchTerm, setSearchTerm, searchRateStore]);

  // Build display list
  const results = useMemo(() => {
    if (!searchTerm.trim()) return [];

    return searchResults.map(entry => ({
      id: `${entry.competitor}::${entry.symbol}`,
      dealerName: entry.competitor,
      scriptName: entry.symbol,
      scriptDisplayName: entry.script_name,
      productType: entry.productType,
      buyRate: entry.buy_rate,
      sellRate: entry.sell_rate,
      timestamp: entry.timestamp,
    }));
  }, [searchTerm, searchResults]);

  const watchlistSet = useMemo(() => {
    const scripts = watchlists.find(w => w.id === currentWatchlistId)?.scripts || [];
    return new Set(scripts.map(s => `${s.dealerName}::${s.scriptName}`));
  }, [watchlists, currentWatchlistId]);

  const handleAdd = useCallback(async (script: ScriptRowData) => {
    if (addStates[script.id] === 'adding') return;

    setAddStates(prev => ({ ...prev, [script.id]: 'adding' }));

    try {
      await addScriptToWatchlist(currentWatchlistId, {
        dealerName: script.dealerName,
        scriptName: script.scriptName,
        scriptDisplayName: script.scriptDisplayName,
        productType: script.productType,
        multiplier: 1,
        originalRates: {
          buy: script.buyRate,
          sell: script.sellRate,
          timestamp: script.timestamp,
        },
      });
      // Success — clear adding state; isInCurrentWatchlist will be true on re-render
      setAddStates(prev => {
        const next = { ...prev };
        delete next[script.id];
        return next;
      });
    } catch {
      // Show error briefly then revert to idle
      setAddStates(prev => ({ ...prev, [script.id]: 'error' }));
      setTimeout(() => {
        setAddStates(prev => {
          const next = { ...prev };
          delete next[script.id];
          return next;
        });
      }, 2500);
    }
  }, [addStates, addScriptToWatchlist, currentWatchlistId]);

  // Reset state when overlay closes
  useEffect(() => {
    if (!isSearchOpen) {
      setLocalSearchTerm('');
      setSearchResults([]);
      setAddStates({});
    }
  }, [isSearchOpen]);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col animate-slide-up">
      {/* Search header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-background/95 backdrop-blur-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search dealers or scripts..."
            value={localSearchTerm}
            onChange={(e) => setLocalSearchTerm(e.target.value)}
            className="pl-9 pr-8 h-10"
            autoFocus
          />
          {localSearchTerm && (
            <button
              onClick={() => setLocalSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSearchOpen(false)}
          className="shrink-0 h-10 px-3 text-sm font-medium"
        >
          Done
        </Button>
      </div>

      {/* Result count */}
      {searchTerm.trim() && results.length > 0 && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/20">
          {results.length} result{results.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {results.length === 0 ? (
          <EmptyState hasQuery={!!searchTerm.trim()} />
        ) : (
          <div className="divide-y divide-border/40">
            {results.map(script => (
              <ScriptRow
                key={script.id}
                script={script}
                isInWatchlist={watchlistSet.has(script.id)}
                addState={addStates[script.id]}
                onAdd={handleAdd}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
        <Search className="w-5 h-5 text-muted-foreground/60" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">
        {hasQuery ? 'No matches found' : 'Search by dealer name or script'}
      </p>
      {hasQuery && (
        <p className="text-xs text-muted-foreground/60 mt-1">Try different keywords</p>
      )}
    </div>
  );
}

