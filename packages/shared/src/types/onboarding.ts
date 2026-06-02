export interface OnboardingState {
  step: string | null;
  commodities: string[];
  dealer_ids: string[];
  watchlist_id: string | null;
  started_at: string | null;
  updated_at: string | null;
}

export interface CatalogScript {
  symbol: string;
  display_name: string;
  product_type: string;
  buy_rate: number | null;
  sell_rate: number | null;
  purity: string | null;
  weight: string | null;
}

export interface CatalogDealer {
  dealer_id: string;
  display_name: string;
  city: string | null;
  logo_url: string | null;
  is_popular: boolean;
  scripts: CatalogScript[];
  script_count: number;
}

export interface CatalogCommodity {
  name: string;
  dealers: CatalogDealer[];
  dealer_count: number;
}

export interface CatalogResponse {
  commodities: CatalogCommodity[];
  total_dealers: number;
}

export interface CreateWatchlistResponse {
  watchlist_id: string;
  scripts_added: number;
  preview_scripts: Array<{
    dealer_name: string;
    script_name: string;
    display_name: string;
    product_type: string;
    buy_rate: number | null;
    sell_rate: number | null;
  }>;
}

export interface PreviewTimerStatus {
  elapsed_seconds: number;
  remaining_seconds: number;
  paused: boolean;
  expired: boolean;
}
