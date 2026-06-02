import React, { createContext, useContext, useReducer, useEffect, useCallback, useState, useMemo } from 'react';
import {
  Watchlist,
  WatchlistScript,
  ViewMode,
  SortMode,
  LayoutMode
} from '@comp-intel/shared/types/watchlist';

// React context contracts — kept in frontend, not shared, because they define
// UI-layer concerns (swipe direction, search state) specific to the web app.
interface WatchlistState {
  watchlists: Watchlist[];
  currentWatchlistId: string;
  viewMode: ViewMode;
  sortMode: SortMode;
  layoutMode: LayoutMode;
  cityFilter: string | null;
  isSearchOpen: boolean;
  searchTerm: string;
  referenceScriptId?: string;
  differenceType: 'buy' | 'sell';
}

interface WatchlistActions {
  createWatchlist: (name?: string) => void;
  deleteWatchlist: (id: string) => void;
  renameWatchlist: (id: string, name: string) => void;
  setCurrentWatchlist: (id: string) => void;
  addScriptToWatchlist: (watchlistId: string, script: Omit<WatchlistScript, 'id' | 'addedAt'>) => void;
  removeScriptFromWatchlist: (watchlistId: string, scriptId: string) => void;
  updateScriptMultiplier: (watchlistId: string, scriptId: string, multiplier: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setSortMode: (mode: SortMode) => void;
  setSearchOpen: (open: boolean) => void;
  setSearchTerm: (term: string) => void;
  swipeToWatchlist: (direction: 'left' | 'right') => void;
  setReferenceScript: (scriptId?: string) => void;
  setDifferenceType: (type: 'buy' | 'sell') => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setCityFilter: (city: string | null) => void;
}
import { useAuth } from './AuthContext';
import watchlistService, { convertApiScript } from '@comp-intel/shared/services/watchlist';

// Extended state interface to include async operations
interface ExtendedWatchlistState extends WatchlistState {
  isLoading: boolean;
  error: string | null;
  hasMigratedFromLocalStorage: boolean;
}

interface ExtendedWatchlistActions extends WatchlistActions {
  refreshWatchlists: () => Promise<void>;
  clearError: () => void;
}

interface WatchlistContextType extends ExtendedWatchlistState, ExtendedWatchlistActions {}

const WatchlistContext = createContext<WatchlistContextType | null>(null);

// Action types (extended with async actions)
type WatchlistAction = 
  | { type: 'SET_LOADING'; payload: { loading: boolean } }
  | { type: 'SET_ERROR'; payload: { error: string | null } }
  | { type: 'SET_WATCHLISTS_DATA'; payload: { watchlists: Watchlist[]; settings: any } }
  | { type: 'ADD_WATCHLIST'; payload: { watchlist: Watchlist } }
  | { type: 'UPDATE_WATCHLIST'; payload: { watchlist: Watchlist } }
  | { type: 'REMOVE_WATCHLIST'; payload: { id: string } }
  | { type: 'ADD_SCRIPT_TO_WATCHLIST'; payload: { watchlistId: string; script: WatchlistScript } }
  | { type: 'REMOVE_SCRIPT_FROM_WATCHLIST'; payload: { watchlistId: string; scriptId: string } }
  | { type: 'UPDATE_SCRIPT_IN_WATCHLIST'; payload: { watchlistId: string; script: WatchlistScript } }
  | { type: 'REORDER_SCRIPTS_IN_WATCHLIST'; payload: { watchlistId: string; scripts: WatchlistScript[] } }
  | { type: 'SET_CURRENT_WATCHLIST'; payload: { id: string } }
  | { type: 'SET_VIEW_MODE'; payload: { mode: ViewMode } }
  | { type: 'SET_SORT_MODE'; payload: { mode: SortMode } }
  | { type: 'SET_SEARCH_OPEN'; payload: { open: boolean } }
  | { type: 'SET_SEARCH_TERM'; payload: { term: string } }
  | { type: 'SET_REFERENCE_SCRIPT'; payload: { scriptId?: string } }
  | { type: 'SET_DIFFERENCE_TYPE'; payload: { type: 'buy' | 'sell' } }
  | { type: 'SET_LAYOUT_MODE'; payload: { mode: LayoutMode } }
  | { type: 'SET_CITY_FILTER'; payload: { city: string | null } }
  | { type: 'SET_MIGRATION_COMPLETE'; payload: { migrated: boolean } };

// Initial state
const initialState: ExtendedWatchlistState = {
  watchlists: [],
  currentWatchlistId: '',
  viewMode: 'sell',
  sortMode: 'rate-desc',
  isSearchOpen: false,
  searchTerm: '',
  referenceScriptId: undefined,
  differenceType: 'buy',
  layoutMode: 'compact',
  cityFilter: null,
  isLoading: true,
  error: null,
  hasMigratedFromLocalStorage: false,
};

// Utility to convert API watchlist format to frontend format
const convertApiWatchlistToFrontend = (apiWatchlist: any): Watchlist => ({
  id: apiWatchlist.id,
  name: apiWatchlist.name,
  scripts: apiWatchlist.scripts.map(convertApiScript),
  createdAt: apiWatchlist.created_at,
  updatedAt: apiWatchlist.updated_at,
});

// Reducer
function watchlistReducer(state: ExtendedWatchlistState, action: WatchlistAction): ExtendedWatchlistState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload.loading };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload.error, isLoading: false };
    
    case 'SET_WATCHLISTS_DATA':
      return {
        ...state,
        watchlists: action.payload.watchlists,
        currentWatchlistId: action.payload.settings.current_watchlist_id || action.payload.watchlists[0]?.id || '',
        viewMode: action.payload.settings.view_mode || 'sell',
        sortMode: action.payload.settings.sort_mode || 'rate-desc',
        referenceScriptId: action.payload.settings.reference_script_id,
        differenceType: action.payload.settings.difference_type || 'buy',
        layoutMode: action.payload.settings.layout_mode || 'compact',
        cityFilter: action.payload.settings.city_filter || null,
        isLoading: false,
        error: null,
      };
    
    case 'ADD_WATCHLIST':
      return {
        ...state,
        watchlists: [...state.watchlists, action.payload.watchlist],
      };
    
    case 'UPDATE_WATCHLIST':
      return {
        ...state,
        watchlists: state.watchlists.map(w => 
          w.id === action.payload.watchlist.id ? action.payload.watchlist : w
        ),
      };
    
    case 'REMOVE_WATCHLIST':
      const filteredWatchlists = state.watchlists.filter(w => w.id !== action.payload.id);
      return {
        ...state,
        watchlists: filteredWatchlists,
        currentWatchlistId: state.currentWatchlistId === action.payload.id 
          ? (filteredWatchlists[0]?.id || '') 
          : state.currentWatchlistId,
      };
    
    case 'ADD_SCRIPT_TO_WATCHLIST':
      return {
        ...state,
        watchlists: state.watchlists.map(w => 
          w.id === action.payload.watchlistId
            ? { 
                ...w, 
                scripts: [...w.scripts, action.payload.script],
                updatedAt: new Date().toISOString(),
              }
            : w
        ),
      };
    
    case 'REMOVE_SCRIPT_FROM_WATCHLIST':
      return {
        ...state,
        watchlists: state.watchlists.map(w => 
          w.id === action.payload.watchlistId
            ? { 
                ...w, 
                scripts: w.scripts.filter(s => s.id !== action.payload.scriptId),
                updatedAt: new Date().toISOString(),
              }
            : w
        ),
        referenceScriptId: state.referenceScriptId === action.payload.scriptId 
          ? undefined 
          : state.referenceScriptId,
      };
    
    case 'UPDATE_SCRIPT_IN_WATCHLIST':
      return {
        ...state,
        watchlists: state.watchlists.map(w => 
          w.id === action.payload.watchlistId
            ? { 
                ...w, 
                scripts: w.scripts.map(s => 
                  s.id === action.payload.script.id ? action.payload.script : s
                ),
                updatedAt: new Date().toISOString(),
              }
            : w
        ),
      };
    
    case 'REORDER_SCRIPTS_IN_WATCHLIST':
      return {
        ...state,
        watchlists: state.watchlists.map(w => 
          w.id === action.payload.watchlistId
            ? { 
                ...w, 
                scripts: action.payload.scripts,
                updatedAt: new Date().toISOString(),
              }
            : w
        ),
      };
    
    case 'SET_CURRENT_WATCHLIST':
      return { ...state, currentWatchlistId: action.payload.id };
    
    case 'SET_VIEW_MODE':
      const newState = { ...state, viewMode: action.payload.mode };
      if (action.payload.mode !== 'differences') {
        newState.referenceScriptId = undefined;
      }
      return newState;
    
    case 'SET_SORT_MODE':
      const { mode } = action.payload;
      const { viewMode } = state;
      
      if ((mode === 'difference-asc' || mode === 'difference-desc') && viewMode !== 'differences') {
        return state;
      }
      
      return { ...state, sortMode: mode };
    
    case 'SET_SEARCH_OPEN':
      return {
        ...state,
        isSearchOpen: action.payload.open,
        searchTerm: action.payload.open ? state.searchTerm : '',
      };
    
    case 'SET_SEARCH_TERM':
      return { ...state, searchTerm: action.payload.term };
    
    case 'SET_REFERENCE_SCRIPT':
      return { ...state, referenceScriptId: action.payload.scriptId };
    
    case 'SET_DIFFERENCE_TYPE':
      return { ...state, differenceType: action.payload.type };

    case 'SET_LAYOUT_MODE':
      return { ...state, layoutMode: action.payload.mode };

    case 'SET_CITY_FILTER':
      return { ...state, cityFilter: action.payload.city };

    case 'SET_MIGRATION_COMPLETE':
      return { ...state, hasMigratedFromLocalStorage: action.payload.migrated };
    
    default:
      return state;
  }
}

