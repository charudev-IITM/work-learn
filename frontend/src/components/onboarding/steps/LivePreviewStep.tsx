import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Sparkles, Clock, ArrowRight, Eye } from 'lucide-react';
import { Button } from '../../ui/button';
import { useOnboarding } from '../../../contexts/OnboardingContext';
import { onboardingService } from '@comp-intel/shared/services/onboarding';
import type { CreateWatchlistResponse } from '@comp-intel/shared/types/onboarding';
import { cn } from '../../../lib/cn';

interface LivePreviewStepProps {
  onNext: () => void;
}

interface LiveScript {
  dealer_name: string;
  script_name: string;
  display_name: string;
  product_type: string;
  buy_rate: number | null;
  sell_rate: number | null;
}

export function LivePreviewStep({ onNext }: LivePreviewStepProps) {
  const {
    selectedCommodities,
    selectedDealers,
    createdWatchlistId,
    setCreatedWatchlist,
  } = useOnboarding();

  const [isCreating, setIsCreating] = useState(false);
  const [watchlistData, setWatchlistData] = useState<CreateWatchlistResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [liveScripts, setLiveScripts] = useState<LiveScript[]>([]);
  const [isLive, setIsLive] = useState(false);
  const createCalledRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Create the watchlist
  const createWatchlist = useCallback(async () => {
    if (createdWatchlistId || createCalledRef.current) return;
    createCalledRef.current = true;
    try {
      setIsCreating(true);
      const result = await onboardingService.createWatchlist(
        selectedCommodities,
        selectedDealers,
      );
      setWatchlistData(result);
      setLiveScripts(result.preview_scripts);
      setCreatedWatchlist(result.watchlist_id);
    } catch {
      createCalledRef.current = false;
      setError('Failed to create watchlist. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }, [selectedCommodities, selectedDealers, createdWatchlistId, setCreatedWatchlist]);

  useEffect(() => {
    createWatchlist();
  }, [createWatchlist]);

  // Connect WebSocket for live rate updates after watchlist is created (uses JWT via cookies)
  useEffect(() => {
    if (!watchlistData && !createdWatchlistId) return;

    let ws: WebSocket | null = null;
    let cancelled = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/rates`;
    ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!cancelled) setIsLive(true);
    };

    ws.onmessage = (event) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(event.data);

        // Extract rates array from whichever message type we received
        let rates: any[] | null = null;
        if (data.type === 'rate_update' || data.type === 'rate_update_full') {
          rates = data.rates;
        } else if (data.type === 'rate_update_diff') {
          rates = data.changes?.updated;
        } else if (data.type === 'heartbeat') {
          // Keep live indicator green even when rates are static
          setIsLive(true);
          return;
        }

        if (rates && data.competitor) {
          setLiveScripts((prev) => {
            const updated = [...prev];
            for (const rate of rates!) {
              const idx = updated.findIndex(
                (s) => s.dealer_name === data.competitor && s.script_name === rate.script_name,
              );
              if (idx >= 0) {
                updated[idx] = {
                  ...updated[idx],
                  buy_rate: rate.buy_rate ?? updated[idx].buy_rate,
                  sell_rate: rate.sell_rate ?? updated[idx].sell_rate,
                };
              }
            }
            return updated;
          });
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      if (!cancelled) setIsLive(false);
    };

    return () => {
      cancelled = true;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [watchlistData, createdWatchlistId]);

  // Countdown timer
  useEffect(() => {
    if (!watchlistData && !createdWatchlistId) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Close WebSocket when preview ends
          if (wsRef.current) wsRef.current.close();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [watchlistData, createdWatchlistId]);

  if (isCreating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div className="relative">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-white animate-pulse" />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-foreground mb-1">Building your watchlist</h2>
          <p className="text-sm text-muted-foreground">
            Selecting the best rates from {selectedDealers.length} dealers...
          </p>
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-muted-foreground text-center">{error}</p>
        <Button onClick={() => { setError(null); createWatchlist(); }} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const previewExpired = countdown === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-2 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Your Watchlist
            </h1>
            <p className="text-sm text-muted-foreground">
              {liveScripts.length} scripts from {selectedDealers.length} dealers
            </p>
          </div>
          {/* Countdown */}
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
            previewExpired
              ? 'bg-red-500/10 text-red-500'
              : countdown <= 15
                ? 'bg-amber-500/10 text-amber-600'
                : 'bg-green-500/10 text-green-600 dark:text-green-400',
          )}>
            <Clock className="w-3.5 h-3.5" />
            {previewExpired ? 'Preview ended' : `${countdown}s`}
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'w-2 h-2 rounded-full',
              isLive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground',
            )} />
            <span className={cn(
              'text-xs font-medium',
              isLive ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground',
            )}>
              {isLive ? 'Live rates' : 'Connecting...'}
            </span>
          </div>
          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Preview mode</span>
        </div>
      </div>

      {/* Rate Cards */}
      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="space-y-2">
          {liveScripts.map((script, i) => (
            <div
              key={`${script.dealer_name}-${script.script_name}`}
              className="bg-card border border-border rounded-xl p-3 flex items-center justify-between"
              style={{
                animation: `fadeSlideIn 0.3s ease-out ${i * 0.05}s both`,
              }}
            >
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground font-medium truncate">
                  {script.dealer_name.replace(/_/g, ' ').replace(/-/g, ' ')}
                </div>
                <div className="text-sm font-semibold text-foreground truncate">
                  {script.display_name}
                </div>
                <div className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-0.5 font-medium',
                  script.product_type === 'Gold'
                    ? 'bg-amber-500/10 text-amber-600'
                    : script.product_type === 'Silver'
                      ? 'bg-slate-400/10 text-slate-500'
                      : 'bg-blue-500/10 text-blue-500',
                )}>
                  {script.product_type}
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <div className="flex gap-4">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Buy</div>
                    <div className="text-sm font-semibold text-foreground tabular-nums">
                      {script.buy_rate
                        ? `₹${script.buy_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Sell</div>
                    <div className="text-sm font-semibold text-foreground tabular-nums">
                      {script.sell_rate
                        ? `₹${script.sell_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="shrink-0 px-6 py-4 border-t border-border bg-background">
        <Button
          onClick={onNext}
          className="w-full h-14 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold text-base rounded-xl shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-all"
        >
          {previewExpired ? 'Continue to Subscribe' : 'Continue'}
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
