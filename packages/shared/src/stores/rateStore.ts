/**
 * Module-level singleton rate store that lives outside React's render cycle.
 *
 * Stores rates as Map<competitor, Map<symbol, RateEntry>>.
 * Components subscribe to per-competitor version counters and only re-render
 * when the competitor they care about has new data.
 */

export interface RateEntry {
  competitor: string
  script: string       // symbol key
  script_name?: string // human-readable
  buy_rate?: number
  sell_rate?: number
  high_rate?: number
  low_rate?: number
  timestamp: string
  productType: string
}

type Listener = () => void

// ── Internal state ────────────────────────────────────────────────────────

/** competitor → (symbol → RateEntry) */
const store = new Map<string, Map<string, RateEntry>>()

/** competitor → monotonic version counter */
const versions = new Map<string, number>()

/** Global version bumped on every write (used by components showing all rates) */
let globalVersion = 0

/** Set of listener callbacks */
const listeners = new Set<Listener>()

// ── Helpers ───────────────────────────────────────────────────────────────

function inferProductType(symbol: string, scriptName?: string): string {
  const text = (symbol + ' ' + (scriptName || '')).toLowerCase()
  if (text.includes('silver') || text.includes('ag')) return 'Silver'
  if (text.includes('gold') || text.includes('au')) return 'Gold'
  if (text.includes('copper') || text.includes('cu')) return 'Copper'
  if (text.includes('platinum') || text.includes('pt')) return 'Platinum'
  if (text.includes('palladium') || text.includes('pd')) return 'Palladium'
  if (text.includes('inr') || text.includes('usd')) return 'Currency'
  return 'Gold'
}

function notify() {
  listeners.forEach(fn => fn())
}

function buildEntry(competitor: string, symbol: string, rate: any): RateEntry {
  return {
    competitor,
    script: symbol,
    script_name: rate.script_name,
    buy_rate: rate.buy_rate,
    sell_rate: rate.sell_rate,
    high_rate: rate.high_rate,
    low_rate: rate.low_rate,
    timestamp: rate.timestamp,
    productType: inferProductType(symbol, rate.script_name),
  }
}

function bumpVersion(competitor: string) {
  versions.set(competitor, (versions.get(competitor) ?? 0) + 1)
  globalVersion++
}

// ── Public API ────────────────────────────────────────────────────────────

/** Replace all rates for a competitor (full sync). */
export function updateCompetitorRates(competitor: string, rates: any[]) {
  const map = new Map<string, RateEntry>()
  for (const rate of rates) {
    map.set(rate.symbol, buildEntry(competitor, rate.symbol, rate))
  }
  store.set(competitor, map)
  bumpVersion(competitor)
  notify()
}

/** Apply differential changes for a competitor. */
export function updateCompetitorRatesDiff(
  competitor: string,
  changes: { updated?: any[]; added?: any[]; removed?: string[] },
) {
  let map = store.get(competitor)
  if (!map) {
    map = new Map()
    store.set(competitor, map)
  }

  const { updated = [], added = [], removed = [] } = changes

  for (const rate of [...updated, ...added]) {
    map.set(rate.symbol, buildEntry(competitor, rate.symbol, rate))
  }

  for (const symbol of removed) {
    map.delete(symbol)
  }

  // Unchanged entries keep their timestamps — backend refreshes active ones,
  // frontend picks up fresh data via the 30s HTTP poll.

  bumpVersion(competitor)
  notify()
}

/** Bulk-load initial rates from REST response (object of objects). */
export function loadInitialRates(backendRates: Record<string, Record<string, any>>) {
  for (const [competitor, rates] of Object.entries(backendRates)) {
    const map = new Map<string, RateEntry>()
    for (const [symbol, info] of Object.entries(rates)) {
      map.set(symbol, buildEntry(competitor, symbol, info))
    }
    store.set(competitor, map)
    versions.set(competitor, (versions.get(competitor) ?? 0) + 1)
  }
  globalVersion++
  notify()
}

/** Handle heartbeat — no-op on the frontend.  Backend refreshes timestamps
 *  for recently-seen symbols only; frontend syncs via the 30s HTTP poll
 *  (loadInitialRates).  This prevents orphaned rates from being kept alive. */
export function refreshCompetitorTimestamps(_competitor: string, _timestamp: string) {
  // Intentionally empty — backend manages timestamp freshness,
  // frontend picks it up via periodic HTTP poll.
}

/** Get a single rate entry. */
export function getRate(competitor: string, symbol: string): RateEntry | undefined {
  return store.get(competitor)?.get(symbol)
}

/** Get all rates as a flat array (for search, export, etc.). */
export function getAllRates(): RateEntry[] {
  const result: RateEntry[] = []
  store.forEach(map => map.forEach(entry => result.push(entry)))
  return result
}

/** Get version counter for a competitor. */
export function getVersion(competitor: string): number {
  return versions.get(competitor) ?? 0
}

/** Get global version (changes on every write). */
export function getGlobalVersion(): number {
  return globalVersion
}

/** Subscribe to any store change. Returns unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// ── Compatibility helpers (for components migrated from useRateData) ─────

/** Get rates as nested object: competitor → symbol → RateEntry. */
export function getRatesAsObject(): Record<string, Record<string, RateEntry>> {
  const result: Record<string, Record<string, RateEntry>> = {}
  store.forEach((map, competitor) => {
    result[competitor] = Object.fromEntries(map)
  })
  return result
}

/** Get all competitor names currently in the store. */
export function getCompetitors(): string[] {
  return Array.from(store.keys())
}

/** Get all unique symbols across all competitors, sorted. */
export function getScripts(): string[] {
  const scripts = new Set<string>()
  store.forEach(map => map.forEach((_, symbol) => scripts.add(symbol)))
  return Array.from(scripts).sort()
}

/** Get display name for a symbol (searches all competitors). */
export function getScriptDisplayName(symbol: string): string {
  for (const map of store.values()) {
    const entry = map.get(symbol)
    if (entry?.script_name) return entry.script_name
  }
  return symbol
}
