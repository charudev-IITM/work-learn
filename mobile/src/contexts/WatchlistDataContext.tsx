import React, { createContext, useContext, useCallback } from 'react';
import { useWatchlistData } from '../hooks/useWatchlistData';
import { useWebSocketWithBackoff } from '../hooks/useWebSocketWithBackoff';
import { useAuth } from './AuthContext';
import {
  updateCompetitorRates,
  updateCompetitorRatesDiff,
  refreshCompetitorTimestamps,
} from '@comp-intel/shared/stores/rateStore';
import type { Competitor } from '../hooks/useWatchlistData';

interface WatchlistDataContextType {
  competitors: Competitor[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  isConnected: boolean;
}

const WatchlistDataContext = createContext<WatchlistDataContextType | null>(null);

export function WatchlistDataProvider({ children }: { children: React.ReactNode }) {
  const { competitors, loading, error, refetch } = useWatchlistData();
  const { isAuthenticated } = useAuth();

  const handleWebSocketMessage = useCallback((data: any) => {
    if (data.type === 'rate_update' || data.type === 'rate_update_full') {
      updateCompetitorRates(data.competitor, data.rates);
    } else if (data.type === 'rate_update_diff') {
      updateCompetitorRatesDiff(data.competitor, data.changes, data.timestamp);
    } else if (data.type === 'heartbeat') {
      refreshCompetitorTimestamps(data.competitor, data.timestamp);
    }
  }, []);

  const { isConnected } = useWebSocketWithBackoff(handleWebSocketMessage, isAuthenticated);

  return (
    <WatchlistDataContext.Provider value={{ competitors, loading, error, refetch, isConnected }}>
      {children}
    </WatchlistDataContext.Provider>
  );
}

export function useWatchlistDataContext() {
  const context = useContext(WatchlistDataContext);
  if (!context) throw new Error('useWatchlistDataContext must be used within a WatchlistDataProvider');
  return context;
}
