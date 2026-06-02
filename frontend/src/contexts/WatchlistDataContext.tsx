import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useWatchlistData } from '../hooks/useWatchlistData';
import { useWebSocketWithBackoff } from '../hooks/useWebSocketWithBackoff';
import { usePreviewTimerContext } from './PreviewTimerContext';
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
  const { isAuthenticated, flowStep } = useAuth();
  const isPreview = flowStep === 'app_preview';

  // Read isPaused from PreviewTimerContext to gate WS
  const { isPaused } = usePreviewTimerContext();

  // Disable WS when preview is paused (saves bandwidth + server knows timer is paused)
  const wsEnabled = isAuthenticated && !(isPreview && isPaused);

  // Handle WebSocket messages — write directly to rateStore (no wrappers)
  const handleWebSocketMessage = useCallback((data: any) => {
    if (data.type === 'rate_update' || data.type === 'rate_update_full') {
      updateCompetitorRates(data.competitor, data.rates);
    } else if (data.type === 'rate_update_diff') {
      updateCompetitorRatesDiff(data.competitor, data.changes);
    } else if (data.type === 'heartbeat') {
      refreshCompetitorTimestamps(data.competitor, data.timestamp);
    }
  }, []);

  const { isConnected } = useWebSocketWithBackoff(handleWebSocketMessage, wsEnabled);

  const value = useMemo<WatchlistDataContextType>(() => ({
    competitors, loading, error, refetch, isConnected,
  }), [competitors, loading, error, refetch, isConnected]);

  return (
    <WatchlistDataContext.Provider value={value}>
      {children}
    </WatchlistDataContext.Provider>
  );
}

export const useWatchlistDataContext = () => {
  const context = useContext(WatchlistDataContext);
  if (!context) {
    throw new Error('useWatchlistDataContext must be used within a WatchlistDataProvider');
  }
  return context;
}
