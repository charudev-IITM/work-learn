import { getApiClient } from './apiClient';
import {
  Watchlist,
  WatchlistScript,
  WatchlistCreateRequest,
  WatchlistUpdateRequest,
  WatchlistScriptCreateRequest,
  WatchlistsResponse,
  UserSettings,
  UserSettingsUpdateRequest,
} from '../types/watchlist';

// Convert snake_case API response to camelCase frontend format
export function convertApiScript(apiScript: any): WatchlistScript {
  return {
    id: apiScript.id,
    dealerName: apiScript.dealer_name,
    scriptName: apiScript.script_name,
    scriptDisplayName: apiScript.script_display_name,
    productType: apiScript.product_type,
    multiplier: apiScript.multiplier,
    addedAt: apiScript.added_at,
    originalRates: {
      buy: apiScript.original_buy_rate,
      sell: apiScript.original_sell_rate,
      timestamp: apiScript.original_rates_timestamp
    }
  };
}

export const watchlistService = {
  /**
   * Get all watchlists and user settings
   */
  async getUserWatchlists(): Promise<WatchlistsResponse> {
    try {
      const api = getApiClient();
      const response = await api.get('/api/watchlists');
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch watchlists:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to fetch watchlists');
    }
  },

  /**
   * Create a new watchlist
   */
  async createWatchlist(data: WatchlistCreateRequest): Promise<Watchlist> {
    try {
      const api = getApiClient();
      const response = await api.post('/api/watchlists', {
        name: data.name
      });
      return response.data;
    } catch (error: any) {
      console.error('Failed to create watchlist:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to create watchlist');
    }
  },

  /**
   * Update watchlist details
   */
  async updateWatchlist(watchlistId: string, data: WatchlistUpdateRequest): Promise<Watchlist> {
    try {
      const api = getApiClient();
      const response = await api.patch(`/api/watchlists/${watchlistId}`, data);
      return response.data;
    } catch (error: any) {
      console.error('Failed to update watchlist:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to update watchlist');
    }
  },

  /**
   * Delete a watchlist
   */
  async deleteWatchlist(watchlistId: string): Promise<void> {
    try {
      const api = getApiClient();
      await api.delete(`/api/watchlists/${watchlistId}`);
    } catch (error: any) {
      console.error('Failed to delete watchlist:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to delete watchlist');
    }
  },

  /**
   * Add a script to a watchlist
   */
  async addScriptToWatchlist(watchlistId: string, scriptData: WatchlistScriptCreateRequest): Promise<WatchlistScript> {
    try {
      const api = getApiClient();
      const response = await api.post(`/api/watchlists/${watchlistId}/scripts`, {
        dealer_name: scriptData.dealerName,
        script_name: scriptData.scriptName,
        script_display_name: scriptData.scriptDisplayName,
        product_type: scriptData.productType,
        multiplier: scriptData.multiplier,
        original_buy_rate: scriptData.originalBuyRate,
        original_sell_rate: scriptData.originalSellRate,
        original_rates_timestamp: scriptData.originalRatesTimestamp
      });

      return convertApiScript(response.data);
    } catch (error: any) {
      console.error('Failed to add script to watchlist:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to add script to watchlist');
    }
  },

  /**
   * Remove a script from a watchlist
   */
  async removeScriptFromWatchlist(watchlistId: string, scriptId: string): Promise<void> {
    try {
      const api = getApiClient();
      await api.delete(`/api/watchlists/${watchlistId}/scripts/${scriptId}`);
    } catch (error: any) {
      console.error('Failed to remove script from watchlist:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to remove script from watchlist');
    }
  },

  /**
   * Update script multiplier
   */
  async updateScriptMultiplier(watchlistId: string, scriptId: string, multiplier: number): Promise<WatchlistScript> {
    try {
      const api = getApiClient();
      const response = await api.patch(`/api/watchlists/${watchlistId}/scripts/${scriptId}/multiplier?multiplier=${multiplier}`);

      return convertApiScript(response.data);
    } catch (error: any) {
      console.error('Failed to update script multiplier:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to update script multiplier');
    }
  },

  /**
   * Reorder scripts in a watchlist
   */
  async reorderScripts(watchlistId: string, scriptIds: string[]): Promise<WatchlistScript[]> {
    try {
      const api = getApiClient();
      const response = await api.put(`/api/watchlists/${watchlistId}/scripts/reorder`, {
        script_ids: scriptIds
      });

      return response.data.map(convertApiScript);
    } catch (error: any) {
      console.error('Failed to reorder scripts:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to reorder scripts');
    }
  },

  /**
   * Get user settings
   */
  async getUserSettings(): Promise<UserSettings> {
    try {
      const api = getApiClient();
      const response = await api.get('/api/watchlists/settings');
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch user settings:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to fetch user settings');
    }
  },

  /**
   * Update user settings
   */
  async updateUserSettings(data: UserSettingsUpdateRequest): Promise<UserSettings> {
    try {
      const api = getApiClient();
      const response = await api.patch('/api/watchlists/settings', {
        current_watchlist_id: data.currentWatchlistId,
        view_mode: data.viewMode,
        sort_mode: data.sortMode,
        reference_script_id: data.referenceScriptId,
        difference_type: data.differenceType,
        layout_mode: data.layoutMode,
        city_filter: data.cityFilter,
      });
      return response.data;
    } catch (error: any) {
      console.error('Failed to update user settings:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to update user settings');
    }
  },

  /**
   * Add multiple scripts to a watchlist at once
   */
  async addMultipleScriptsToWatchlist(watchlistId: string, scripts: WatchlistScriptCreateRequest[]): Promise<WatchlistScript[]> {
    try {
      const api = getApiClient();
      const requestData = scripts.map(script => ({
        dealer_name: script.dealerName,
        script_name: script.scriptName,
        script_display_name: script.scriptDisplayName,
        product_type: script.productType,
        multiplier: script.multiplier,
        original_buy_rate: script.originalBuyRate,
        original_sell_rate: script.originalSellRate,
        original_rates_timestamp: script.originalRatesTimestamp
      }));

      const response = await api.post(`/api/watchlists/${watchlistId}/scripts/bulk`, requestData);

      return response.data.map(convertApiScript);
    } catch (error: any) {
      console.error('Failed to add multiple scripts to watchlist:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to add scripts to watchlist');
    }
  },

  /**
   * Remove multiple scripts from a watchlist at once
   */
  async removeMultipleScriptsFromWatchlist(watchlistId: string, scriptIds: string[]): Promise<void> {
    try {
      const api = getApiClient();
      await api.delete(`/api/watchlists/${watchlistId}/scripts/bulk`, {
        data: scriptIds
      });
    } catch (error: any) {
      console.error('Failed to remove multiple scripts from watchlist:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Failed to remove scripts from watchlist');
    }
  }
};

export default watchlistService;
