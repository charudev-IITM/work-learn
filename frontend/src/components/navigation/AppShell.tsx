import { useState, Suspense, lazy } from 'react'
import { NavigationProvider, useNavigation } from '../../contexts/NavigationContext'
import { WatchlistDataProvider } from '../../contexts/WatchlistDataContext'
import { PreviewTimerProvider, usePreviewTimerContext } from '../../contexts/PreviewTimerContext'
import { GoldieProvider } from '../../contexts/GoldieContext'
import { OnboardingProvider, useOnboarding } from '../../contexts/OnboardingContext'
import { useAuth } from '../../contexts/AuthContext'
import { Skeleton } from '../ui/skeleton'
import { GlobalBottomNav } from './GlobalBottomNav'
import { ProfileSheet } from './ProfileSheet'
import { PreviewBanner } from '../onboarding/tour/PreviewBanner'
import { PreviewResumeOverlay } from '../onboarding/tour/PreviewResumeOverlay'
import { AppPreviewTour } from '../onboarding/tour/AppPreviewTour'
import { AnnouncementBanner } from './AnnouncementBanner'
import { TrialCountdownBanner } from '../billing/TrialCountdownBanner'

const WatchlistView = lazy(() => import('../../views/WatchlistView'))
const HomeDashboardView = lazy(() => import('../../views/HomeDashboardView'))
const AlertsView = lazy(() => import('../../views/AlertsView'))
const NewsView = lazy(() => import('../../views/NewsView'))
const CalculatorView = lazy(() => import('../../views/CalculatorView'))
const TickerView = lazy(() => import('../../components/ticker/SimpleTest').then(m => ({ default: m.SimpleTest })))
const GoldieChatPanel = lazy(() => import('../goldie/GoldieChatPanel'))

const LoadingFallback = () => (
  <div className="flex-1 bg-background p-4 space-y-4">
    {/* Header skeleton */}
    <div className="flex items-center gap-3">
      <Skeleton className="h-9 w-9 rounded-lg" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
    {/* Content skeletons */}
    {[1, 2, 3].map(i => (
      <div key={i} className="rounded-xl bg-card ring-1 ring-gray-200/50 dark:ring-gray-700/50 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
    ))}
  </div>
)

/** Reads onboarding context to wire up preview banner subscribe button */
function PreviewBannerConnected({ remainingSeconds }: { remainingSeconds: number }) {
  const { exitToPaywall } = useOnboarding()
  return <PreviewBanner remainingSeconds={remainingSeconds} onSubscribeTap={exitToPaywall} />
}

/** Tour connected to OnboardingContext for preview mode (subscribe CTA) */
function PreviewTourConnected() {
  const { exitToPaywall } = useOnboarding()
  return <AppPreviewTour onSubscribe={exitToPaywall} />
}

function AppShellInner() {
  const { currentView } = useNavigation()
  const { flowStep } = useAuth()
  const isPreview = flowStep === 'app_preview'
  const [profileOpen, setProfileOpen] = useState(false)
  // Only mount tour component when the flag is set (avoid unnecessary localStorage reads for all users)
  const [tourPending] = useState(() => localStorage.getItem('app_preview_tour_pending') === 'true')

  // Read timer from its own context — doesn't cause WatchlistDataContext consumers to re-render
  const previewTimer = usePreviewTimerContext()

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Admin announcement banner */}
      <AnnouncementBanner />

      {/* Trial countdown banner — visible during active trial */}
      {!isPreview && <TrialCountdownBanner />}

      {/* Preview banner — always visible during app preview (hidden during initial server sync) */}
      {isPreview && !previewTimer.isLoading && <PreviewBannerConnected remainingSeconds={previewTimer.remainingSeconds} />}

      {/* View content area */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<LoadingFallback />}>
          {currentView === 'dashboard' && <HomeDashboardView />}
          {currentView === 'watchlist' && <WatchlistView />}
          {currentView === 'alerts' && <AlertsView />}
          {currentView === 'news' && <NewsView />}
          {currentView === 'calculator' && <CalculatorView />}
          {currentView === 'ticker' && <TickerView />}
        </Suspense>
      </div>

      {/* Global bottom nav — always visible */}
      <GlobalBottomNav
        onProfileTap={() => setProfileOpen(true)}
        profileOpen={profileOpen}
      />

      {/* Goldie chat panel — always mounted, renders null when hidden */}
      <Suspense fallback={null}>
        <GoldieChatPanel />
      </Suspense>

      {/* Profile sheet */}
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />

      {/* Guided tour — shows for new users when tour pending flag is set */}
      {isPreview ? <PreviewTourConnected /> : tourPending && <AppPreviewTour />}

      {/* Resume overlay during preview pause */}
      {isPreview && previewTimer.showResumeOverlay && (
        <PreviewResumeOverlay
          remainingSeconds={previewTimer.remainingSeconds}
          onResume={previewTimer.onResumeTap}
        />
      )}
    </div>
  )
}

function AppShellWithPreview() {
  return (
    <OnboardingProvider>
      <AppShellInner />
    </OnboardingProvider>
  )
}

function AppShellContent() {
  const { flowStep } = useAuth()
  const isPreview = flowStep === 'app_preview'

  // During preview, wrap with OnboardingProvider so PreviewBanner/Tour have context
  return isPreview ? <AppShellWithPreview /> : <AppShellInner />
}

export function AppShell() {
  return (
    <NavigationProvider>
      <PreviewTimerProvider>
        <WatchlistDataProvider>
          <GoldieProvider>
            <AppShellContent />
          </GoldieProvider>
        </WatchlistDataProvider>
      </PreviewTimerProvider>
    </NavigationProvider>
  )
}
