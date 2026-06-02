import { useState, useEffect, useMemo, useDeferredValue, useRef, useCallback } from 'react';
import { Search, ArrowRight, MapPin, Check, Sparkles, Star, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { useOnboarding } from '../../../contexts/OnboardingContext';
import { onboardingService } from '@comp-intel/shared/services/onboarding';
import type { CatalogDealer } from '@comp-intel/shared/types/onboarding';
import { cn } from '../../../lib/cn';

interface DealerStepProps {
  onNext: () => void;
}

// ── Dealer Card ──────────────────────────────────────────────────────────────

function DealerCard({
  dealer,
  isSelected,
  onToggle,
  compact = false,
  index = 0,
}: {
  dealer: CatalogDealer;
  isSelected: boolean;
  onToggle: () => void;
  compact?: boolean;
  index?: number;
}) {
  const [logoError, setLogoError] = useState(false);

  return (
    <button
      onClick={onToggle}
      className={cn(
        'relative group shrink-0 rounded-2xl transition-all duration-200',
        'border-2 overflow-hidden text-left',
        'hover:shadow-md hover:-translate-y-0.5',
        'active:scale-[0.96] active:shadow-sm',
        compact
          ? 'w-full flex items-center gap-3 p-3'
          : 'w-[136px] flex flex-col p-3',
        isSelected
          ? 'bg-amber-500/10 dark:bg-amber-500/5 border-amber-500/60 shadow-sm shadow-amber-500/10'
          : 'bg-card border-border/60 hover:border-border',
      )}
      style={{
        animation: `fadeSlideIn 0.3s ease-out ${index * 0.04}s both`,
      }}
    >
      {/* Selection check */}
      {isSelected && (
        <div className={cn(
          'absolute z-10 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center',
          'transition-transform duration-200',
          'top-2 right-2',
        )}
        style={{ animation: 'fadeSlideIn 0.15s ease-out both' }}
        >
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </div>
      )}

      {/* Logo */}
      <div className={cn(
        'rounded-xl flex items-center justify-center shrink-0 overflow-hidden',
        compact ? 'w-10 h-10' : 'w-full aspect-square mb-2.5',
        isSelected
          ? 'bg-amber-500/15 dark:bg-amber-500/10'
          : 'bg-muted/50',
      )}>
        {dealer.logo_url && !logoError ? (
          <img
            src={dealer.logo_url}
            alt=""
            className={cn(
              'w-full h-full object-contain',
              compact ? 'p-1' : 'p-2',
            )}
            loading="lazy"
            onError={() => setLogoError(true)}
          />
        ) : (
          <span className={cn(
            'font-bold',
            compact ? 'text-base' : 'text-2xl',
            isSelected
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground',
          )}>
            {dealer.display_name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className={cn(compact ? 'flex-1 min-w-0' : 'w-full')}>
        <div className={cn(
          'font-semibold text-foreground leading-tight',
          compact ? 'text-sm truncate' : 'text-xs line-clamp-2 min-h-[2rem]',
        )}>
          {dealer.display_name}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {dealer.city && (
            <span className="text-[10px] text-muted-foreground truncate">
              {dealer.city}
            </span>
          )}
          {dealer.city && <span className="text-[10px] text-muted-foreground">·</span>}
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {dealer.script_count} scripts
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Horizontal Carousel Section ──────────────────────────────────────────────

function CarouselSection({
  title,
  icon,
  subtitle,
  dealers,
  selectedDealers,
  onToggle,
  accentColor = 'amber',
}: {
  title: string;
  icon: React.ReactNode;
  subtitle?: string;
  dealers: CatalogDealer[];
  selectedDealers: string[];
  onToggle: (id: string) => void;
  accentColor?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Initial check after render + images load
    const timer = setTimeout(checkScroll, 100);
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, dealers]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.7;
    el.scrollBy({ left: direction === 'right' ? amount : -amount, behavior: 'smooth' });
  };

  if (dealers.length === 0) return null;

  return (
    <div className="mb-5 group/section">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-5 mb-2.5">
        <span className={cn(
          'flex items-center justify-center w-6 h-6 rounded-lg',
          accentColor === 'amber' && 'bg-amber-500/15 text-amber-500',
          accentColor === 'blue' && 'bg-blue-500/15 text-blue-500',
          accentColor === 'green' && 'bg-green-500/15 text-green-500',
          accentColor === 'purple' && 'bg-purple-500/15 text-purple-500',
          accentColor === 'slate' && 'bg-slate-400/15 text-slate-400',
        )}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        {/* Scroll controls — visible on hover on desktop, always on mobile via count */}
        <div className="flex items-center gap-1">
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="hidden sm:flex w-6 h-6 items-center justify-center rounded-full bg-muted/80 hover:bg-muted text-foreground transition-all opacity-0 group-hover/section:opacity-100"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => scroll('right')}
            className={cn(
              'flex items-center gap-0.5 text-[10px] text-muted-foreground',
              'sm:w-6 sm:h-6 sm:items-center sm:justify-center sm:rounded-full',
              'sm:bg-muted/80 sm:hover:bg-muted sm:text-foreground sm:transition-all',
              canScrollRight
                ? 'sm:opacity-0 sm:group-hover/section:opacity-100'
                : 'sm:opacity-30 sm:cursor-default',
            )}
            aria-label="Scroll right"
          >
            <span className="sm:hidden">{dealers.length}</span>
            <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>
      </div>

      {/* Horizontal scroll with edge fades */}
      <div className="relative">
        {/* Left fade */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        )}
        {/* Right fade */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        )}
        <div
          ref={scrollRef}
          className="flex gap-2.5 overflow-x-auto scroll-smooth px-5 pb-1 no-scrollbar"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {dealers.map((dealer, i) => (
            <DealerCard
              key={dealer.dealer_id}
              dealer={dealer}
              isSelected={selectedDealers.includes(dealer.dealer_id)}
              onToggle={() => onToggle(dealer.dealer_id)}
              index={i}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DealerStep({ onNext }: DealerStepProps) {
  const { selectedCommodities, selectedDealers, toggleDealer } = useOnboarding();
  const [dealers, setDealers] = useState<CatalogDealer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [shake, setShake] = useState(false);

  // Fetch dealer catalog
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        setIsLoading(true);
        const catalog = await onboardingService.getCatalog(
          selectedCommodities.length > 0 ? { commodities: selectedCommodities } : undefined,
        );
        const dealerMap = new Map<string, CatalogDealer>();
        for (const commodity of catalog.commodities) {
          for (const dealer of commodity.dealers) {
            if (!dealerMap.has(dealer.dealer_id)) {
              dealerMap.set(dealer.dealer_id, dealer);
            } else {
              const existing = dealerMap.get(dealer.dealer_id)!;
              existing.script_count += dealer.script_count;
            }
          }
        }
        const allDealers = Array.from(dealerMap.values());
        allDealers.sort((a, b) => {
          if (a.is_popular !== b.is_popular) return a.is_popular ? -1 : 1;
          return a.display_name.localeCompare(b.display_name);
        });
        setDealers(allDealers);

        // Auto-select popular dealers if nothing selected yet
        if (selectedDealers.length === 0) {
          for (const dealer of allDealers) {
            if (dealer.is_popular) {
              toggleDealer(dealer.dealer_id);
            }
          }
        }
      } catch {
        setError('Failed to load dealers. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommodities]);

  // ── Derived data for sections ──────────────────────────────────────────

  const popularDealers = useMemo(
    () => dealers.filter((d) => d.is_popular),
    [dealers],
  );

  // Group dealers by city — sorted by dealer count descending
  const cityGroups = useMemo(() => {
    const map = new Map<string, CatalogDealer[]>();
    for (const d of dealers) {
      const city = d.city || 'Other';
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(d);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8); // top 8 cities
  }, [dealers]);

  // Top commodity-specific dealers
  const commodityDealers = useMemo(() => {
    if (!selectedCommodities.length) return [];
    return [...dealers]
      .filter((d) => d.script_count >= 2 && !d.is_popular)
      .sort((a, b) => b.script_count - a.script_count)
      .slice(0, 15);
  }, [dealers, selectedCommodities]);

  // ── Recommendation engine ──────────────────────────────────────────────

  const recommendations = useMemo(() => {
    if (selectedDealers.length === 0) return [];

    const selectedCities = new Set(
      dealers
        .filter((d) => selectedDealers.includes(d.dealer_id) && d.city)
        .map((d) => d.city!),
    );

    if (selectedCities.size === 0) return [];

    const recs = dealers.filter(
      (d) =>
        !selectedDealers.includes(d.dealer_id) &&
        d.city &&
        selectedCities.has(d.city),
    );

    return recs.sort((a, b) => b.script_count - a.script_count).slice(0, 10);
  }, [dealers, selectedDealers]);

  const recommendationContext = useMemo(() => {
    if (selectedDealers.length === 0) return '';
    const selected = dealers.filter((d) => selectedDealers.includes(d.dealer_id));
    const cities = [...new Set(selected.filter((d) => d.city).map((d) => d.city!))];
    if (cities.length === 0) return '';
    return `Similar to your picks in ${cities.slice(0, 2).join(' & ')}`;
  }, [dealers, selectedDealers]);

  // ── Search filter ──────────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    if (!deferredSearch) return [];
    const q = deferredSearch.toLowerCase();
    return dealers.filter(
      (d) =>
        d.display_name.toLowerCase().includes(q) ||
        d.dealer_id.toLowerCase().includes(q) ||
        (d.city && d.city.toLowerCase().includes(q)),
    );
  }, [dealers, deferredSearch]);

  const isSearching = deferredSearch.length > 0;

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleContinue = () => {
    if (selectedDealers.length < 3) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    onNext();
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header skeleton */}
        <div className="shrink-0 px-5 pt-2 pb-3 space-y-2.5">
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-56" />
          </div>
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
        {/* Carousel sections skeleton */}
        <div className="flex-1 space-y-5 pt-2">
          {[1, 2, 3].map(section => (
            <div key={section}>
              <div className="flex items-center gap-2 px-5 mb-2.5">
                <Skeleton className="w-6 h-6 rounded-lg" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-40" />
                </div>
              </div>
              <div className="flex gap-2.5 px-5 overflow-hidden">
                {[1, 2, 3, 4].map(card => (
                  <div key={card} className="w-[136px] shrink-0 rounded-2xl border-2 border-border/60 p-3 space-y-2">
                    <Skeleton className="w-full aspect-square rounded-xl" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Bottom CTA skeleton */}
        <div className="shrink-0 border-t border-border bg-background px-5 py-3">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-muted-foreground text-center">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const remaining = Math.max(0, 3 - selectedDealers.length);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Sticky Header ── */}
      <div className="shrink-0 px-5 pt-2 pb-3 space-y-2.5">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Choose your dealers
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick 3+ dealers to build your watchlist
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or city..."
            className="h-9 pl-9 pr-8 text-sm rounded-xl bg-muted/50 border-transparent focus-visible:border-border"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Selection pills */}
        {selectedDealers.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className={cn(
              'text-[10px] font-bold px-2 py-1 rounded-full shrink-0 tabular-nums',
              remaining === 0
                ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            )}>
              {selectedDealers.length} selected
            </span>
            {dealers
              .filter((d) => selectedDealers.includes(d.dealer_id))
              .slice(0, 5)
              .map((d) => (
                <button
                  key={d.dealer_id}
                  onClick={() => toggleDealer(d.dealer_id)}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0 group"
                >
                  <span className="truncate max-w-[80px]">{d.display_name}</span>
                  <X className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" />
                </button>
              ))}
            {selectedDealers.length > 5 && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                +{selectedDealers.length - 5}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Scrollable Content with bottom fade ── */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 overflow-y-auto pb-4">
          {isSearching ? (
            /* ── Search Results (flat list) ── */
            <div className="px-5 space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{deferredSearch}&rdquo;
              </p>
              {searchResults.map((dealer, i) => (
                <DealerCard
                  key={dealer.dealer_id}
                  dealer={dealer}
                  isSelected={selectedDealers.includes(dealer.dealer_id)}
                  onToggle={() => toggleDealer(dealer.dealer_id)}
                  compact
                  index={i}
                />
              ))}
              {searchResults.length === 0 && (
                <div className="text-center text-muted-foreground py-12 text-sm">
                  No dealers found
                </div>
              )}
            </div>
          ) : (
            /* ── Discovery Sections ── */
            <>
              {/* Popular */}
              {popularDealers.length > 0 && (
                <CarouselSection
                  title="Popular Dealers"
                  icon={<Star className="w-3.5 h-3.5" />}
                  subtitle="Most tracked by bullion traders"
                  dealers={popularDealers}
                  selectedDealers={selectedDealers}
                  onToggle={toggleDealer}
                  accentColor="amber"
                />
              )}

              {/* Recommendations (dynamic) */}
              {recommendations.length > 0 && (
                <CarouselSection
                  title="Suggested for You"
                  icon={<Sparkles className="w-3.5 h-3.5" />}
                  subtitle={recommendationContext}
                  dealers={recommendations}
                  selectedDealers={selectedDealers}
                  onToggle={toggleDealer}
                  accentColor="purple"
                />
              )}

              {/* Top by commodity */}
              {commodityDealers.length > 0 && (
                <CarouselSection
                  title={`Top ${selectedCommodities.join(' & ')} Dealers`}
                  icon={<span className="text-[10px]">{selectedCommodities.includes('Gold') ? '🥇' : '🥈'}</span>}
                  subtitle="Sorted by script coverage"
                  dealers={commodityDealers}
                  selectedDealers={selectedDealers}
                  onToggle={toggleDealer}
                  accentColor={selectedCommodities.includes('Gold') ? 'amber' : 'slate'}
                />
              )}

              {/* City sections */}
              {cityGroups.map(([city, cityDealers]) => (
                <CarouselSection
                  key={city}
                  title={city}
                  icon={<MapPin className="w-3.5 h-3.5" />}
                  subtitle={`${cityDealers.length} dealer${cityDealers.length !== 1 ? 's' : ''}`}
                  dealers={cityDealers}
                  selectedDealers={selectedDealers}
                  onToggle={toggleDealer}
                  accentColor="blue"
                />
              ))}
            </>
          )}
        </div>
        {/* Bottom fade to hint more content */}
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />
      </div>

      {/* ── Fixed Bottom CTA ── */}
      <div className="shrink-0 border-t border-border bg-background px-5 py-3">
        <Button
          onClick={handleContinue}
          disabled={selectedDealers.length < 3}
          className={cn(
            'w-full h-12 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700',
            'text-white font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20',
            'active:scale-[0.98] transition-all disabled:opacity-40 disabled:shadow-none',
            shake && 'animate-shake',
          )}
        >
          {remaining > 0 ? (
            <>Select {remaining} more dealer{remaining !== 1 ? 's' : ''}</>
          ) : (
            <>
              Continue with {selectedDealers.length} dealers
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
