# Browse & Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic "Add Scripts" text search with a rich "Browse & Compare" experience — pre-populated catalog grouped by commodity, collapsible taxonomy filters (commodity/purity/weight), A-Z dealer quick-jump, city-grouped dealer view, and instant text search — all mobile-first.

**Architecture:** Pragmatic balance — 2 new frontend files + 1 CSS addition + backend taxonomy pass-through. The existing `/api/onboarding/catalog` endpoint already returns commodity-grouped dealer/script data via the taxonomy classifier. We extend it to include `purity` and `weight` fields (already computed, just not returned) and add filter query params. Frontend gets a new `BrowseOverlay.tsx` that replaces `ScriptSearch.tsx`, with shared sub-components extracted to `BrowseShared.tsx`. All filter state is local to the overlay (no new context). Text search remains instant (client-side rateStore); taxonomy filters use the server catalog.

**Tech Stack:** Python/FastAPI (backend), React + Vite + TailwindCSS + ShadCN/Radix (frontend), TypeScript shared types (`@comp-intel/shared`)

---

## File Structure

### Files to Create

| File | Responsibility |
|------|---------------|
| `frontend/src/components/watchlist/BrowseShared.tsx` | Extracted `ScriptRow` and `AddButton` components shared between old ScriptSearch and new BrowseOverlay |
| `frontend/src/components/watchlist/BrowseOverlay.tsx` | Full-screen browse overlay: catalog view, filter panel, A-Z strip, text search, add-to-watchlist |

### Files to Modify

| File | Change |
|------|--------|
| `backend/app/schemas/onboarding.py:40-45` | Add `purity` and `weight` fields to `CatalogScript` |
| `backend/app/services/onboarding_service.py:257-264` | Pass taxonomy `purity`/`weight` into `CatalogScript` construction |
| `backend/app/services/onboarding_service.py:158-161` | Add `purity_filter` and `weight_filter` params to `build_rate_catalog()` |
| `backend/app/api/onboarding.py:72-93` | Add `purity` and `weight` query params to catalog endpoint |
| `packages/shared/src/types/onboarding.ts:10-16` | Add `purity` and `weight` fields to `CatalogScript` interface |
| `packages/shared/src/services/onboarding.ts:43-48` | Accept `purity` and `weight` filter params in `getCatalog()` |
| `frontend/src/components/watchlist/WatchlistApp.tsx:1-9,28-36` | Replace "Add Scripts" button with gradient "Compare" button, swap ScriptSearch for BrowseOverlay |
| `frontend/src/App.css` | Add `@keyframes shimmer` for Compare button animation |

---

## User Requirements Summary

These were confirmed in the interview:

1. **Replace "Add Scripts"** with a stylish animated "Compare" button (multi-color gradient)
2. **Full-screen overlay** opens pre-populated — all scripts grouped by commodity, popular dealers section at top
3. **Collapsible filter panel** slides down: Commodity (Gold/Silver), Purity (999/995/916/750), Weight (1g/10g/1kg) — OR logic (checkbox behavior)
4. **Text search stays instant** (client-side rateStore); taxonomy filters use server API
5. **A-Z vertical strip** on right edge — tap/drag to scroll to dealer section, visible in both views
6. **Dealer list**: all 149+ dealers with search, grouped by city
7. **City filter**: script city (from taxonomy) overrides dealer city (from metadata) for more specificity
8. **Taxonomy is the single source of truth** — no frontend heuristics duplicating classification logic

---

## Task 1: Extend CatalogScript Schema (Backend)

**Files:**
- Modify: `backend/app/schemas/onboarding.py:40-45`
- Modify: `packages/shared/src/types/onboarding.ts:10-16`

- [ ] **Step 1: Add purity and weight to the Python schema**

In `backend/app/schemas/onboarding.py`, the `CatalogScript` class at line 40:

```python
class CatalogScript(BaseModel):
    symbol: str
    display_name: str
    product_type: str
    buy_rate: Optional[float] = None
    sell_rate: Optional[float] = None
    purity: Optional[str] = None        # e.g. "999", "995", "916", "750"
    weight: Optional[str] = None        # e.g. "1g", "10g", "100g", "1kg"
```

- [ ] **Step 2: Add purity and weight to the TypeScript interface**

In `packages/shared/src/types/onboarding.ts`, the `CatalogScript` interface at line 10:

