import { useState, useEffect } from 'react';
import { authenticatedApi } from '../services/auth';
import { loadInitialRates } from '@comp-intel/shared/stores/rateStore';

export type { RateEntry as RateData } from '@comp-intel/shared/stores/rateStore';

export interface Competitor {
  name: string;
  display_name?: string;
  base_url?: string;
  scraper_type?: string;
  is_running?: boolean;
  scripts?: CompetitorScript[];
}

export interface CompetitorScript {
  name: string;
  product_type: string;
}

// Generate mock scripts for competitors
const generateScriptsForCompetitor = (competitorName: string): CompetitorScript[] => {
  const commonScripts = [
    { name: 'Gold 999', product_type: 'Gold' },
    { name: 'Gold 995', product_type: 'Gold' },
    { name: 'Silver 999', product_type: 'Silver' },
    { name: 'Gold Futures', product_type: 'Gold' },
    { name: 'Silver Futures', product_type: 'Silver' },
  ];

  const specialScripts: { [key: string]: CompetitorScript[] } = {
    'kjbullion': [
      { name: 'Gold Chennai T+1', product_type: 'Gold' },
      { name: 'Gold Mumbai T+1', product_type: 'Gold' },
      { name: 'Gold Bangalore T+1', product_type: 'Gold' },
    ],
    'csvbullion': [
      { name: 'IMP GOLD 999', product_type: 'Gold' },
      { name: 'SILVER 999', product_type: 'Silver' },
      { name: 'GOLD PURE', product_type: 'Gold' },
    ],
    'shivsahai': [
      { name: 'Gold CHN Pure', product_type: 'Gold' },
      { name: 'Gold CHN 999', product_type: 'Gold' },
      { name: 'Silver CHN', product_type: 'Silver' },
    ],
    'rsbl': [
      { name: 'Gold Coins 1GM', product_type: 'Gold' },
      { name: 'Gold Coins 10GM', product_type: 'Gold' },
      { name: 'Gold Bars 100GM', product_type: 'Gold' },
    ]
  };

  return [...commonScripts, ...(specialScripts[competitorName] || [])];
};

export function useWatchlistData() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current rates and load into store
  const fetchCurrentRates = async () => {
    try {
      const response = await authenticatedApi.get('/api/rates/current');
      loadInitialRates(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching rates:', err);
      setError('Failed to fetch rates');
    }
  };

  // Fetch competitors
  const fetchCompetitors = async () => {
    try {
      const response = await authenticatedApi.get('/api/competitors');
      const competitorsWithScripts = response.data.map((competitor: any) => ({
        ...competitor,
        display_name: competitor.display_name || competitor.name,
        scripts: generateScriptsForCompetitor(competitor.name),
      }));
      setCompetitors(competitorsWithScripts);
      setError(null);
    } catch (err) {
      console.error('Error fetching competitors:', err);
      setError('Failed to fetch competitors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([
        fetchCurrentRates(),
        fetchCompetitors(),
      ]);
      setLoading(false);
    };

    fetchData();

    // Refresh rates every 30 seconds as fallback
    const interval = setInterval(fetchCurrentRates, 30000);
    return () => clearInterval(interval);
  }, []);

  return {
    competitors,
    loading,
    error,
    refetch: () => {
      fetchCurrentRates();
      fetchCompetitors();
    },
  };
}
