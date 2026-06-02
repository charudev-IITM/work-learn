import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Search, X, RefreshCw, Newspaper } from 'lucide-react';
import { useNavigation } from '../../contexts/NavigationContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/cn';
import { newsService } from '@comp-intel/shared/services/news';
import { NewsArticle, NewsFilters, NewsTagOptions } from '@comp-intel/shared/types/news';
import { NewsCard } from './NewsCard';
import { NewsFilterBar } from './NewsFilterBar';
import { LoadMoreTrigger } from './LoadMoreTrigger';
import { Skeleton } from '../ui/skeleton';

const EMPTY_FILTERS: NewsFilters = {
  commodity: null,
  topic: null,
  geography: null,
  sentiment: null,
  source: null,
};

const EMPTY_TAG_OPTIONS: NewsTagOptions = {
  commodities: [],
  topics: [],
  geographies: [],
  sentiments: [],
  sources: [],
};

export function NewsFeed() {
  const { navigate } = useNavigation();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [filters, setFilters] = useState<NewsFilters>(EMPTY_FILTERS);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [tagOptions, setTagOptions] = useState<NewsTagOptions>(EMPTY_TAG_OPTIONS);

  // Use ref for cursor to avoid stale closures in useCallback
  const cursorRef = useRef<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<NewsArticle[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const filtersRef = useRef<NewsFilters>(EMPTY_FILTERS);

  // Keep filtersRef in sync
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  // Load tag options on mount
  useEffect(() => {
    newsService.getTagOptions()
      .then(setTagOptions)
      .catch(() => {});
  }, []);

  // Fetch articles (filter mode) — reads cursor from ref, not state
  const fetchArticles = useCallback(async (reset = false) => {
    try {
      setError('');
      if (reset) {
        setLoading(true);
        cursorRef.current = null;
      } else {
        setLoadingMore(true);
      }

      const result = await newsService.getArticles(
        filtersRef.current,
        reset ? undefined : (cursorRef.current || undefined),
      );

      if (reset) {
        setArticles(result.articles);
      } else {
        setArticles(prev => [...prev, ...result.articles]);
      }
      cursorRef.current = result.nextCursor;
      setHasMore(result.hasMore);
    } catch (err: any) {
      setError(err.message || 'Failed to load news');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []); // No deps — reads from refs

  // Reset and fetch when filters change
  useEffect(() => {
    if (!searchMode) {
      fetchArticles(true);
    }
  }, [filters, searchMode, fetchArticles]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      if (searchMode) {
        setSearchMode(false);
        setSearchResults([]);
      }
      return;
    }

    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearchMode(true);
      setLoading(true);
      try {
        const result = await newsService.searchArticles(searchQuery, filtersRef.current);
        setSearchResults(result.hits);
        setSearchTotal(result.totalHits);
      } catch (err: any) {
        setError(err.message || 'Search failed');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(searchTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && !searchMode) {
      fetchArticles(false);
    }
  }, [loadingMore, hasMore, searchMode, fetchArticles]);

  const handleRefresh = () => {
    setSearchQuery('');
    setSearchMode(false);
    setFilters(EMPTY_FILTERS);
    // fetchArticles will be triggered by the filters useEffect
  };

  const displayArticles = searchMode ? searchResults : articles;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="p-3 sm:p-4">
          <div className="flex items-center gap-3 mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('dashboard')}
              className="w-9 h-9 p-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">Market News</h1>
              <p className="text-xs text-muted-foreground">
                {searchMode
                  ? `${searchTotal} result${searchTotal !== 1 ? 's' : ''}`
                  : 'Commodity news & analysis'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="w-9 h-9 p-0"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search news..."
              className="pl-9 pr-9 h-9 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchMode(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <NewsFilterBar
            tagOptions={tagOptions}
            filters={filters}
            onChange={(newFilters) => {
              setFilters(newFilters);
              if (searchMode) {
                setSearchQuery('');
                setSearchMode(false);
              }
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {error && (
          <div className="m-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-3 sm:p-4 space-y-3">
            {[1, 2, 3].map(i => <NewsCardSkeleton key={i} />)}
          </div>
        ) : displayArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Newspaper className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No Articles</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              {searchMode
                ? 'No articles match your search. Try different keywords.'
                : 'No articles found. New articles appear as the live feed updates.'}
            </p>
          </div>
        ) : (
          <div className="p-3 sm:p-4 space-y-3">
            {displayArticles.map(article => (
              <NewsCard key={article.id} article={article} />
            ))}

            {/* Infinite scroll trigger */}
            {hasMore && !searchMode && (
              <LoadMoreTrigger onVisible={handleLoadMore} loading={loadingMore} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NewsCardSkeleton() {
  return (
    <div className="bg-card rounded-xl ring-1 ring-gray-200/50 dark:ring-gray-700/50 p-4 space-y-3">
      {/* Source + time row */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-14 rounded-full" />
      </div>
      {/* Title + thumbnail */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="w-20 h-20 rounded-lg shrink-0" />
      </div>
      {/* Tags row */}
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}