```typescript
export interface CatalogScript {
  symbol: string;
  display_name: string;
  product_type: string;
  buy_rate: number | null;
  sell_rate: number | null;
  purity: string | null;    // e.g. "999", "995", "916", "750"
  weight: string | null;    // e.g. "1g", "10g", "100g", "1kg"
}
```

- [ ] **Step 3: Verify no type errors**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors (new fields are optional/nullable)

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/onboarding.py packages/shared/src/types/onboarding.ts
git commit -m "feat: add purity and weight fields to CatalogScript schema"
```

---

## Task 2: Pass Taxonomy Fields Through in build_rate_catalog()

**Files:**
- Modify: `backend/app/services/onboarding_service.py:257-264`

The taxonomy classifier already computes `purity` and `weight` per script (stored in the `tax` dict at line 239). We just need to pass them into the `CatalogScript` constructor at line 258.

- [ ] **Step 1: Pass purity and weight from taxonomy into CatalogScript**

At `onboarding_service.py:257-264`, the current code:

```python
commodity_dealers[product_type][dealer_id].scripts.append(
    CatalogScript(
        symbol=symbol,
        display_name=script_name,
        product_type=product_type,
        buy_rate=rate_data.get("buy_rate"),
        sell_rate=rate_data.get("sell_rate"),
    )
)
```

Change to:

```python
commodity_dealers[product_type][dealer_id].scripts.append(
    CatalogScript(
        symbol=symbol,
        display_name=script_name,
        product_type=product_type,
        buy_rate=rate_data.get("buy_rate"),
        sell_rate=rate_data.get("sell_rate"),
        purity=tax.get("purity"),
        weight=tax.get("weight"),
    )
)
```

- [ ] **Step 2: Verify backend syntax**

Run: `cd backend && python -c "from app.services.onboarding_service import OnboardingService; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/onboarding_service.py
git commit -m "feat: pass taxonomy purity/weight through to catalog response"
```

---

## Task 3: Add Purity/Weight Filter Params to Catalog API

**Files:**
- Modify: `backend/app/services/onboarding_service.py:158-161` (function signature)
- Modify: `backend/app/services/onboarding_service.py:267-320` (filter + cache key)
- Modify: `backend/app/api/onboarding.py:72-93` (endpoint params)

- [ ] **Step 1: Update build_rate_catalog signature**

At `onboarding_service.py:158`, change:

```python
@staticmethod
async def build_rate_catalog(
    include_rates: bool,
    commodity_filter: Optional[List[str]] = None,
) -> CatalogResponse:
```

To:

```python
@staticmethod
async def build_rate_catalog(
    include_rates: bool,
    commodity_filter: Optional[List[str]] = None,
    purity_filter: Optional[List[str]] = None,
    weight_filter: Optional[List[str]] = None,
) -> CatalogResponse:
```

- [ ] **Step 2: Apply purity/weight filtering post-retrieval (no cache key change)**

**Important:** Do NOT add purity/weight to the cache key. The base cache (`full`/`structure`) holds the unfiltered catalog. Purity and weight filters are applied post-retrieval, exactly like `commodity_filter` already works. This avoids cache key explosion (4 purities × 4 weights × 2 access levels = 512 possible keys).

After the existing commodity filter block (after line 318), add purity and weight filtering:

```python
# Apply purity/weight filters (post-build, like commodity filter)
if purity_filter:
    lower_purity = [p.lower() for p in purity_filter]
    for commodity in response.commodities:
        for dealer in commodity.dealers:
            dealer.scripts = [
                s for s in dealer.scripts
                if s.purity and s.purity.lower() in lower_purity
            ]
            dealer.script_count = len(dealer.scripts)
        commodity.dealers = [d for d in commodity.dealers if d.scripts]
        commodity.dealer_count = len(commodity.dealers)
    response.commodities = [c for c in response.commodities if c.dealers]

if weight_filter:
    lower_weight = [w.lower() for w in weight_filter]
    for commodity in response.commodities:
        for dealer in commodity.dealers:
            dealer.scripts = [
                s for s in dealer.scripts
                if s.weight and s.weight.lower() in lower_weight
            ]
            dealer.script_count = len(dealer.scripts)
        commodity.dealers = [d for d in commodity.dealers if d.scripts]
        commodity.dealer_count = len(commodity.dealers)
    response.commodities = [c for c in response.commodities if c.dealers]
