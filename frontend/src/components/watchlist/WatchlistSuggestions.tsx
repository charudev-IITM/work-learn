import { useState, useEffect, useCallback } from 'react';
import { authenticatedApi } from '../../services/auth';
import { SuggestionCard } from './SuggestionCard';
import { useWatchlist } from '../../contexts/WatchlistContext';
import type { WatchlistSuggestion, WatchlistSuggestionsResponse } from '@comp-intel/shared/types/watchlist';

interface WatchlistSuggestionsProps {
  watchlistId: string;
}

const DISMISSED_KEY_PREFIX = 'suggestions:dismissed:';
const STOPPED_KEY_PREFIX = 'suggestions:stopped:';

function getDismissedSet(watchlistId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${DISMISSED_KEY_PREFIX}${watchlistId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addDismissed(watchlistId: string, key: string) {
  const set = getDismissedSet(watchlistId);
  set.add(key);
  try {
    localStorage.setItem(`${DISMISSED_KEY_PREFIX}${watchlistId}`, JSON.stringify([...set]));
  } catch {}
}

function isStopped(watchlistId: string): boolean {
  try {
    return localStorage.getItem(`${STOPPED_KEY_PREFIX}${watchlistId}`) === '1';
  } catch {
    return false;
  }
}

function setStopped(watchlistId: string) {
  try {
    localStorage.setItem(`${STOPPED_KEY_PREFIX}${watchlistId}`, '1');
  } catch {}
}

function suggestionKey(s: WatchlistSuggestion): string {
  return `${s.dealer_id}:${s.script_name}`;
}

export function WatchlistSuggestions({ watchlistId }: WatchlistSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<WatchlistSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopped, setStoppedState] = useState(() => isStopped(watchlistId));
  const { addScriptToWatchlist } = useWatchlist();

  const fetchSuggestions = useCallback(async () => {
    if (isStopped(watchlistId) || getDismissedSet(watchlistId).size >= 8) {
      setLoading(false);
      return;
    }
    try {
      const res = await authenticatedApi.get<WatchlistSuggestionsResponse>(
        `/api/onboarding/watchlist-suggestions?watchlist_id=${watchlistId}`
      );
      const dismissed = getDismissedSet(watchlistId);
      const filtered = (res.data.suggestions || []).filter(
        s => !dismissed.has(suggestionKey(s))
      );
      setSuggestions(filtered);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [watchlistId]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleAccept = useCallback(async (s: WatchlistSuggestion) => {
    // Advance to next suggestion
    setSuggestions(prev => prev.filter(x => suggestionKey(x) !== suggestionKey(s)));

    try {
      await addScriptToWatchlist(watchlistId, {
        dealerName: s.dealer_id,
        scriptName: s.script_name,
        scriptDisplayName: s.script_display_name,
        productType: s.canonical_type.split('_')[0] || 'Gold',
        originalRates: {
          buy: s.buy_rate ?? undefined,
          sell: s.sell_rate ?? undefined,
        },
      });
    } catch {
      fetchSuggestions();
    }
  }, [watchlistId, addScriptToWatchlist, fetchSuggestions]);

  const handleDismiss = useCallback((s: WatchlistSuggestion) => {
    addDismissed(watchlistId, suggestionKey(s));
    setSuggestions(prev => prev.filter(x => suggestionKey(x) !== suggestionKey(s)));
  }, [watchlistId]);

  const handleStopSuggesting = useCallback(() => {
    setStopped(watchlistId);
    setStoppedState(true);
    setSuggestions([]);
  }, [watchlistId]);

  if (loading || stopped || suggestions.length === 0) return null;

  // Show only the first suggestion
  const current = suggestions[0];

  return (
    <SuggestionCard
      key={suggestionKey(current)}
      suggestion={current}
      onAccept={handleAccept}
      onDismiss={handleDismiss}
      onStopSuggesting={handleStopSuggesting}
    />
  );
}
