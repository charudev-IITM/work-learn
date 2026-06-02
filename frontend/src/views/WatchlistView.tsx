import { useState, useEffect } from 'react'
import { WatchlistProvider } from '../contexts/WatchlistContext'
import { DealerMetadataProvider } from '../contexts/DealerMetadataContext'
import { WatchlistApp } from '../components/watchlist/WatchlistApp'
import { CoachMarkOverlay, WATCHLIST_COACH_MARKS } from '../components/onboarding/tour/CoachMarkOverlay'

export default function WatchlistView() {
  const [showTour, setShowTour] = useState(false)

  // Check if we should show the feature tour after onboarding
  useEffect(() => {
    const tourPending = localStorage.getItem('onboarding_tour_pending')
    if (tourPending === 'true') {
      // Delay to let the watchlist render first
      const timer = setTimeout(() => setShowTour(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleTourComplete = () => {
    setShowTour(false)
    localStorage.removeItem('onboarding_tour_pending')
  }

  return (
    <WatchlistProvider>
      <DealerMetadataProvider>
        <WatchlistApp />
        {showTour && (
          <CoachMarkOverlay
            targets={WATCHLIST_COACH_MARKS}
            onComplete={handleTourComplete}
            onSkip={handleTourComplete}
          />
        )}
      </DealerMetadataProvider>
    </WatchlistProvider>
  )
}