```

- [ ] **Step 4: Update the API endpoint to accept new params**

At `backend/app/api/onboarding.py:72-93`, change the endpoint:

```python
@router.get("/catalog", response_model=CatalogResponse)
async def get_catalog(
    commodities: str = None,
    purity: str = None,
    weight: str = None,
    current_user: User = Depends(get_current_user),
):
    """
    Get all dealers + scripts grouped by commodity.
    Optional query params: ?commodities=gold,silver&purity=999,995&weight=1g,10g
    """
    include_rates = await is_access_allowed(
        current_user.id, current_user.is_admin, current_user.onboarding_complete
    )

    commodity_filter = None
    if commodities:
        commodity_filter = [c.strip() for c in commodities.split(",") if c.strip()]

    purity_filter = None
    if purity:
        purity_filter = [p.strip() for p in purity.split(",") if p.strip()]

    weight_filter = None
    if weight:
        weight_filter = [w.strip() for w in weight.split(",") if w.strip()]

    return await OnboardingService.build_rate_catalog(
        include_rates, commodity_filter, purity_filter, weight_filter
    )
```

- [ ] **Step 5: Verify backend syntax**

Run: `cd backend && python -c "from app.api.onboarding import router; print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/onboarding_service.py backend/app/api/onboarding.py
git commit -m "feat: add purity/weight filter params to catalog API"
```

---

## Task 4: Update Shared Service to Pass Filter Params

**Files:**
- Modify: `packages/shared/src/services/onboarding.ts:43-48`

- [ ] **Step 1: Update getCatalog to accept filter params**

At `packages/shared/src/services/onboarding.ts:42-48`, change:

```typescript
/** Get rate catalog grouped by commodity */
async getCatalog(commodities?: string[]): Promise<CatalogResponse> {
  const api = getApiClient();
  const params = commodities?.length ? { commodities: commodities.join(',') } : {};
  const { data } = await api.get('/api/onboarding/catalog', { params });
  return data;
},
```

To:

```typescript
/** Get rate catalog grouped by commodity, with optional taxonomy filters */
async getCatalog(options?: {
  commodities?: string[];
  purity?: string[];
  weight?: string[];
}): Promise<CatalogResponse> {
  const api = getApiClient();
  const params: Record<string, string> = {};
  if (options?.commodities?.length) params.commodities = options.commodities.join(',');
  if (options?.purity?.length) params.purity = options.purity.join(',');
  if (options?.weight?.length) params.weight = options.weight.join(',');
  const { data } = await api.get('/api/onboarding/catalog', { params });
  return data;
},
```

- [ ] **Step 2: Update existing callers to use new signature**

Verify there are no other callers first:

Run: `grep -r "getCatalog" packages/ frontend/ admin/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".d.ts"`

The only caller of `getCatalog(commodities)` with a positional array is `DealerStep.tsx:268`:

```typescript
const catalog = await onboardingService.getCatalog(
  selectedCommodities.length > 0 ? selectedCommodities : undefined,
);
```

Change to:

```typescript
const catalog = await onboardingService.getCatalog(
  selectedCommodities.length > 0 ? { commodities: selectedCommodities } : undefined,
);
```

- [ ] **Step 3: Verify no type errors**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/services/onboarding.ts frontend/src/components/onboarding/steps/DealerStep.tsx
git commit -m "feat: update getCatalog to accept taxonomy filter params"
```

---

## Task 5: Extract Shared Components (BrowseShared.tsx)

**Files:**
- Create: `frontend/src/components/watchlist/BrowseShared.tsx`
- Modify: `frontend/src/components/watchlist/ScriptSearch.tsx`

Extract `ResultRow` (lines 239-293) and `AddButton` (lines 296-344) from ScriptSearch into a shared file, so both the old ScriptSearch and the new BrowseOverlay can import them.

- [ ] **Step 1: Create BrowseShared.tsx with extracted components**

Create `frontend/src/components/watchlist/BrowseShared.tsx`:

