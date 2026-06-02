import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown, Star, MapPin, Users } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { useWatchlist } from '../../contexts/WatchlistContext';
import { getAllRates } from '@comp-intel/shared/stores/rateStore';
import { useGlobalRateVersion } from '../../hooks/useRateVersion';
import { onboardingService } from '@comp-intel/shared/services/onboarding';
import type { CatalogResponse, CatalogDealer } from '@comp-intel/shared/types/onboarding';
import { ScriptRow, type AddState, type ScriptRowData } from './BrowseShared';
import { cn } from '../../lib/cn';

// ── Types ───────────────────────────────────────────────────────────────────

type ViewTab = 'scripts' | 'dealers' | 'cities';

interface FilterState {
  commodities: Set<string>;
  purities: Set<string>;
  weights: Set<string>;
}

const EMPTY_FILTERS: FilterState = {
  commodities: new Set(),
  purities: new Set(),
  weights: new Set(),
};

// Preferred display order for commodities and purities (items not in list sort after)
const COMMODITY_ORDER = ['Gold', 'Silver', 'Copper', 'Platinum'];
const PURITY_ORDER = ['9999', '999', '995', '916', '750', '925', '585'];

/** Parse weight string to grams for sorting (e.g., "10g" → 10, "1kg" → 1000, "1oz" → 31.1) */
function weightToGrams(w: string): number {
  const kg = w.match(/^(\d+(?:\.\d+)?)kg$/i);
  if (kg) return parseFloat(kg[1]) * 1000;
  const g = w.match(/^(\d+(?:\.\d+)?)g$/i);
  if (g) return parseFloat(g[1]);
  if (/tola/i.test(w)) return 11.66;
  if (/oz/i.test(w)) return 31.1;
  if (/petal|guinea/i.test(w)) return 8;
  return 9999;
}

