import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import type {
  Watchlist,
  WatchlistScript,
  ViewMode,
  SortMode,
  LayoutMode,
} from '@comp-intel/shared/types/watchlist';
import { useAuth } from './AuthContext';
import watchlistService, { convertApiScript } from '@comp-intel/shared/services/watchlist';

interface WatchlistState {
  watchlists: Watchlist[];
  currentWatchlistId: string;
  viewMode: ViewMode;
  sortMode: SortMode;
  layoutMode: LayoutMode;
  cityFilter: string | null;
  referenceScriptId?: string;
  differenceType: 'buy' | 'sell';
  isLoading: boolean;
  error: string | null;
}

type WatchlistAction =
  | { type: 'SET_WATCHLISTS'; payload: { watchlists: Watchlist[]; settings: any } }
  | { type: 'SET_CURRENT_WATCHLIST'; payload: string }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_SORT_MODE'; payload: SortMode }
  | { type: 'SET_LAYOUT_MODE'; payload: LayoutMode }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_SCRIPT'; payload: { watchlistId: string; script: WatchlistScript } }
  | { type: 'REMOVE_SCRIPT'; payload: { watchlistId: string; scriptId: string } }
  | { type: 'ADD_WATCHLIST'; payload: Watchlist }
  | { type: 'DELETE_WATCHLIST'; payload: string };

const initialState: WatchlistState = {
  watchlists: [],
  currentWatchlistId: '',
  viewMode: 'buy',
  sortMode: 'none',
  layoutMode: 'card',
  cityFilter: null,
  differenceType: 'buy',
  isLoading: true,
  error: null,
};