```tsx
import { Plus, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { formatCurrency, isDataStale } from '@comp-intel/shared/lib/formatters';
import { cn } from '../../lib/cn';

export type AddState = 'adding' | 'error';

// ── Add Button ──────────────────────────────────────────────────────────────

export function AddButton({
  state,
  isInWatchlist,
  onAdd,
}: {
  state?: AddState;
  isInWatchlist: boolean;
  onAdd: () => void;
}) {
  if (isInWatchlist) {
    return (
      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Check className="w-3.5 h-3.5 text-primary" />
      </div>
    );
  }

  if (state === 'adding') {
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

// ── Script Result Row ───────────────────────────────────────────────────────

export interface ScriptRowData {
  id: string;
  dealerName: string;
  scriptName: string;
  scriptDisplayName: string;
  productType: string;
  buyRate?: number;
  sellRate?: number;
  timestamp?: string;
  isInCurrentWatchlist: boolean;
}

export function ScriptRow({
  script,
  addState,
  onAdd,
}: {
  script: ScriptRowData;
  addState?: AddState;
  onAdd: () => void;
}) {
  const hasBuy = (script.buyRate || 0) > 0;
  const hasSell = (script.sellRate || 0) > 0;
  const hasRates = hasBuy || hasSell;
  const stale = script.timestamp ? isDataStale(script.timestamp) : false;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/30 active:bg-muted/50">
      {/* Freshness dot */}
      <div
        className={cn(
          'w-1.5 h-1.5 rounded-full shrink-0',
          !hasRates ? 'bg-gray-300 dark:bg-gray-600' : stale ? 'bg-amber-500' : 'bg-green-500'
        )}
      />

      {/* Dealer + Script info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate text-foreground">
          {script.dealerName}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {script.scriptDisplayName || script.scriptName}
        </div>
      </div>

      {/* Rates */}
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

      {/* Add button */}
      <AddButton
        state={addState}
        isInWatchlist={script.isInCurrentWatchlist}
        onAdd={onAdd}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update ScriptSearch.tsx to import from BrowseShared**

In `frontend/src/components/watchlist/ScriptSearch.tsx`:

1. Add import at top: `import { ScriptRow, AddButton, type AddState, type ScriptRowData } from './BrowseShared';`
2. Remove the local `type AddState = 'adding' | 'error';` (line 20)
3. Remove the local `ResultRow` component (lines 239-293)
4. Remove the local `AddButton` component (lines 296-344)
5. Replace `<ResultRow` with `<ScriptRow` in the JSX (line 192)
6. Update the `results` useMemo to match `ScriptRowData` shape (it already does — field names match)

- [ ] **Step 3: Verify the app still works**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/watchlist/BrowseShared.tsx frontend/src/components/watchlist/ScriptSearch.tsx
git commit -m "refactor: extract ScriptRow and AddButton to BrowseShared"
```

---

## Task 6: Add Shimmer Keyframe to App.css

**Files:**
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Add shimmer animation after the slide-up keyframe (after line 294)**

```css
/* Compare button gradient shimmer */
@keyframes shimmer {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}
.animate-shimmer {
  background-size: 200% auto;
  animation: shimmer 3s linear infinite;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.css
git commit -m "feat: add shimmer keyframe for Compare button"
```

---

## Task 7: Build BrowseOverlay — Scaffold + Catalog Loading

**Files:**
- Create: `frontend/src/components/watchlist/BrowseOverlay.tsx`

This is the largest task. We build the overlay in stages within this one file. The overlay has two modes:
- **Browse mode** (default): Pre-populated catalog grouped by commodity, with filter panel
- **Search mode** (when query is typed): Instant client-side search against rateStore

And two views within browse mode:
- **Scripts view** (default): Scripts grouped by commodity → dealer
- **Dealers view**: Dealers grouped by city, with A-Z strip

- [ ] **Step 1: Create the overlay scaffold with catalog loading**

Create `frontend/src/components/watchlist/BrowseOverlay.tsx` with this structure. The complete component is large (~500 lines following the DealerStep.tsx pattern), so we build it incrementally. Start with:

