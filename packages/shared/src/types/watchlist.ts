export interface WatchlistScript {
  id: string;
  dealerName: string;
  scriptName: string; // This is the symbol/key used for matching with WebSocket data
  scriptDisplayName?: string; // This is the human-readable name for display
  productType: string;
  addedAt: string;
  multiplier?: number; // Rate multiplier for quantity scaling
  // Store original search rates to avoid dependency on live data matching
  originalRates?: {
    buy?: number;
    sell?: number;
    timestamp?: string;
  };
}

export interface Watchlist {
  id: string;
  name: string;
  scripts: WatchlistScript[];
  createdAt: string;
  updatedAt: string;
}

export interface RateData {
  competitor: string;
  script: string;
  buyRate: number;
  sellRate: number;
  timestamp: string;
  productType: string;
}

export interface WatchlistRateData extends RateData {
  scriptId: string;
  hasLiveData?: boolean; // Flag to indicate if live data is available
  multiplier?: number; // Rate multiplier for quantity scaling
  priceDifference?: {
    buy: number;
    sell: number;
    comparedTo: 'average' | 'best' | 'worst';
  };
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  // For differences mode
  buyDifference?: number;
  sellDifference?: number;
  isReference?: boolean;
}

export interface SearchResult {
  id?: string;
  dealerName: string;
  scriptName: string; // This is the symbol/key used for matching
  scriptDisplayName?: string; // This is the human-readable name for display
  productType: string;
  currentRates: {
    buy?: number;
    sell?: number;
  };
  isInWatchlist: boolean;
  watchlistIds: string[];
  timestamp?: string;
}

export interface WatchlistSuggestion {
  dealer_id: string;
  dealer_display_name: string;
  script_name: string;
  script_display_name: string;
  canonical_type: string;
  buy_rate: number | null;
  sell_rate: number | null;
  suggestion_type: 'similar_dealer' | 'different_product';
  reason: string;
}

export interface WatchlistSuggestionsResponse {
  suggestions: WatchlistSuggestion[];
  watchlist_commodity: string | null;
}

export type ViewMode = 'buy' | 'sell' | 'differences';
export type SortMode = 'rate-asc' | 'rate-desc' | 'dealer' | 'added' | 'difference-asc' | 'difference-desc' | 'none';
export type LayoutMode = 'compact' | 'card';

// Service request/response types (extracted from watchlist service)

export interface WatchlistCreateRequest {
  name: string;
}

export interface WatchlistUpdateRequest {
  name?: string;
}

export interface WatchlistScriptCreateRequest {
  dealerName: string;
  scriptName: string;
  scriptDisplayName?: string;
  productType: string;
  multiplier?: number;
  originalBuyRate?: number;
  originalSellRate?: number;
  originalRatesTimestamp?: string;
}

export interface UserSettingsUpdateRequest {
  currentWatchlistId?: string;
  viewMode?: ViewMode;
  sortMode?: SortMode;
  referenceScriptId?: string;
  differenceType?: 'buy' | 'sell';
  layoutMode?: LayoutMode;
  cityFilter?: string | null;
}

export interface WatchlistsResponse {
  watchlists: Watchlist[];
  settings: {
    currentWatchlistId?: string;
    viewMode: ViewMode;
    sortMode: SortMode;
    referenceScriptId?: string;
    differenceType: 'buy' | 'sell';
    layoutMode: LayoutMode;
    cityFilter: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

export interface UserSettings {
  currentWatchlistId?: string;
  viewMode: ViewMode;
  sortMode: SortMode;
  referenceScriptId?: string;
  differenceType: 'buy' | 'sell';
  layoutMode: LayoutMode;
  cityFilter: string | null;
  createdAt: string;
  updatedAt: string;
}