function watchlistReducer(state: WatchlistState, action: WatchlistAction): WatchlistState {
  switch (action.type) {
    case 'SET_WATCHLISTS': {
      const { watchlists, settings } = action.payload;
      return {
        ...state,
        watchlists,
        currentWatchlistId: settings?.currentWatchlistId || watchlists[0]?.id || '',
        viewMode: settings?.viewMode || 'buy',
        sortMode: settings?.sortMode || 'none',
        layoutMode: settings?.layoutMode || 'card',
        cityFilter: settings?.cityFilter || null,
        referenceScriptId: settings?.referenceScriptId,
        differenceType: settings?.differenceType || 'buy',
        isLoading: false,
        error: null,
      };
    }
    case 'SET_CURRENT_WATCHLIST':
      return { ...state, currentWatchlistId: action.payload };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    case 'SET_SORT_MODE':
      return { ...state, sortMode: action.payload };
    case 'SET_LAYOUT_MODE':
      return { ...state, layoutMode: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'ADD_SCRIPT': {
      const { watchlistId, script } = action.payload;
      return {
        ...state,
        watchlists: state.watchlists.map(w =>
          w.id === watchlistId ? { ...w, scripts: [...w.scripts, script] } : w
        ),
      };
    }
    case 'REMOVE_SCRIPT': {
      const { watchlistId, scriptId } = action.payload;
      return {
        ...state,
        watchlists: state.watchlists.map(w =>
          w.id === watchlistId
            ? { ...w, scripts: w.scripts.filter(s => s.id !== scriptId) }
            : w
        ),
      };
    }
    case 'ADD_WATCHLIST':
      return { ...state, watchlists: [...state.watchlists, action.payload] };
    case 'DELETE_WATCHLIST': {
      const remaining = state.watchlists.filter(w => w.id !== action.payload);
      return {
        ...state,
        watchlists: remaining,
        currentWatchlistId: state.currentWatchlistId === action.payload
          ? remaining[0]?.id || ''
          : state.currentWatchlistId,
      };
    }
    default:
      return state;
  }
}

interface WatchlistContextType extends WatchlistState {
  currentWatchlist: Watchlist | null;
  setCurrentWatchlist: (id: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setSortMode: (mode: SortMode) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  addScript: (watchlistId: string, script: Omit<WatchlistScript, 'id' | 'addedAt'>) => Promise<void>;
  removeScript: (watchlistId: string, scriptId: string) => Promise<void>;
  createWatchlist: (name: string) => Promise<void>;
  deleteWatchlist: (id: string) => Promise<void>;
  refreshWatchlists: () => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextType | null>(null);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(watchlistReducer, initialState);
  const { isAuthenticated } = useAuth();

  const fetchWatchlists = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const data = await watchlistService.getUserWatchlists();
      const watchlists = data.watchlists.map(w => ({
        ...w,
        scripts: w.scripts.map(convertApiScript),
      }));
      dispatch({ type: 'SET_WATCHLISTS', payload: { watchlists, settings: data.settings } });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to load watchlists' });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchWatchlists();
  }, [isAuthenticated, fetchWatchlists]);

  const currentWatchlist = useMemo(
    () => state.watchlists.find(w => w.id === state.currentWatchlistId) || null,
    [state.watchlists, state.currentWatchlistId]
  );

  const setCurrentWatchlist = useCallback(async (id: string) => {
    dispatch({ type: 'SET_CURRENT_WATCHLIST', payload: id });
    watchlistService.updateUserSettings({ currentWatchlistId: id }).catch(() => {});
  }, []);

  const setViewMode = useCallback(async (mode: ViewMode) => {
    dispatch({ type: 'SET_VIEW_MODE', payload: mode });
    watchlistService.updateUserSettings({ viewMode: mode }).catch(() => {});
  }, []);

  const setSortMode = useCallback(async (mode: SortMode) => {
    dispatch({ type: 'SET_SORT_MODE', payload: mode });
    watchlistService.updateUserSettings({ sortMode: mode }).catch(() => {});
  }, []);

  const setLayoutMode = useCallback(async (mode: LayoutMode) => {
    dispatch({ type: 'SET_LAYOUT_MODE', payload: mode });
    watchlistService.updateUserSettings({ layoutMode: mode }).catch(() => {});
  }, []);

  const addScript = useCallback(async (watchlistId: string, script: Omit<WatchlistScript, 'id' | 'addedAt'>) => {
    const created = await watchlistService.addScriptToWatchlist(watchlistId, {
      dealerName: script.dealerName,
      scriptName: script.scriptName,
      scriptDisplayName: script.scriptDisplayName,
      productType: script.productType,
      multiplier: script.multiplier,
    });
    dispatch({ type: 'ADD_SCRIPT', payload: { watchlistId, script: created } });
  }, []);

  const removeScript = useCallback(async (watchlistId: string, scriptId: string) => {
    await watchlistService.removeScriptFromWatchlist(watchlistId, scriptId);
    dispatch({ type: 'REMOVE_SCRIPT', payload: { watchlistId, scriptId } });
  }, []);

  const createWatchlist = useCallback(async (name: string) => {
    const created = await watchlistService.createWatchlist({ name });
    dispatch({ type: 'ADD_WATCHLIST', payload: { ...created, scripts: [] } });
  }, []);

  const deleteWatchlist = useCallback(async (id: string) => {
    await watchlistService.deleteWatchlist(id);
    dispatch({ type: 'DELETE_WATCHLIST', payload: id });
  }, []);

  const contextValue = useMemo<WatchlistContextType>(() => ({
    ...state,
    currentWatchlist,
    setCurrentWatchlist,
    setViewMode,
    setSortMode,
    setLayoutMode,
    addScript,
    removeScript,
    createWatchlist,
    deleteWatchlist,
    refreshWatchlists: fetchWatchlists,
  }), [state, currentWatchlist, setCurrentWatchlist, setViewMode, setSortMode, setLayoutMode, addScript, removeScript, createWatchlist, deleteWatchlist, fetchWatchlists]);

  return (
    <WatchlistContext.Provider value={contextValue}>{children}</WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) throw new Error('useWatchlist must be used within a WatchlistProvider');
  return context;
}
