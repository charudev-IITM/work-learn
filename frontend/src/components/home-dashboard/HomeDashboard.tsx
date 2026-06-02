import { useRef, useCallback, useEffect } from 'react'
import { RefreshCw, Sunrise, Sun, SunDim, Moon } from 'lucide-react'
import { MarketStatusBar } from './MarketStatusBar'
import { QuickGlanceCards } from './QuickGlanceCards'
import { AlertsSummaryCard } from './AlertsSummaryCard'
import { NewsHeadlinesCard } from './NewsHeadlinesCard'
import { CalculatorShortcutCard } from './CalculatorShortcutCard'
import { HorizonIllustration } from './HorizonIllustration'
import { useDashboardAlerts } from '../../hooks/useDashboardAlerts'
import { useDashboardNews } from '../../hooks/useDashboardNews'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { useTimeOfDay, type TimePeriod } from '../../hooks/useTimeOfDay'
import { useMarketHint } from '../../hooks/useMarketHint'
import { useWatchlistDataContext } from '../../contexts/WatchlistDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/cn'
import { getOrbColors, getAccentHSL, getBackgroundTint } from '../../lib/timeOfDayTheme'

const GREETING_PREFIX: Record<TimePeriod, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Good night',
}

const GREETING_ICON: Record<TimePeriod, typeof Sun> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: SunDim,
  night: Moon,
}

function getGreeting(period: TimePeriod, name?: string | null): string {
  const prefix = GREETING_PREFIX[period]
  return name ? `${prefix}, ${name}` : prefix
}

export function HomeDashboard() {
  const { user } = useAuth()
  const { refetch: refetchRates, isConnected } = useWatchlistDataContext()
  const alertsData = useDashboardAlerts()
  const newsData = useDashboardNews()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { period, progress } = useTimeOfDay()
  const marketHint = useMarketHint()

  // Dynamic orb colors for dark mode
  const orbColors = getOrbColors(period, progress)
  const GreetingIcon = GREETING_ICON[period]

  // Drift the accent CSS variable
  useEffect(() => {
    const root = document.documentElement
    const original = root.style.getPropertyValue('--primary')
    root.style.setProperty('--primary', getAccentHSL(period, progress))
    return () => {
      if (original) {
        root.style.setProperty('--primary', original)
      } else {
        root.style.removeProperty('--primary')
      }
    }
  }, [period, progress])

  const { refetch: refetchAlerts } = alertsData
  const { refetch: refetchNews } = newsData

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      Promise.resolve(refetchRates()),
      refetchAlerts(),
      refetchNews(),
    ])
  }, [refetchRates, refetchAlerts, refetchNews])

  const { isPulling, pullDistance, isRefreshing, handlers } = usePullToRefresh(scrollRef, handleRefresh)

  const showIndicator = isPulling || isRefreshing
  const indicatorOpacity = Math.min(pullDistance / 60, 1)

  return (
    <div data-coach="dashboard-home" className="flex flex-col h-full bg-white dark:bg-[#0f172a] relative overflow-hidden">
      {/* Light mode time-of-day tint overlay */}
      <div
        className="dark:hidden pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundColor: getBackgroundTint(period),
          transition: 'background-color 3000ms ease',
        }}
      />

      {/* Dark mode ambient orbs — colors shift with time of day */}
      <div className="hidden dark:block pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb-drift-1 absolute -top-10 -right-10 w-[220px] h-[220px] rounded-full blur-[60px]" style={{ backgroundColor: orbColors.orb1, transition: 'background-color 3000ms ease' }} />
        <div className="orb-drift-2 absolute top-[40%] -left-16 w-[280px] h-[280px] rounded-full blur-[70px]" style={{ backgroundColor: orbColors.orb2, transition: 'background-color 3000ms ease' }} />
        <div className="orb-drift-3 absolute top-[28%] -right-5 w-[200px] h-[200px] rounded-full blur-[50px]" style={{ backgroundColor: orbColors.orb3, transition: 'background-color 3000ms ease' }} />
        <div className="orb-drift-2 absolute bottom-[10%] left-[30%] w-[150px] h-[150px] rounded-full blur-[50px]" style={{ backgroundColor: orbColors.orb4, transition: 'background-color 3000ms ease' }} />
      </div>

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-[#0f172a]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/[0.06]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-950 dark:bg-gradient-to-r dark:from-indigo-200 dark:via-purple-300 dark:to-indigo-200 dark:bg-clip-text dark:text-transparent">
              Spot Compare
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <GreetingIcon className="w-4 h-4 text-gray-400 dark:text-white/50 flex-shrink-0" />
              <p className="text-xs text-gray-400 dark:text-white/40">{getGreeting(period, user?.name || user?.username)}</p>
            </div>
            {marketHint && (
              <p className="text-[10px] text-gray-350 dark:text-white/30 ml-[22px]">{marketHint}</p>
            )}
          </div>
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full",
            isConnected
              ? "bg-green-100 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20"
              : "bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"
          )}>
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isConnected
                ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]"
                : "bg-red-400"
            )} />
            <span className={cn(
              "text-[10px] font-semibold",
              isConnected
                ? "text-green-700 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            )}>
              {isConnected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable body with pull-to-refresh */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain relative z-[1]"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        onTouchStart={handlers.onTouchStart}
        onTouchMove={handlers.onTouchMove}
        onTouchEnd={handlers.onTouchEnd}
      >
        {/* Pull indicator */}
        {showIndicator && (
          <div
            className="flex items-center justify-center py-2 text-muted-foreground"
            style={{ opacity: indicatorOpacity }}
          >
            <RefreshCw
              className={cn(
                "w-5 h-5 transition-transform",
                isRefreshing && "animate-spin"
              )}
              style={!isRefreshing ? { transform: `rotate(${(pullDistance / 60) * 180}deg)` } : {}}
            />
            <span className="ml-2 text-xs">
              {isRefreshing ? 'Refreshing...' : pullDistance >= 60 ? 'Release to refresh' : 'Pull to refresh'}
            </span>
          </div>
        )}

        {/* Atmospheric horizon strip — scrolls away */}
        <HorizonIllustration />

        {/* Dashboard sections — staggered entrance */}
        <div className="p-3 space-y-3 pb-4">
          <div className="dash-card-enter"><MarketStatusBar /></div>
          <div className="dash-card-enter"><QuickGlanceCards /></div>
          <div className="dash-card-enter"><AlertsSummaryCard data={alertsData} /></div>
          <div className="dash-card-enter"><CalculatorShortcutCard /></div>
          <div className="dash-card-enter"><NewsHeadlinesCard data={newsData} /></div>
        </div>
      </div>
    </div>
  )
}