// Migration utilities
const getLocalStorageKey = (userId: string, key: string) => `comp-intel-${userId}-${key}`;

const migrateFromLocalStorage = async (userId: string): Promise<boolean> => {
  try {
    const watchlistsData = localStorage.getItem(getLocalStorageKey(userId, 'watchlists'));
    const settingsData = localStorage.getItem(getLocalStorageKey(userId, 'settings'));
    
    if (!watchlistsData) {
      return false; // No data to migrate
    }
    
    const watchlists: Watchlist[] = JSON.parse(watchlistsData);
    const settings = settingsData ? JSON.parse(settingsData) : {};
    
    // Check if any watchlists have scripts to migrate
    const hasScriptsToMigrate = watchlists.some(w => w.scripts && w.scripts.length > 0);
    if (!hasScriptsToMigrate && watchlists.length <= 5) {
      return false; // Default watchlists only, no need to migrate
    }
    
    console.log(`Migrating ${watchlists.length} watchlists from localStorage...`);
    
    // Get current server watchlists to avoid duplicates
    const serverData = await watchlistService.getUserWatchlists();
    const serverWatchlistNames = new Set(serverData.watchlists.map(w => w.name));
    
    // Migrate watchlists that don't already exist on server
    for (const watchlist of watchlists) {
      if (serverWatchlistNames.has(watchlist.name)) {
        console.log(`Skipping watchlist "${watchlist.name}" - already exists on server`);
        continue;
      }
      
      try {
        // Create watchlist if it has scripts or is not a default name
        const isDefaultName = /^Watchlist [1-5]$/.test(watchlist.name);
        if (watchlist.scripts.length > 0 || !isDefaultName) {
          const createdWatchlist = await watchlistService.createWatchlist({ 
            name: watchlist.name 
          });
          
          // Add scripts to the watchlist
          for (const script of watchlist.scripts) {
            try {
              await watchlistService.addScriptToWatchlist(createdWatchlist.id, {
                dealerName: script.dealerName,
                scriptName: script.scriptName,
                scriptDisplayName: script.scriptDisplayName,
                productType: script.productType,
                multiplier: script.multiplier,
                originalBuyRate: script.originalRates?.buy,
                originalSellRate: script.originalRates?.sell,
                originalRatesTimestamp: script.originalRates?.timestamp
              });
            } catch (scriptError) {
              console.warn(`Failed to migrate script ${script.scriptName}:`, scriptError);
            }
          }
          
          console.log(`Migrated watchlist "${watchlist.name}" with ${watchlist.scripts.length} scripts`);
        }
      } catch (watchlistError) {
        console.warn(`Failed to migrate watchlist "${watchlist.name}":`, watchlistError);
      }
    }
    
    // Update settings
    try {
      await watchlistService.updateUserSettings({
        viewMode: settings.viewMode || 'sell',
        sortMode: settings.sortMode || 'rate-desc',
        referenceScriptId: settings.referenceScriptId,
        differenceType: settings.differenceType || 'buy'
      });
    } catch (settingsError) {
      console.warn('Failed to migrate settings:', settingsError);
    }
    
    // Clear localStorage data after successful migration
    localStorage.removeItem(getLocalStorageKey(userId, 'watchlists'));
    localStorage.removeItem(getLocalStorageKey(userId, 'current-watchlist'));
    localStorage.removeItem(getLocalStorageKey(userId, 'settings'));
    
    console.log('Successfully migrated watchlists from localStorage to database');
    return true;
    
  } catch (error) {
    console.error('Failed to migrate from localStorage:', error);
    return false;
  }
};