/** Sort by preferred order, then alphabetically for unknown values */
function sortByOrder(values: string[], order: string[]): string[] {
  return values.sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

// ── Main Component ──────────────────────────────────────────────────────────

export function BrowseOverlay() {
  const {
    isSearchOpen,
    setSearchOpen,
    addScriptToWatchlist,
    removeScriptFromWatchlist,
    updateScriptMultiplier,
    currentWatchlistId,
    watchlists,
  } = useWatchlist();

  // ── State ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ViewTab>('scripts');
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(localSearchTerm);
  const [addStates, setAddStates] = useState<Record<string, AddState>>({});
  const addStatesRef = useRef(addStates);
  useEffect(() => { addStatesRef.current = addStates; });
  const [dealerFilter, setDealerFilter] = useState<string | null>(null); // dealer_id to filter scripts by
  const scrollRef = useRef<HTMLDivElement>(null);

  const isSearching = deferredSearch.trim().length > 0;
  const hasActiveFilters = filters.commodities.size > 0 || filters.purities.size > 0 || filters.weights.size > 0;
  const activeFilterCount = filters.commodities.size + filters.purities.size + filters.weights.size;

  // ── Catalog Fetch (once on open, no filter params — filters applied client-side) ──
  const fetchCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const data = await onboardingService.getCatalog();
      setCatalog(data);
    } catch {
      setCatalogError('Failed to load catalog');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  // Load catalog on open (full, unfiltered — filters are applied client-side)
  useEffect(() => {
    if (isSearchOpen) {
      fetchCatalog();
    }
  }, [isSearchOpen, fetchCatalog]);

  // Reset on close
  useEffect(() => {
    if (!isSearchOpen) {
      setLocalSearchTerm('');
      setAddStates({});
      setFilterOpen(false);
      setFilters(EMPTY_FILTERS);
      setActiveTab('scripts');
      setDealerFilter(null);
      // Don't clear catalog — reuse on next open for instant display
    }
  }, [isSearchOpen]);

  // ── Filter Toggles ────────────────────────────────────────────────────
  const toggleFilter = useCallback((dimension: keyof FilterState, value: string) => {
    setFilters(prev => {
      const next = { ...prev, [dimension]: new Set(prev[dimension]) };
      if (next[dimension].has(value)) {
        next[dimension].delete(value);
      } else {
        next[dimension].add(value);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, []);

  // ── Watchlist Map for O(1) lookups (id → scriptId + multiplier) ────
  const watchlistMap = useMemo(() => {
    const scripts = watchlists.find(w => w.id === currentWatchlistId)?.scripts || [];
    const map = new Map<string, { scriptId: string; multiplier: number }>();
    for (const s of scripts) {
      map.set(`${s.dealerName}::${s.scriptName}`, { scriptId: s.id, multiplier: s.multiplier ?? 1 });
    }
    return map;
  }, [watchlists, currentWatchlistId]);

  // ── Instant Text Search (client-side rateStore) ───────────────────────
  // useGlobalRateVersion is scoped here — only search results re-render on WS ticks
  const rateVersion = useGlobalRateVersion();
  const searchResults = useMemo((): ScriptRowData[] => {
    if (!deferredSearch.trim()) return [];

    const terms = deferredSearch.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const allRates = getAllRates();

    return allRates
      .filter(entry => {
        const text = [entry.competitor, entry.script_name || '', entry.script].join(' ').toLowerCase();
        return terms.every(term => text.includes(term));
      })
      .map(entry => {
        const id = `${entry.competitor}::${entry.script}`;
        return {
          id,
          dealerName: entry.competitor,
          scriptName: entry.script,
          scriptDisplayName: entry.script_name || entry.script,
          productType: entry.productType,
          buyRate: entry.buy_rate,
          sellRate: entry.sell_rate,
          timestamp: entry.timestamp,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSearch, rateVersion]);

  // ── Client-side filtered catalog (no server call for filter changes) ──
  const filteredCatalog = useMemo((): CatalogResponse | null => {
    if (!catalog) return null;
    if (!hasActiveFilters) return catalog;

    const result: CatalogResponse = {
      ...catalog,
      commodities: catalog.commodities
        .filter(c => filters.commodities.size === 0 || filters.commodities.has(c.name))
        .map(c => ({
          ...c,
          dealers: c.dealers
            .map(d => ({
              ...d,
              scripts: d.scripts.filter(s => {
                const purityOk = filters.purities.size === 0 || (s.purity && filters.purities.has(s.purity));
                const weightOk = filters.weights.size === 0 || (s.weight && filters.weights.has(s.weight));
                return purityOk && weightOk;
              }),
            }))
            .map(d => ({ ...d, script_count: d.scripts.length }))
            .filter(d => d.scripts.length > 0),
        }))
        .map(c => ({ ...c, dealer_count: c.dealers.length }))
        .filter(c => c.dealers.length > 0),
    };
    return result;
  }, [catalog, filters, hasActiveFilters]);

  // ── Catalog-based script list (for browse mode) ───────────────────────
  const catalogScripts = useMemo((): ScriptRowData[] => {
    if (!filteredCatalog) return [];
    const results: ScriptRowData[] = [];

    for (const commodity of filteredCatalog.commodities) {
      for (const dealer of commodity.dealers) {
        if (dealerFilter && dealer.dealer_id !== dealerFilter) continue;
        for (const script of dealer.scripts) {
          const id = `${dealer.dealer_id}::${script.symbol}`;
          results.push({
            id,
            dealerName: dealer.dealer_id,
            dealerDisplayName: dealer.display_name,
            scriptName: script.symbol,
            scriptDisplayName: script.display_name,
            productType: script.product_type,
            buyRate: script.buy_rate ?? undefined,
            sellRate: script.sell_rate ?? undefined,
          });
        }
      }
    }
    return results;
  }, [filteredCatalog, dealerFilter]);

  // Pre-built map for O(1) lookup in commodity-grouped render (avoids inline object construction)
  const catalogScriptMap = useMemo(() => {
    const map = new Map<string, ScriptRowData>();
    for (const s of catalogScripts) map.set(s.id, s);
    return map;
  }, [catalogScripts]);

  // ── Deduplicated dealer list (shared by dealers + cities views) ──────
  const uniqueDealers = useMemo(() => {
    if (!filteredCatalog) return [];
    const dealerMap = new Map<string, CatalogDealer>();
    for (const commodity of filteredCatalog.commodities) {
      for (const dealer of commodity.dealers) {
        if (!dealerMap.has(dealer.dealer_id)) {
          dealerMap.set(dealer.dealer_id, { ...dealer });
        } else {
          dealerMap.get(dealer.dealer_id)!.script_count += dealer.script_count;
        }
      }
    }
    return Array.from(dealerMap.values());
  }, [filteredCatalog]);

  // ── Dealers grouped by first letter (A-Z) ─────────────────────────────
  const dealersByLetter = useMemo(() => {
    const letterMap = new Map<string, CatalogDealer[]>();
    for (const dealer of uniqueDealers) {
      const letter = dealer.display_name.charAt(0).toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      if (!letterMap.has(key)) letterMap.set(key, []);
      letterMap.get(key)!.push(dealer);
    }
    return Array.from(letterMap.entries())
      .map(([letter, dealers]) => ({
        letter,
        dealers: dealers.sort((a, b) => a.display_name.localeCompare(b.display_name)),
      }))
      .sort((a, b) => a.letter.localeCompare(b.letter));
  }, [uniqueDealers]);

  // ── Cities grouped by first letter (A-Z) ──────────────────────────────
  const citiesByLetter = useMemo(() => {
    // First group dealers by city
    const cityMap = new Map<string, CatalogDealer[]>();
    for (const dealer of uniqueDealers) {
      const city = dealer.city || 'Other';
      if (!cityMap.has(city)) cityMap.set(city, []);
      cityMap.get(city)!.push(dealer);
    }
    const cities = Array.from(cityMap.entries())
      .map(([city, dealers]) => ({
        city,
        dealers: dealers.sort((a, b) => a.display_name.localeCompare(b.display_name)),
      }))
      .sort((a, b) => a.city.localeCompare(b.city));

    // Then group cities by first letter
    const letterMap = new Map<string, typeof cities>();
    for (const entry of cities) {
      const letter = entry.city.charAt(0).toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      if (!letterMap.has(key)) letterMap.set(key, []);
      letterMap.get(key)!.push(entry);
    }
    return Array.from(letterMap.entries())
      .map(([letter, group]) => ({ letter, cities: group }))
      .sort((a, b) => a.letter.localeCompare(b.letter));
  }, [uniqueDealers]);

  // ── A-Z strip data (shared refs + letters) ────────────────────────────
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const citySectionRefs = useRef(new Map<string, HTMLElement>());

  const makeRegisterSection = useCallback(
    (refs: React.MutableRefObject<Map<string, HTMLElement>>) =>
      (key: string) => (el: HTMLElement | null) => {
        if (el) refs.current.set(key, el);
        else refs.current.delete(key);
      },
    [],
  );
  const registerSection = useMemo(() => makeRegisterSection(sectionRefs), [makeRegisterSection]);
  const registerCitySection = useMemo(() => makeRegisterSection(citySectionRefs), [makeRegisterSection]);

  const availableLetters = useMemo(() => new Set(dealersByLetter.map(g => g.letter)), [dealersByLetter]);
  const cityLetters = useMemo(() => new Set(citiesByLetter.map(g => g.letter)), [citiesByLetter]);

  // ── Dynamic filter options from catalog taxonomy ────────────────────
  const filterOptions = useMemo(() => {
    if (!catalog) return { commodities: [] as string[], purities: [] as string[], weights: [] as string[] };
    const commodities = new Set<string>();
    const purities = new Set<string>();
    const weights = new Set<string>();
    for (const commodity of catalog.commodities) {
      if (commodity.name !== 'Other') commodities.add(commodity.name);
      for (const dealer of commodity.dealers) {
        for (const script of dealer.scripts) {
          if (script.purity) purities.add(script.purity);
          if (script.weight) weights.add(script.weight);
        }
      }
    }
    return {
      commodities: sortByOrder(Array.from(commodities), COMMODITY_ORDER),
      purities: sortByOrder(Array.from(purities), PURITY_ORDER),
      weights: Array.from(weights).sort((a, b) => weightToGrams(a) - weightToGrams(b)),
    };
  }, [catalog]);

  // ── Popular dealers for top section ───────────────────────────────────
  const popularDealers = useMemo(() => {
    if (!catalog) return [];
    const seen = new Set<string>();
    const result: CatalogDealer[] = [];
    for (const commodity of catalog.commodities) {
      for (const dealer of commodity.dealers) {
        if (dealer.is_popular && !seen.has(dealer.dealer_id)) {
          seen.add(dealer.dealer_id);
          result.push(dealer);
        }
      }
    }
    return result;
  }, [catalog]);

  // ── Add / Remove / Multiplier handlers ──────────────────────────────
  const handleAdd = useCallback(async (script: ScriptRowData) => {
    if (addStatesRef.current[script.id] === 'adding') return;
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
      setAddStates(prev => {
        const next = { ...prev };
        delete next[script.id];
        return next;
      });
    } catch {
      setAddStates(prev => ({ ...prev, [script.id]: 'error' }));
      setTimeout(() => {
        setAddStates(prev => {
          const next = { ...prev };
          delete next[script.id];
          return next;
        });
      }, 2500);
    }
  }, [addScriptToWatchlist, currentWatchlistId]);

  const handleRemove = useCallback(async (script: ScriptRowData) => {
    const entry = watchlistMap.get(script.id);
    if (!entry) return;
    setAddStates(prev => ({ ...prev, [script.id]: 'removing' }));
    try {
      await removeScriptFromWatchlist(currentWatchlistId, entry.scriptId);
    } finally {
      setAddStates(prev => {
        const next = { ...prev };
        delete next[script.id];
        return next;
      });
    }
  }, [watchlistMap, removeScriptFromWatchlist, currentWatchlistId]);

  const handleMultiplier = useCallback((script: ScriptRowData, multiplier: number) => {
    const entry = watchlistMap.get(script.id);
    if (!entry) return;
    updateScriptMultiplier(currentWatchlistId, entry.scriptId, multiplier);
  }, [watchlistMap, updateScriptMultiplier, currentWatchlistId]);

  // ── Early return ──────────────────────────────────────────────────────
  if (!isSearchOpen) return null;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col animate-slide-up">
      {/* ── Header ── */}
      <div className="shrink-0 border-b bg-background/95 backdrop-blur-sm">
        {/* Search row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
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

          {/* Filter toggle */}
          <button
            onClick={() => setFilterOpen(prev => !prev)}
            className={cn(
              'shrink-0 h-10 w-10 rounded-lg flex items-center justify-center border transition-colors relative',
              filterOpen || hasActiveFilters
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-background border-border text-muted-foreground hover:bg-muted/50',
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchOpen(false)}
            className="shrink-0 h-10 px-3 text-sm font-medium"
          >
            Done
          </Button>
        </div>

        {/* Tab bar (hidden during search) */}
        {!isSearching && (
          <div className="flex items-center gap-1 px-3 pb-2">
            <button
              onClick={() => { setActiveTab('scripts'); setDealerFilter(null); }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                activeTab === 'scripts'
                  ? 'bg-foreground text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              Scripts
            </button>
            <button
              onClick={() => setActiveTab('dealers')}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                activeTab === 'dealers'
                  ? 'bg-foreground text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              Dealers
            </button>
            <button
              onClick={() => setActiveTab('cities')}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                activeTab === 'cities'
                  ? 'bg-foreground text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              Cities
            </button>
            {dealerFilter && (
              <button
                onClick={() => setDealerFilter(null)}
                className="ml-auto flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-medium"
              >
                <X className="w-2.5 h-2.5" />
                Clear dealer
              </button>
            )}
          </div>
        )}

        {/* Filter panel (collapsible, scrollable for many options) */}
        <div className={cn(
          'overflow-hidden transition-[max-height] duration-200 ease-out',
          filterOpen ? 'max-h-[50vh] overflow-y-auto' : 'max-h-0',
        )}>
          <FilterPanel
            filters={filters}
            hasActiveFilters={hasActiveFilters}
            filterOptions={filterOptions}
            onToggle={toggleFilter}
            onClear={clearFilters}
          />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {isSearching ? (
            /* Search results */
            <SearchResultsList
              results={searchResults}
              query={deferredSearch}
              watchlistMap={watchlistMap}
              addStates={addStates}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
          ) : catalogLoading && !catalog ? (
            <BrowseSkeleton />
          ) : catalogError && !catalog ? (
            <ErrorState message={catalogError} onRetry={fetchCatalog} />
          ) : activeTab === 'scripts' ? (
            <ScriptsView
              catalog={filteredCatalog}
              popularDealers={popularDealers}
              catalogScripts={catalogScripts}
              catalogScriptMap={catalogScriptMap}
              watchlistMap={watchlistMap}
              addStates={addStates}
              onAdd={handleAdd}
              onRemove={handleRemove}
              onMultiplierChange={handleMultiplier}
              dealerFilter={dealerFilter}
              onDealerTap={(id) => { setDealerFilter(id); setActiveTab('scripts'); }}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />
          ) : activeTab === 'dealers' ? (
            <DealersView
              dealersByLetter={dealersByLetter}
              onDealerTap={(id) => { setDealerFilter(id); setActiveTab('scripts'); }}
              registerSection={registerSection}
            />
          ) : (
            <CitiesView
              citiesByLetter={citiesByLetter}
              onDealerTap={(id) => { setDealerFilter(id); setActiveTab('scripts'); }}
              registerSection={registerCitySection}
            />
          )}
        </div>

        {/* A-Z Strip (visible in dealers/cities view when not searching) */}
        {!isSearching && (activeTab === 'dealers' || activeTab === 'cities') && (
          <AlphaIndexStrip
            availableLetters={activeTab === 'dealers' ? availableLetters : cityLetters}
            sectionRefs={activeTab === 'dealers' ? sectionRefs : citySectionRefs}
            scrollRef={scrollRef}
          />
        )}
      </div>
    </div>
  );
}

// ── Filter Panel ────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  hasActiveFilters,
  filterOptions,
  onToggle,
  onClear,
}: {
  filters: FilterState;
  hasActiveFilters: boolean;
  filterOptions: { commodities: string[]; purities: string[]; weights: string[] };
  onToggle: (dimension: keyof FilterState, value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="px-3 pb-3 space-y-2.5 border-t bg-muted/20">
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs font-semibold text-muted-foreground">Filters</span>
        {hasActiveFilters && (
          <button onClick={onClear} className="text-[10px] text-primary font-medium">
            Clear all
          </button>
        )}
      </div>
      {filterOptions.commodities.length > 0 && (
        <FilterChipGroup label="Commodity" options={filterOptions.commodities} selected={filters.commodities} onToggle={(v) => onToggle('commodities', v)} />
      )}
      {filterOptions.purities.length > 0 && (
        <FilterChipGroup label="Purity" options={filterOptions.purities} selected={filters.purities} onToggle={(v) => onToggle('purities', v)} />
      )}
      {filterOptions.weights.length > 0 && (
        <FilterChipGroup label="Weight" options={filterOptions.weights} selected={filters.weights} onToggle={(v) => onToggle('weights', v)} />
      )}
    </div>
  );
}

function FilterChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
              'border active:scale-95',
              selected.has(opt)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted/50',
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Search Results List ─────────────────────────────────────────────────────

function SearchResultsList({
  results,
  query,
  watchlistMap,
  addStates,
  onAdd,
  onRemove,
}: {
  results: ScriptRowData[];
  query: string;
  watchlistMap: Map<string, { scriptId: string; multiplier: number }>;
  addStates: Record<string, AddState>;
  onAdd: (script: ScriptRowData) => void;
  onRemove: (script: ScriptRowData) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <Search className="w-5 h-5 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No matches found</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Try different keywords</p>
      </div>
    );
  }

  return (
    <>
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/20">
        {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
      </div>
      <div className="divide-y divide-border/40">
        {results.map(script => (
          <ScriptRow
            key={script.id}
            script={script}
            isInWatchlist={watchlistMap.has(script.id)}
            addState={addStates[script.id]}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ))}
      </div>
    </>
  );
}

// ── Scripts View (Browse Mode) ──────────────────────────────────────────────

function ScriptsView({
  catalog,
  popularDealers,
  catalogScripts,
  catalogScriptMap,
  watchlistMap,
  addStates,
  onAdd,
  onRemove,
  onMultiplierChange,
  dealerFilter,
  onDealerTap,
  hasActiveFilters,
  onClearFilters,
}: {
  catalog: CatalogResponse | null;
  popularDealers: CatalogDealer[];
  catalogScripts: ScriptRowData[];
  catalogScriptMap: Map<string, ScriptRowData>;
  watchlistMap: Map<string, { scriptId: string; multiplier: number }>;
  addStates: Record<string, AddState>;
  onAdd: (script: ScriptRowData) => void;
  onRemove: (script: ScriptRowData) => void;
  onMultiplierChange: (script: ScriptRowData, multiplier: number) => void;
  dealerFilter: string | null;
  onDealerTap: (dealerId: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  if (!catalog) return null;

  // When filtering by a specific dealer, show flat script list
  if (dealerFilter) {
    const dealer = (() => {
      for (const c of catalog.commodities) {
        for (const d of c.dealers) {
          if (d.dealer_id === dealerFilter) return d;
        }
      }
      return null;
    })();

    return (
      <div>
        {dealer && (
          <div className="px-3 py-2 border-b bg-muted/20 flex items-center gap-2">
            <DealerAvatar dealer={dealer} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{dealer.display_name}</div>
              {dealer.city && <div className="text-[10px] text-muted-foreground">{dealer.city}</div>}
            </div>
          </div>
        )}
        {catalogScripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {hasActiveFilters ? 'No scripts match your filters' : 'No scripts available'}
            </p>
            {hasActiveFilters && (
              <button onClick={onClearFilters} className="text-xs text-primary font-medium mt-2">Clear all filters</button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {catalogScripts.map(script => (
              <ScriptRow key={script.id} script={script} isInWatchlist={watchlistMap.has(script.id)} addState={addStates[script.id]} onAdd={onAdd} onRemove={onRemove} multiplier={watchlistMap.get(script.id)?.multiplier} onMultiplierChange={onMultiplierChange} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (catalogScripts.length === 0 && hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <SlidersHorizontal className="w-5 h-5 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No scripts match your filters</p>
        <button onClick={onClearFilters} className="text-xs text-primary font-medium mt-2">Clear all filters</button>
      </div>
    );
  }

  // Default: grouped by commodity with popular dealers section
  return (
    <div className="pb-4">
      {/* Popular Dealers carousel */}
      {popularDealers.length > 0 && !hasActiveFilters && (
        <div className="mb-4">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/15 text-amber-500">
              <Star className="w-3 h-3" />
            </span>
            <span className="text-xs font-bold text-foreground">Popular Dealers</span>
          </div>
          <div className="flex gap-2 overflow-x-auto scroll-smooth px-3 pb-1 no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
            {popularDealers.map(dealer => (
              <button
                key={dealer.dealer_id}
                onClick={() => onDealerTap(dealer.dealer_id)}
                className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card hover:bg-muted/30 active:scale-[0.96] transition-all"
              >
                <DealerAvatar dealer={dealer} size="sm" />
                <div className="text-left">
                  <div className="text-xs font-semibold text-foreground whitespace-nowrap">{dealer.display_name}</div>
                  {dealer.city && <div className="text-[9px] text-muted-foreground">{dealer.city}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Commodity sections */}
      {catalog.commodities.map(commodity => (
        <div key={commodity.name} className="mb-3">
          <div className="flex items-center gap-2 px-3 py-2 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <span className={cn(
              'flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold',
              commodity.name === 'Gold' ? 'bg-amber-500/15 text-amber-600' :
              commodity.name === 'Silver' ? 'bg-slate-400/15 text-slate-500' :
              'bg-muted text-muted-foreground',
            )}>
              {commodity.name.charAt(0)}
            </span>
            <span className="text-xs font-bold text-foreground">{commodity.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {commodity.dealer_count} dealer{commodity.dealer_count !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {commodity.dealers.flatMap(dealer =>
              dealer.scripts.map(script => {
                const id = `${dealer.dealer_id}::${script.symbol}`;
                const scriptData = catalogScriptMap.get(id);
                if (!scriptData) return null;
                return (
                  <ScriptRow
                    key={id}
                    script={scriptData}
                    isInWatchlist={watchlistMap.has(id)}
                    addState={addStates[id]}
                    onAdd={onAdd}
                    onRemove={onRemove}
                    multiplier={watchlistMap.get(id)?.multiplier}
                    onMultiplierChange={onMultiplierChange}
                  />
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Dealers View (City-Grouped) ─────────────────────────────────────────────

function DealersView({
  dealersByLetter,
  onDealerTap,
  registerSection,
}: {
  dealersByLetter: { letter: string; dealers: CatalogDealer[] }[];
  onDealerTap: (dealerId: string) => void;
  registerSection: (key: string) => (el: HTMLElement | null) => void;
}) {
  if (dealersByLetter.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Users className="w-8 h-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No dealers found</p>
      </div>
    );
  }

  return (
    <div className="pb-4 pr-7">
      {dealersByLetter.map(({ letter, dealers }) => (
        <div key={letter} ref={registerSection(letter)}>
          {/* Letter header */}
          <div className="flex items-center gap-2 px-3 py-1.5 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <span className="text-xs font-bold text-foreground w-5 text-center">{letter}</span>
            <span className="text-[10px] text-muted-foreground">{dealers.length} dealer{dealers.length !== 1 ? 's' : ''}</span>
          </div>
          {/* Dealer rows */}
          <div className="divide-y divide-border/40">
            {dealers.map(dealer => (
              <button
                key={dealer.dealer_id}
                onClick={() => onDealerTap(dealer.dealer_id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 active:bg-muted/50 text-left"
              >
                <DealerAvatar dealer={dealer} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate text-foreground">{dealer.display_name}</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {dealer.city && (
                      <>
                        <MapPin className="w-2.5 h-2.5" />
                        <span>{dealer.city}</span>
                        <span>·</span>
                      </>
                    )}
                    <span>{dealer.script_count} script{dealer.script_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 -rotate-90" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Cities View (City-Grouped Dealers) ──────────────────────────────────────

function CitiesView({
  citiesByLetter,
  onDealerTap,
  registerSection,
}: {
  citiesByLetter: { letter: string; cities: { city: string; dealers: CatalogDealer[] }[] }[];
  onDealerTap: (dealerId: string) => void;
  registerSection: (key: string) => (el: HTMLElement | null) => void;
}) {
  if (citiesByLetter.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <MapPin className="w-8 h-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No cities found</p>
      </div>
    );
  }

  return (
    <div className="pb-4 pr-7">
      {citiesByLetter.map(({ letter, cities }) => (
        <div key={letter} ref={registerSection(letter)}>
          <div className="px-3 py-1.5 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <span className="text-xs font-bold text-foreground w-5 text-center inline-block">{letter}</span>
          </div>
          {cities.map(({ city, dealers }) => (
            <div key={city}>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/10">
                <MapPin className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">{city}</span>
                <span className="text-[10px] text-muted-foreground">{dealers.length} dealer{dealers.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-border/40">
                {dealers.map(dealer => (
                  <button
                    key={dealer.dealer_id}
                    onClick={() => onDealerTap(dealer.dealer_id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 active:bg-muted/50 text-left"
                  >
                    <DealerAvatar dealer={dealer} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate text-foreground">{dealer.display_name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {dealer.script_count} script{dealer.script_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 -rotate-90" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── A-Z Index Strip ─────────────────────────────────────────────────────────

function AlphaIndexStrip({
  availableLetters,
  sectionRefs,
}: {
  availableLetters: Set<string>;
  sectionRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const stripRef = useRef<HTMLDivElement>(null);
  const lastLetter = useRef('');

  const scrollToLetter = useCallback((letter: string) => {
    const el = sectionRefs.current.get(letter);
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
      return;
    }
  }, [sectionRefs]);

  const handlePointerEvent = useCallback((e: React.PointerEvent) => {
    const strip = stripRef.current;
    if (!strip) return;
    e.preventDefault();
    const rect = strip.getBoundingClientRect();
    const fraction = (e.clientY - rect.top) / rect.height;
    const idx = Math.max(0, Math.min(25, Math.floor(fraction * 26)));
    const letter = alphabet[idx];
    if (letter !== lastLetter.current) {
      lastLetter.current = letter;
      scrollToLetter(letter);
    }
  }, [scrollToLetter]);

  return (
    <div
      ref={stripRef}
      className="absolute right-0 top-0 bottom-0 w-6 flex flex-col items-center justify-around py-2 z-20"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        handlePointerEvent(e);
      }}
      onPointerMove={handlePointerEvent}
      onPointerUp={() => { lastLetter.current = ''; }}
    >
      {alphabet.split('').map(letter => (
        <span
          key={letter}
          className={cn(
            'text-[8px] font-bold leading-none select-none',
            availableLetters.has(letter) ? 'text-primary' : 'text-muted-foreground/30',
          )}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

// ── Dealer Avatar ───────────────────────────────────────────────────────────

function DealerAvatar({ dealer, size = 'md' }: { dealer: CatalogDealer; size?: 'sm' | 'md' }) {
  const [logoError, setLogoError] = useState(false);
  const dim = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className={cn(dim, 'rounded-full bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden')}>
      {dealer.logo_url && !logoError ? (
        <img src={dealer.logo_url} alt="" className="w-full h-full object-contain p-1" loading="lazy" onError={() => setLogoError(true)} />
      ) : (
        <span className={cn(textSize, 'font-bold text-muted-foreground')}>{dealer.display_name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function BrowseSkeleton() {
  return (
    <div className="animate-pulse p-3 space-y-4">
      {/* Popular dealers skeleton */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="w-5 h-5 rounded-md" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex gap-2 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2 w-14" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Commodity sections skeleton */}
      {[1, 2].map(section => (
        <div key={section}>
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="w-5 h-5 rounded-md" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <div className="space-y-0 divide-y divide-border/40">
            {[1, 2, 3, 4, 5].map(row => (
              <div key={row} className="flex items-center gap-2.5 px-3 py-2.5">
                <Skeleton className="w-1.5 h-1.5 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-40" />
                </div>
                <div className="space-y-1 text-right">
                  <Skeleton className="h-2.5 w-16 ml-auto" />
                  <Skeleton className="h-2.5 w-16 ml-auto" />
                </div>
                <Skeleton className="w-7 h-7 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Error State ─────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <p className="text-sm text-muted-foreground mb-3">{message}</p>
      <Button onClick={onRetry} variant="outline" size="sm">Retry</Button>
    </div>
  );
}
