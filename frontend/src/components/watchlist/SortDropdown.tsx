import { ArrowUpDown } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useWatchlist } from '../../contexts/WatchlistContext';

export function SortDropdown() {
  const { sortMode, setSortMode, viewMode } = useWatchlist();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs font-medium px-2">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sort</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setSortMode('rate-desc')}
          className={sortMode === 'rate-desc' ? 'bg-accent' : ''}
        >
          Rate (High to Low)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setSortMode('rate-asc')}
          className={sortMode === 'rate-asc' ? 'bg-accent' : ''}
        >
          Rate (Low to High)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setSortMode('dealer')}
          className={sortMode === 'dealer' ? 'bg-accent' : ''}
        >
          Dealer Name
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setSortMode('added')}
          className={sortMode === 'added' ? 'bg-accent' : ''}
        >
          Recently Added
        </DropdownMenuItem>
        {viewMode === 'differences' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setSortMode('difference-desc')}
              className={sortMode === 'difference-desc' ? 'bg-accent' : ''}
            >
              Difference (High to Low)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setSortMode('difference-asc')}
              className={sortMode === 'difference-asc' ? 'bg-accent' : ''}
            >
              Difference (Low to High)
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem
          onClick={() => setSortMode('none')}
          className={sortMode === 'none' ? 'bg-accent' : ''}
        >
          Custom Order
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
