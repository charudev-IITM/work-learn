import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

export type AppView = 'dashboard' | 'watchlist' | 'alerts' | 'news' | 'calculator' | 'ticker'

interface NavigationContextType {
  currentView: AppView
  navigate: (view: AppView) => void
}

const NavigationContext = createContext<NavigationContextType | null>(null)

function getViewFromHash(): AppView {
  const hash = window.location.hash
  if (hash === '#ticker') return 'ticker'
  if (hash === '#dashboard') return 'dashboard'
  if (hash === '#alerts') return 'alerts'
  if (hash === '#news') return 'news'
  if (hash === '#calculator') return 'calculator'
  if (hash === '#watchlist') return 'watchlist'
  // During app preview, default to watchlist so user sees their new rates
  if (localStorage.getItem('app_preview_active') === 'true') return 'watchlist'
  return 'dashboard' // Default landing page is now Dashboard
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [currentView, setCurrentView] = useState<AppView>(getViewFromHash)

  useEffect(() => {
    const handleHashChange = () => setCurrentView(getViewFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navigate = useCallback((view: AppView) => {
    window.location.hash = `#${view}`
  }, [])

  const value = useMemo(() => ({ currentView, navigate }), [currentView, navigate])

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const context = useContext(NavigationContext)
  if (!context) throw new Error('useNavigation must be used within NavigationProvider')
  return context
}