```tsx
import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown, Star, MapPin, Sparkles, Users } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { useWatchlist } from '../../contexts/WatchlistContext';
import { getAllRates } from '@comp-intel/shared/stores/rateStore';
import { useGlobalRateVersion } from '../../hooks/useRateVersion';
import { onboardingService } from '@comp-intel/shared/services/onboarding';
import type { CatalogResponse, CatalogDealer, CatalogScript, CatalogCommodity } from '@comp-intel/shared/types/onboarding';
import { ScriptRow, AddButton, type AddState, type ScriptRowData } from './BrowseShared';
import { cn } from '../../lib/cn';

// ── Types ───────────────────────────────────────────────────────────────────

type ViewTab = 'scripts' | 'dealers';

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

// Known filter options (from taxonomy — these are the most common values)
const COMMODITY_OPTIONS = ['Gold', 'Silver'] as const;
const PURITY_OPTIONS = ['999', '995', '916', '750'] as const;
const WEIGHT_OPTIONS = ['1g', '10g', '100g', '1kg'] as const;

// ── Main Component ──────────────────────────────────────────────────────────

export function BrowseOverlay() {
  const {
    isSearchOpen,
    setSearchOpen,
    addScriptToWatchlist,
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
  const [dealerFilter, setDealerFilter] = useState<string | null>(null); // dealer_id to filter scripts by
  const scrollRef = useRef<HTMLDivElement>(null);

  const rateVersion = useGlobalRateVersion(); // triggers re-render on WS updates

  const isSearching = deferredSearch.trim().length > 0;
  const hasActiveFilters = filters.commodities.size > 0 || filters.purities.size > 0 || filters.weights.size > 0;
  const activeFilterCount = filters.commodities.size + filters.purities.size + filters.weights.size;

  // ── Catalog Fetch ─────────────────────────────────────────────────────
  const fetchCatalog = useCallback(async (filterState: FilterState) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const options: Parameters<typeof onboardingService.getCatalog>[0] = {};
      if (filterState.commodities.size > 0) options.commodities = [...filterState.commodities];
      if (filterState.purities.size > 0) options.purity = [...filterState.purities];
      if (filterState.weights.size > 0) options.weight = [...filterState.weights];
      const data = await onboardingService.getCatalog(
        Object.keys(options).length > 0 ? options : undefined,
      );
      setCatalog(data);
    } catch {
      setCatalogError('Failed to load catalog');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  // Load catalog on open
  useEffect(() => {
    if (isSearchOpen) {
      fetchCatalog(EMPTY_FILTERS);
    }
  }, [isSearchOpen, fetchCatalog]);

  // Refetch when filters change (debounced to avoid rapid API calls)
  useEffect(() => {
    if (!isSearchOpen || !hasActiveFilters) return;
    const timer = setTimeout(() => fetchCatalog(filters), 300);
    return () => clearTimeout(timer);
  }, [isSearchOpen, filters, hasActiveFilters, fetchCatalog]);

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
    fetchCatalog(EMPTY_FILTERS);
  }, [fetchCatalog]);

  // ── Instant Text Search (client-side rateStore) ───────────────────────
  const searchResults = useMemo((): ScriptRowData[] => {
    if (!deferredSearch.trim()) return [];

    const terms = deferredSearch.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const allRates = getAllRates();
    const currentScripts = watchlists.find(w => w.id === currentWatchlistId)?.scripts || [];

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
          isInCurrentWatchlist: currentScripts.some(
            s => s.dealerName === entry.competitor && s.scriptName === entry.script
          ),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSearch, watchlists, currentWatchlistId, rateVersion]);

  // ── Catalog-based script list (for browse mode) ───────────────────────
  const catalogScripts = useMemo((): ScriptRowData[] => {
    if (!catalog) return [];
    const currentScripts = watchlists.find(w => w.id === currentWatchlistId)?.scripts || [];
    const results: ScriptRowData[] = [];

    for (const commodity of catalog.commodities) {
      for (const dealer of commodity.dealers) {
        if (dealerFilter && dealer.dealer_id !== dealerFilter) continue;
        for (const script of dealer.scripts) {
          const id = `${dealer.dealer_id}::${script.symbol}`;
          results.push({
            id,
            dealerName: dealer.display_name,
            scriptName: script.symbol,
            scriptDisplayName: script.display_name,
            productType: script.product_type,
            buyRate: script.buy_rate ?? undefined,
            sellRate: script.sell_rate ?? undefined,
            isInCurrentWatchlist: currentScripts.some(
              s => s.dealerName === dealer.dealer_id && s.scriptName === script.symbol
            ),
          });
        }
      }
    }
    return results;
  }, [catalog, watchlists, currentWatchlistId, dealerFilter]);

  // ── Dealer list for dealers view (grouped by city) ────────────────────
  const dealersByCity = useMemo(() => {
    if (!catalog) return [];
    const dealerMap = new Map<string, CatalogDealer>();
    for (const commodity of catalog.commodities) {
      for (const dealer of commodity.dealers) {
        if (!dealerMap.has(dealer.dealer_id)) {
          dealerMap.set(dealer.dealer_id, { ...dealer });
        } else {
          const existing = dealerMap.get(dealer.dealer_id)!;
          existing.script_count += dealer.script_count;
        }
      }
    }

    const cityMap = new Map<string, CatalogDealer[]>();
    for (const dealer of dealerMap.values()) {
      const city = dealer.city || 'Other';
      if (!cityMap.has(city)) cityMap.set(city, []);
      cityMap.get(city)!.push(dealer);
    }

    return Array.from(cityMap.entries())
      .map(([city, dealers]) => ({
        city,
        dealers: dealers.sort((a, b) => a.display_name.localeCompare(b.display_name)),
      }))
      .sort((a, b) => b.dealers.length - a.dealers.length);
  }, [catalog]);

  // Available first-letters for A-Z strip (built from CITY names, since sections are keyed by city)
  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    for (const { city } of dealersByCity) {
      const letter = city.charAt(0).toUpperCase();
      if (/[A-Z]/.test(letter)) letters.add(letter);
    }
    return letters;
  }, [dealersByCity]);

  // ── Section refs for A-Z scrolling ────────────────────────────────────
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const registerSection = useCallback((key: string) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(key, el);
    else sectionRefs.current.delete(key);
  }, []);

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

  // ── Add to Watchlist handler ──────────────────────────────────────────
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
  }, [addStates, addScriptToWatchlist, currentWatchlistId]);

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

        {/* Filter panel (collapsible) */}
        <div className={cn(
          'overflow-hidden transition-[max-height] duration-200 ease-out',
          filterOpen ? 'max-h-52' : 'max-h-0',
        )}>
          <FilterPanel
            filters={filters}
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
              addStates={addStates}
              onAdd={handleAdd}
            />
          ) : catalogLoading && !catalog ? (
            <BrowseSkeleton />
          ) : catalogError && !catalog ? (
            <ErrorState message={catalogError} onRetry={() => fetchCatalog(filters)} />
          ) : activeTab === 'scripts' ? (
            <ScriptsView
              catalog={catalog}
              popularDealers={popularDealers}
              catalogScripts={catalogScripts}
              currentScripts={watchlists.find(w => w.id === currentWatchlistId)?.scripts || []}
              addStates={addStates}
              onAdd={handleAdd}
              dealerFilter={dealerFilter}
              onDealerTap={(id) => { setDealerFilter(id); setActiveTab('scripts'); }}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />
          ) : (
            <DealersView
              dealersByCity={dealersByCity}
              onDealerTap={(id) => { setDealerFilter(id); setActiveTab('scripts'); }}
              registerSection={registerSection}
            />
          )}
        </div>

        {/* A-Z Strip (visible in dealers view when not searching) */}
        {!isSearching && activeTab === 'dealers' && (
          <AlphaIndexStrip
            availableLetters={availableLetters}
            sectionRefs={sectionRefs}
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
  onToggle,
  onClear,
}: {
  filters: FilterState;
  onToggle: (dimension: keyof FilterState, value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="px-3 pb-3 space-y-2.5 border-t bg-muted/20">
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs font-semibold text-muted-foreground">Filters</span>
        {(filters.commodities.size + filters.purities.size + filters.weights.size) > 0 && (
          <button onClick={onClear} className="text-[10px] text-primary font-medium">
            Clear all
          </button>
        )}
      </div>
      <FilterChipGroup label="Commodity" options={COMMODITY_OPTIONS} selected={filters.commodities} onToggle={(v) => onToggle('commodities', v)} />
      <FilterChipGroup label="Purity" options={PURITY_OPTIONS} selected={filters.purities} onToggle={(v) => onToggle('purities', v)} />
      <FilterChipGroup label="Weight" options={WEIGHT_OPTIONS} selected={filters.weights} onToggle={(v) => onToggle('weights', v)} />
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
  addStates,
  onAdd,
}: {
  results: ScriptRowData[];
  query: string;
  addStates: Record<string, AddState>;
  onAdd: (script: ScriptRowData) => void;
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
            addState={addStates[script.id]}
            onAdd={() => onAdd(script)}
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
  currentScripts,
  addStates,
  onAdd,
  dealerFilter,
  onDealerTap,
  hasActiveFilters,
  onClearFilters,
}: {
  catalog: CatalogResponse | null;
  popularDealers: CatalogDealer[];
  catalogScripts: ScriptRowData[];
  currentScripts: Array<{ dealerName: string; scriptName: string }>;
  addStates: Record<string, AddState>;
  onAdd: (script: ScriptRowData) => void;
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
        <div className="divide-y divide-border/40">
          {catalogScripts.map(script => (
            <ScriptRow key={script.id} script={script} addState={addStates[script.id]} onAdd={() => onAdd(script)} />
          ))}
        </div>
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
                const scriptData: ScriptRowData = {
                  id,
                  dealerName: dealer.display_name,
                  scriptName: script.symbol,
                  scriptDisplayName: script.display_name,
                  productType: script.product_type,
                  buyRate: script.buy_rate ?? undefined,
                  sellRate: script.sell_rate ?? undefined,
                  isInCurrentWatchlist: currentScripts.some(
                    s => s.dealerName === dealer.dealer_id && s.scriptName === script.symbol
                  ),
                };
                return (
                  <ScriptRow
                    key={id}
                    script={scriptData}
                    addState={addStates[id]}
                    onAdd={() => onAdd(scriptData)}
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
  dealersByCity,
  onDealerTap,
  registerSection,
}: {
  dealersByCity: { city: string; dealers: CatalogDealer[] }[];
  onDealerTap: (dealerId: string) => void;
  registerSection: (key: string) => (el: HTMLElement | null) => void;
}) {
  if (dealersByCity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Users className="w-8 h-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No dealers found</p>
      </div>
    );
  }

  return (
    <div className="pb-4 pr-7">
      {dealersByCity.map(({ city, dealers }) => (
        <div key={city} ref={registerSection(city)}>
          {/* City header */}
          <div className="flex items-center gap-2 px-3 py-2 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <MapPin className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-bold text-foreground">{city}</span>
            <span className="text-[10px] text-muted-foreground">{dealers.length}</span>
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
  );
}

// ── A-Z Index Strip ─────────────────────────────────────────────────────────

function AlphaIndexStrip({
  availableLetters,
  sectionRefs,
  scrollRef,
}: {
  availableLetters: Set<string>;
  sectionRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const stripRef = useRef<HTMLDivElement>(null);
  const lastLetter = useRef('');

  const scrollToLetter = useCallback((letter: string) => {
    // Find the city section starting with this letter
    for (const [city, el] of sectionRefs.current.entries()) {
      if (city.charAt(0).toUpperCase() === letter) {
        el.scrollIntoView({ block: 'start', behavior: 'auto' });
        return;
      }
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/watchlist/BrowseOverlay.tsx
git commit -m "feat: add BrowseOverlay with catalog, filters, A-Z strip, and search"
```