// Provider component
export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(watchlistReducer, initialState);
  const [isInitialized, setIsInitialized] = useState(false);
  const { user, isAuthenticated } = useAuth();
  
  // Load data from API on mount
  const loadWatchlists = useCallback(async (shouldMigrate = true) => {
    if (!user || !isAuthenticated) {
      dispatch({ type: 'SET_ERROR', payload: { error: 'User not authenticated' } });
      return;
    }
    
    try {
      dispatch({ type: 'SET_LOADING', payload: { loading: true } });
      
      // Attempt migration first if needed
      let migrated = false;
      if (shouldMigrate && !state.hasMigratedFromLocalStorage) {
        migrated = await migrateFromLocalStorage(user.id);
        dispatch({ type: 'SET_MIGRATION_COMPLETE', payload: { migrated: true } });
      }
      
      // Load watchlists from API
      const data = await watchlistService.getUserWatchlists();
      const convertedWatchlists = data.watchlists.map(convertApiWatchlistToFrontend);
      
      dispatch({
        type: 'SET_WATCHLISTS_DATA',
        payload: {
          watchlists: convertedWatchlists,
          settings: data.settings
        }
      });
      
      if (migrated) {
        console.log('Migration completed successfully');
      }
      
    } catch (error) {
      console.error('Failed to load watchlists:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: { error: error instanceof Error ? error.message : 'Failed to load watchlists' } 
      });
    }
  }, [user, isAuthenticated, state.hasMigratedFromLocalStorage]);
  
  // Initialize on user change
  useEffect(() => {
    if (user && isAuthenticated && !isInitialized) {
      loadWatchlists(true);
      setIsInitialized(true);
    } else if (!user || !isAuthenticated) {
      setIsInitialized(false);
      dispatch({
        type: 'SET_WATCHLISTS_DATA',
        payload: { watchlists: [], settings: {} }
      });
    }
  }, [user, isAuthenticated, loadWatchlists, isInitialized]);

  // Listen for cross-context watchlist refresh events (e.g. from SONA AI confirm)
  useEffect(() => {
    const handler = () => { loadWatchlists(false); };
    window.addEventListener('watchlist:refresh', handler);
    return () => window.removeEventListener('watchlist:refresh', handler);
  }, [loadWatchlists]);

  // Action creators with API calls
  const createWatchlist = useCallback(async (name?: string) => {
    if (!name) return;
    
    try {
      dispatch({ type: 'SET_LOADING', payload: { loading: true } });
      const watchlist = await watchlistService.createWatchlist({ name });
      const convertedWatchlist = convertApiWatchlistToFrontend(watchlist);
      dispatch({ type: 'ADD_WATCHLIST', payload: { watchlist: convertedWatchlist } });
      dispatch({ type: 'SET_LOADING', payload: { loading: false } });
    } catch (error) {
      console.error('Failed to create watchlist:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: { error: error instanceof Error ? error.message : 'Failed to create watchlist' } 
      });
    }
  }, []);
  
  const deleteWatchlist = useCallback(async (id: string) => {
    try {
      await watchlistService.deleteWatchlist(id);
      dispatch({ type: 'REMOVE_WATCHLIST', payload: { id } });
    } catch (error) {
      console.error('Failed to delete watchlist:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: { error: error instanceof Error ? error.message : 'Failed to delete watchlist' } 
      });
    }
  }, []);
  
  const renameWatchlist = useCallback(async (id: string, name: string) => {
    try {
      const watchlist = await watchlistService.updateWatchlist(id, { name });
      const convertedWatchlist = convertApiWatchlistToFrontend(watchlist);
      dispatch({ type: 'UPDATE_WATCHLIST', payload: { watchlist: convertedWatchlist } });
    } catch (error) {
      console.error('Failed to rename watchlist:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: { error: error instanceof Error ? error.message : 'Failed to rename watchlist' } 
      });
    }
  }, []);
  
  const setCurrentWatchlist = useCallback(async (id: string) => {
    try {
      await watchlistService.updateUserSettings({ currentWatchlistId: id });
      dispatch({ type: 'SET_CURRENT_WATCHLIST', payload: { id } });
    } catch (error) {
      console.error('Failed to set current watchlist:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: { error: error instanceof Error ? error.message : 'Failed to set current watchlist' } 
      });
    }
  }, []);
  
  const addScriptToWatchlist = useCallback(async (watchlistId: string, script: Omit<WatchlistScript, 'id' | 'addedAt'>) => {
    try {
      const addedScript = await watchlistService.addScriptToWatchlist(watchlistId, {
        dealerName: script.dealerName,
        scriptName: script.scriptName,
        scriptDisplayName: script.scriptDisplayName,
        productType: script.productType,
        multiplier: script.multiplier,
        originalBuyRate: script.originalRates?.buy,
        originalSellRate: script.originalRates?.sell,
        originalRatesTimestamp: script.originalRates?.timestamp
      });
      dispatch({
        type: 'ADD_SCRIPT_TO_WATCHLIST',
        payload: { watchlistId, script: addedScript }
      });
    } catch (error) {
      console.error('Failed to add script to watchlist:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: { error: error instanceof Error ? error.message : 'Failed to add script to watchlist' }
      });
      throw error;
    }
  }, []);
  
  const removeScriptFromWatchlist = useCallback(async (watchlistId: string, scriptId: string) => {
    try {
      await watchlistService.removeScriptFromWatchlist(watchlistId, scriptId);
      dispatch({ 
        type: 'REMOVE_SCRIPT_FROM_WATCHLIST', 
        payload: { watchlistId, scriptId } 
      });
    } catch (error) {
      console.error('Failed to remove script from watchlist:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: { error: error instanceof Error ? error.message : 'Failed to remove script from watchlist' } 
      });
    }
  }, []);
  
  const updateScriptMultiplier = useCallback(async (watchlistId: string, scriptId: string, multiplier: number) => {
    try {
      const updatedScript = await watchlistService.updateScriptMultiplier(watchlistId, scriptId, multiplier);
      dispatch({ 
        type: 'UPDATE_SCRIPT_IN_WATCHLIST', 
        payload: { watchlistId, script: updatedScript } 
      });
    } catch (error) {
      console.error('Failed to update script multiplier:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: { error: error instanceof Error ? error.message : 'Failed to update script multiplier' } 
      });
    }
  }, []);
  
  const setViewMode = useCallback(async (mode: ViewMode) => {
    try {
      await watchlistService.updateUserSettings({ viewMode: mode });
      dispatch({ type: 'SET_VIEW_MODE', payload: { mode } });
    } catch (error) {
      console.error('Failed to set view mode:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: { error: error instanceof Error ? error.message : 'Failed to set view mode' } 
      });
    }
  }, []);
  
  const setSortMode = useCallback(async (mode: SortMode) => {
    try {
      await watchlistService.updateUserSettings({ sortMode: mode });
      dispatch({ type: 'SET_SORT_MODE', payload: { mode } });
    } catch (error) {
      console.error('Failed to set sort mode:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: { error: error instanceof Error ? error.message : 'Failed to set sort mode' } 
      });
    }
  }, []);
  
  const setReferenceScript = useCallback(async (scriptId?: string) => {
    try {
      await watchlistService.updateUserSettings({ referenceScriptId: scriptId });
      dispatch({ type: 'SET_REFERENCE_SCRIPT', payload: { scriptId } });
    } catch (error) {
      console.error('Failed to set reference script:', error);
      dispatch({ 
        type: 'SET_ERROR', 
        payload: { error: error instanceof Error ? error.message : 'Failed to set reference script' } 
      });
    }
  }, []);
  
  const setDifferenceType = useCallback(async (type: 'buy' | 'sell') => {
    try {
      await watchlistService.updateUserSettings({ differenceType: type });
      dispatch({ type: 'SET_DIFFERENCE_TYPE', payload: { type } });
    } catch (error) {
      console.error('Failed to set difference type:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: { error: error instanceof Error ? error.message : 'Failed to set difference type' }
      });
    }
  }, []);

  const setLayoutMode = useCallback(async (mode: LayoutMode) => {
    try {
      await watchlistService.updateUserSettings({ layoutMode: mode });
      dispatch({ type: 'SET_LAYOUT_MODE', payload: { mode } });
    } catch (error) {
      console.error('Failed to set layout mode:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: { error: error instanceof Error ? error.message : 'Failed to set layout mode' }
      });
    }
  }, []);

  const setCityFilter = useCallback(async (city: string | null) => {
    try {
      await watchlistService.updateUserSettings({ cityFilter: city ?? '' });
      dispatch({ type: 'SET_CITY_FILTER', payload: { city } });
    } catch (error) {
      console.error('Failed to set city filter:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: { error: error instanceof Error ? error.message : 'Failed to set city filter' }
      });
    }
  }, []);
  
  // Local-only actions (no API calls needed)
  const setSearchOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_SEARCH_OPEN', payload: { open } });
  }, []);
  
  const setSearchTerm = useCallback((term: string) => {
    dispatch({ type: 'SET_SEARCH_TERM', payload: { term } });
  }, []);
  
  const swipeToWatchlist = useCallback((direction: 'left' | 'right') => {
    const currentIndex = state.watchlists.findIndex(w => w.id === state.currentWatchlistId);
    let newIndex;
    
    if (direction === 'right') {
      newIndex = currentIndex === 0 ? state.watchlists.length - 1 : currentIndex - 1;
    } else {
      newIndex = currentIndex === state.watchlists.length - 1 ? 0 : currentIndex + 1;
    }
    
    const newWatchlistId = state.watchlists[newIndex]?.id;
    if (newWatchlistId) {
      setCurrentWatchlist(newWatchlistId);
    }
  }, [state.watchlists, state.currentWatchlistId, setCurrentWatchlist]);
  
  // Utility actions
  const refreshWatchlists = useCallback(async () => {
    await loadWatchlists(false); // Don't migrate on refresh
  }, [loadWatchlists]);
  
  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: { error: null } });
  }, []);
  
  const contextValue = useMemo<WatchlistContextType>(() => ({
    ...state,
    createWatchlist,
    deleteWatchlist,
    renameWatchlist,
    setCurrentWatchlist,
    addScriptToWatchlist,
    removeScriptFromWatchlist,
    updateScriptMultiplier,
    setViewMode,
    setSortMode,
    setSearchOpen,
    setSearchTerm,
    swipeToWatchlist,
    setReferenceScript,
    setDifferenceType,
    setLayoutMode,
    setCityFilter,
    refreshWatchlists,
    clearError,
  }), [state, createWatchlist, deleteWatchlist, renameWatchlist, setCurrentWatchlist,
    addScriptToWatchlist, removeScriptFromWatchlist, updateScriptMultiplier,
    setViewMode, setSortMode, setSearchOpen, setSearchTerm, swipeToWatchlist,
    setReferenceScript, setDifferenceType, setLayoutMode, setCityFilter,
    refreshWatchlists, clearError]);

  return (
    <WatchlistContext.Provider value={contextValue}>
      {children}
    </WatchlistContext.Provider>
  );
}

// Hook
export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
}