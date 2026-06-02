import { Search, TrendingUp } from 'lucide-react';
import { useWatchlist } from '../../contexts/WatchlistContext';
import { WatchlistContent } from './WatchlistContent';
import { WatchlistTabs } from './WatchlistTabs';
import { BrowseOverlay } from './BrowseOverlay';
import { UserHeader } from '../auth/UserHeader';
import { Button } from '../ui/button';
import { cn } from '../../lib/cn';

export function WatchlistApp() {
  const {
    watchlists,
    currentWatchlistId,
    isLoading,
    setSearchOpen,
  } = useWatchlist();

  const currentWatchlist = watchlists.find(w => w.id === currentWatchlistId);
  const hasScripts = currentWatchlist && currentWatchlist.scripts.length > 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur border-b z-20">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:p-4">
          <UserHeader className="flex-1 min-w-0" />

          <button
            onClick={() => setSearchOpen(true)}
            data-coach="add-scripts-btn"
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 text-white shadow-md shadow-amber-500/25 hover:shadow-lg hover:shadow-amber-500/35 hover:-translate-y-0.5 active:scale-[0.96] active:shadow-sm transition-all duration-150 animate-shimmer"
          >
            <Search className="w-3.5 h-3.5" />
            Compare
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isLoading ? (
          <WatchlistSkeleton />
        ) : hasScripts ? (
          <WatchlistContent />
        ) : (
          <EmptyWatchlistState onAddScripts={() => setSearchOpen(true)} />
        )}
      </div>

      {/* Bottom Navigation - Watchlist Tabs */}
      <WatchlistTabs />

      {/* Browse Overlay */}
      <BrowseOverlay />
    </div>
  );
}

function WatchlistSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* Toolbar skeleton */}
      <div className="px-4 pt-3 pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-28 bg-muted rounded" />
            <div className="h-4 w-16 bg-muted rounded-full" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-muted rounded" />
            <div className="h-8 w-8 bg-muted rounded" />
            <div className="h-8 w-8 bg-muted rounded" />
          </div>
        </div>
        <div className="flex gap-1">
          <div className="h-8 w-20 bg-muted rounded-full" />
          <div className="h-8 w-20 bg-muted rounded-full" />
          <div className="h-8 w-20 bg-muted rounded-full" />
        </div>
      </div>

      {/* Card skeletons */}
      <div className="flex-1 p-3 space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={cn(
              'rounded-xl p-4 ring-1 ring-muted',
              'bg-card'
            )}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-3 w-40 bg-muted rounded" />
                <div className="flex gap-2">
                  <div className="h-4 w-14 bg-muted rounded-full" />
                  <div className="h-4 w-12 bg-muted rounded-full" />
                </div>
              </div>
              <div className="h-5 w-20 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface EmptyWatchlistStateProps {
  onAddScripts: () => void;
}

function EmptyWatchlistState({ onAddScripts }: EmptyWatchlistStateProps) {
  const { currentWatchlistId, watchlists } = useWatchlist();
  const currentWatchlist = watchlists.find(w => w.id === currentWatchlistId);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
      <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center">
        <TrendingUp className="w-10 h-10 text-primary" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">
          {currentWatchlist?.name || 'Your Watchlist'}
        </h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          Start building your personalized watchlist by adding scripts from different dealers
        </p>
      </div>

      <Button onClick={onAddScripts} size="lg" className="gap-2 w-full max-w-sm">
        <Search className="w-5 h-5" />
        Browse & Compare
      </Button>
    </div>
  );
}
