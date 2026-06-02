import { LayoutGrid, List } from 'lucide-react';
import { Button } from '../ui/button';
import { useWatchlist } from '../../contexts/WatchlistContext';
import { cn } from '../../lib/cn';

export function LayoutToggle() {
  const { layoutMode, setLayoutMode } = useWatchlist();

  return (
    <div className="flex bg-muted/50 rounded-lg p-0.5 gap-0.5">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 w-7 p-0 rounded-md',
          layoutMode === 'card' && 'bg-background shadow-sm'
        )}
        onClick={() => setLayoutMode('card')}
        aria-label="Card layout"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 w-7 p-0 rounded-md',
          layoutMode === 'compact' && 'bg-background shadow-sm'
        )}
        onClick={() => setLayoutMode('compact')}
        aria-label="Compact layout"
      >
        <List className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