---

## Task 8: Wire BrowseOverlay into WatchlistApp

**Files:**
- Modify: `frontend/src/components/watchlist/WatchlistApp.tsx`

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { Search, Plus, TrendingUp } from 'lucide-react';
```
With:
```typescript
import { Search, TrendingUp } from 'lucide-react';
```

Add new import:
```typescript
import { BrowseOverlay } from './BrowseOverlay';
```

Remove (no longer needed):
```typescript
import { ScriptSearch } from './ScriptSearch';
```

- [ ] **Step 2: Replace the "Add Scripts" button with gradient "Compare" button**

Replace lines 28-36 (the current Button):
```tsx
<Button
  onClick={() => setSearchOpen(true)}
  size="sm"
  className="gap-2 shrink-0"
  data-coach="add-scripts-btn"
>
  <Search className="w-4 h-4" />
  Add Scripts
</Button>
```

With:
```tsx
<button
  onClick={() => setSearchOpen(true)}
  data-coach="add-scripts-btn"
  className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 text-white shadow-md shadow-amber-500/25 hover:shadow-lg hover:shadow-amber-500/35 hover:-translate-y-0.5 active:scale-[0.96] active:shadow-sm transition-all duration-150 animate-shimmer"
>
  <Search className="w-3.5 h-3.5" />
  Compare
