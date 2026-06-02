/**
 * Onboarding API service.
 * All calls use the shared API client.
 */

import { getApiClient } from './apiClient';
import type {
  OnboardingState,
  CatalogResponse,
  CreateWatchlistResponse,
} from '../types/onboarding';

export const onboardingService = {
  /** Get onboarding state for resume */
  async getState(): Promise<OnboardingState> {
    const api = getApiClient();
    const { data } = await api.get('/api/onboarding/state');
    return data;
  },

  /** Update onboarding state */
  async updateState(params: {
    step: string;
    commodities?: string[];
    dealer_ids?: string[];
  }): Promise<OnboardingState> {
    const api = getApiClient();
    const { data } = await api.put('/api/onboarding/state', params);
    return data;
  },

  /** Record an analytics event */
  async recordEvent(step: string, eventType: string, metadata?: Record<string, unknown>): Promise<void> {
    const api = getApiClient();
    await api.post('/api/onboarding/event', {
      step,
      event_type: eventType,
      metadata,
    });
  },

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

  /** Create auto-populated watchlist from selections */
  async createWatchlist(commodities: string[], dealerIds: string[]): Promise<CreateWatchlistResponse> {
    const api = getApiClient();
    const { data } = await api.post('/api/onboarding/create-watchlist', {
      commodities,
      dealer_ids: dealerIds,
    });
    return data;
  },

  /** Mark onboarding as complete */
  async complete(): Promise<void> {
    const api = getApiClient();
    await api.post('/api/onboarding/complete');
  },
};
