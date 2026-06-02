import { useState, useEffect, useCallback } from 'react';
import { getApiClient } from '@comp-intel/shared/services/apiClient';
import { loadInitialRates } from '@comp-intel/shared/stores/rateStore';

export interface Competitor {
  name: string;
  display_name?: string;
  base_url?: string;
  scraper_type?: string;
  is_running?: boolean;
}

export function useWatchlistData() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentRates = useCallback(async () => {
    try {
      const api = getApiClient();
      const response = await api.get('/api/rates/current');
      loadInitialRates(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching rates:', err);
      setError('Failed to fetch rates');
    }
  }, []);

  const fetchCompetitors = useCallback(async () => {
    try {
      const api = getApiClient();
      const response = await api.get('/api/competitors');
      const data = response.data.map((c: any) => ({
        ...c,
        display_name: c.display_name || c.name,
      }));
      setCompetitors(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching competitors:', err);
      setError('Failed to fetch competitors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchCurrentRates(), fetchCompetitors()]);
      setLoading(false);
    })();

    const interval = setInterval(fetchCurrentRates, 30000);
    return () => clearInterval(interval);
  }, [fetchCurrentRates, fetchCompetitors]);

  return {
    competitors,
    loading,
    error,
    refetch: () => { fetchCurrentRates(); fetchCompetitors(); },
  };
}