</button>
```

- [ ] **Step 3: Replace ScriptSearch with BrowseOverlay**

Replace:
```tsx
<ScriptSearch />
```
With:
```tsx
<BrowseOverlay />
```

- [ ] **Step 4: Update EmptyWatchlistState button text**

In the `EmptyWatchlistState` component (line 135), change:
```tsx
<Plus className="w-5 h-5" />
Search & Add Scripts
```
To:
```tsx
<Search className="w-5 h-5" />
Browse & Compare
```

Remove the `Plus` import if no longer used.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/watchlist/WatchlistApp.tsx
git commit -m "feat: replace Add Scripts with gradient Compare button and BrowseOverlay"
```

---

## Task 9: Manual Testing Checklist

Test on mobile viewport (390px width) at `http://localhost:3333`. Dev login: phone `9600088158`, OTP `0000`.

- [ ] **Step 1: Compare button renders with gradient shimmer animation**
- [ ] **Step 2: Tapping Compare opens the browse overlay with slide-up animation**
- [ ] **Step 3: Catalog loads — popular dealers section appears at top, followed by Gold and Silver commodity sections with scripts**
- [ ] **Step 4: Each script row shows dealer name, script name, buy/sell rates, freshness dot, and + button**
- [ ] **Step 5: Tapping + adds script to current watchlist (loading spinner, then check mark)**
- [ ] **Step 6: Filter toggle button opens/closes the collapsible filter panel**
- [ ] **Step 7: Selecting Gold filter shows only Gold scripts; selecting Silver shows only Silver; selecting both shows both (OR logic)**
- [ ] **Step 8: Selecting purity 999 filters to only 999 purity scripts (server-side via taxonomy)**
- [ ] **Step 9: Filter count badge shows on the filter button**
- [ ] **Step 10: Clear all filters resets and shows full catalog**
- [ ] **Step 11: Typing in search field switches to instant search mode (client-side rateStore)**
- [ ] **Step 12: Clearing search returns to browse mode with filters intact**
- [ ] **Step 13: Switching to Dealers tab shows all dealers grouped by city**
- [ ] **Step 14: A-Z strip appears on right edge in Dealers view**
- [ ] **Step 15: Tapping/dragging A-Z strip scrolls to the correct city section**
- [ ] **Step 16: Tapping a dealer in Dealers view switches to Scripts tab filtered to that dealer's scripts**
- [ ] **Step 17: "Clear dealer" pill appears and works to reset the dealer filter**
- [ ] **Step 18: Done button closes the overlay and resets all state**
- [ ] **Step 19: Empty filter state shows "No scripts match your filters" with clear button**
- [ ] **Step 20: A-Z strip does NOT overlap dealer names (pr-7 padding present)**

