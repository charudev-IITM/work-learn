import { MapPin } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useWatchlist } from '../../contexts/WatchlistContext';
import { useDealerMetadata } from '../../contexts/DealerMetadataContext';
import { useMemo } from 'react';

export function CityFilter() {
  const { cityFilter, setCityFilter, watchlists, currentWatchlistId } = useWatchlist();
  const { getDealerCity } = useDealerMetadata();

  // Only show cities present in the current watchlist's dealers
  const currentWatchlist = watchlists.find(w => w.id === currentWatchlistId);
  const availableCities = useMemo(() => {
    if (!currentWatchlist) return [];
    const cities = new Set<string>();
    for (const script of currentWatchlist.scripts) {
      const city = getDealerCity(script.dealerName);
      if (city) cities.add(city);
    }
    return Array.from(cities).sort();
  }, [currentWatchlist, getDealerCity]);

  if (availableCities.length <= 1) return null;

  return (
    <Select
      value={cityFilter || '__all__'}
      onValueChange={(v) => setCityFilter(v === '__all__' ? null : v)}
    >
      <SelectTrigger className="h-8 w-auto min-w-24 max-w-36 text-xs gap-1">
        <MapPin className="w-3 h-3 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="All Cities" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All Cities</SelectItem>
        {availableCities.map((city) => (
          <SelectItem key={city} value={city}>
            {city}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
