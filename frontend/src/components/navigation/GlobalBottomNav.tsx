import { useState, useCallback } from 'react'
import { LayoutDashboard, LineChart, Newspaper } from 'lucide-react'
import { useNavigation, AppView } from '../../contexts/NavigationContext'
import { useAuth } from '../../contexts/AuthContext'
import { useGoldie } from '../../contexts/GoldieContext'
import { getUserInitials } from '@comp-intel/shared/lib/getUserInitials'
import { cn } from '../../lib/cn'

interface Tab {
  id: AppView | 'profile'
  label: string
}

const LEFT_TABS: Tab[] = [
  { id: 'dashboard',  label: 'Home' },
  { id: 'watchlist',  label: 'Watchlist' },
]

const RIGHT_TABS: Tab[] = [
  { id: 'news',       label: 'News' },
  { id: 'profile',    label: 'Profile' },
]

const TAB_ICONS: Record<string, React.FC<{ className?: string }>> = {
  dashboard:  LayoutDashboard,
  watchlist:  LineChart,
  news:       Newspaper,
}

interface GlobalBottomNavProps {
  onProfileTap: () => void
  profileOpen: boolean
}

export function GlobalBottomNav({ onProfileTap, profileOpen }: GlobalBottomNavProps) {
  const { currentView, navigate } = useNavigation()
  const { user } = useAuth()
  const { openChat, isOpen: goldieOpen } = useGoldie()
  const [ripple, setRipple] = useState(false)

  const initials = user ? getUserInitials(user) : '??'

  const handleGoldieTap = useCallback(() => {
    if (goldieOpen) return
    // Trigger ripple, then open after animation
    setRipple(true)
    setTimeout(() => {
      openChat()
      setRipple(false)
    }, 280)
  }, [goldieOpen, openChat])

  const renderTab = (tab: Tab) => {
    const isProfile = tab.id === 'profile'
    const isActive = isProfile ? profileOpen : currentView === tab.id
    const Icon = TAB_ICONS[tab.id]

    return (
      <button
        key={tab.id}
        onClick={() => isProfile ? onProfileTap() : navigate(tab.id as AppView)}
        className={cn(
          "flex-1 flex flex-col items-center justify-center gap-0.5 h-14 relative",
          "transition-all duration-200 active:scale-95",
          "focus:outline-none"
        )}
      >
        {/* Active indicator pill */}
        {isActive && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-primary/40 via-primary to-primary/40 rounded-full" />
        )}

        {/* Icon */}
        <div className={cn(
          "flex items-center justify-center transition-colors duration-200",
          isActive ? "text-primary" : "text-muted-foreground"
        )}>
          {isProfile ? (
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
              "transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                : "bg-muted text-muted-foreground"
            )}>
              {initials}
            </div>
          ) : (
            Icon && <Icon className="w-5 h-5" />
          )}
        </div>

        {/* Label */}
        <span className={cn(
          "text-[10px] font-medium leading-none transition-colors duration-200",
          isActive ? "text-primary font-semibold" : "text-muted-foreground"
        )}>
          {tab.label}
        </span>
      </button>
    )
  }

  return (
    <div className="relative z-40">
      {/* Glassmorphism background */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl border-t border-border/50" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/90 to-transparent" />

      {/* Tab row */}
      <div
        className="relative flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Left tabs */}
        {LEFT_TABS.map(renderTab)}

        {/* Center Goldie button — raised above nav */}
        <div className="flex-1 flex flex-col items-center justify-end h-14 relative">
          {/* Raised orb container — protrudes above nav */}
          <button
            data-coach="goldie-orb"
            onClick={handleGoldieTap}
            aria-label="Open SONA AI assistant"
            className={cn(
              'absolute -top-5 left-1/2 -translate-x-1/2',
              'w-[52px] h-[52px] rounded-full',
              'flex items-center justify-center',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:rounded-full',
              'transition-transform duration-200',
              goldieOpen && 'pointer-events-none scale-90 opacity-60',
            )}
          >
            {/* Background pedestal — the circular "shelf" behind the orb */}
            <div className="absolute inset-[-4px] rounded-full bg-background border border-border/40 shadow-sm" />

            {/* Ripple ring on tap */}
            {ripple && (
              <div className="absolute inset-0 rounded-full goldie-tap-ripple" />
            )}

            {/* The siri orb */}
            <div
              className={cn("siri-orb relative z-10", ripple && "scale-90")}
              style={{
                '--c1': '#fef3c7',
                '--c2': '#fcd34d',
                '--c3': '#f59e0b',
                '--bg': '#b45309',
                '--animation-duration': '4s',
                '--blur-amount': '3px',
                '--contrast-amount': '1.2',
                '--shadow-spread': '4px',
                '--dot-size': '1px',
                '--mask-radius': '0%',
                width: '44px',
                height: '44px',
                transition: 'transform 120ms ease-out',
              } as React.CSSProperties}
            />
          </button>

          {/* "SONA AI" label — sits at regular tab label height */}
          <span className={cn(
            "text-[10px] font-semibold leading-none mb-[6px]",
            "text-amber-600 dark:text-amber-400",
          )}>
            SONA AI
          </span>
        </div>

        {/* Right tabs */}
        {RIGHT_TABS.map(renderTab)}
      </div>
    </div>
  )
}