---

## Implementation Notes

### Key Patterns Used
- **Full-screen overlay**: `fixed inset-0 bg-background z-50 flex flex-col animate-slide-up` (from ScriptSearch.tsx:147)
- **Mobile scroll**: `flex-1 min-h-0` parent + `absolute inset-0 overflow-y-auto overscroll-contain` child (from WizardShell, DealerStep)
- **Collapsible panel**: `overflow-hidden transition-[max-height] duration-200 ease-out` with `max-h-0`/`max-h-52` toggle
- **A-Z strip**: `absolute right-0 inset-y-0 w-6` with `touch-action: none` and `setPointerCapture` for drag
- **Dealer avatar fallback**: First letter of name in rounded circle (from DealerStep DealerCard)
- **Add state machine**: `Record<id, 'adding' | 'error'>` with 2500ms error auto-clear (from ScriptSearch)

### Data Flow Summary
```
Browse mode:
  onboardingService.getCatalog({commodities?, purity?, weight?})
  → GET /api/onboarding/catalog?purity=999&weight=10g
  → build_rate_catalog() calls get_cached_taxonomy() → taxonomy classifies → filters → returns CatalogResponse
  → Frontend renders commodity sections with ScriptRow components

Search mode:
  getAllRates() from rateStore (client-side, instant, 0ms)
  → Multi-term AND match against competitor + script_name + script
  → ScriptRow components render flat list

Both modes:
  addScriptToWatchlist() → POST /api/watchlist/{id}/scripts
```

### Why Taxonomy is the Single Source of Truth
The purity/weight filter values come from `rate_taxonomy.py:RateClassification` which handles all naming conventions:
- VOTS/SocketIO: "GOLD 999" → purity=999
- WinBull: numeric IDs → classified by rate magnitude
- RSBL: "GOLDMUM1KG995" → purity=995, weight=1kg
- No frontend heuristics needed — the backend classifier handles edge cases
