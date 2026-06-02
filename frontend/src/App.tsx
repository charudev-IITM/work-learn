import { Suspense, lazy } from 'react'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { SubscriptionProvider } from './contexts/SubscriptionContext'
import { AuthGuard } from './components/auth/AuthGuard'
import { SubscriptionGuard } from './components/billing/SubscriptionGuard'
import { AppShell } from './components/navigation/AppShell'
import { Skeleton } from './components/ui/skeleton'
import './App.css'

const SimpleTest = lazy(() => import('./components/ticker/SimpleTest').then(m => ({ default: m.SimpleTest })))

const LoadingFallback = () => (
  <div className="min-h-screen bg-background p-4 space-y-4">
    <div className="flex items-center gap-3">
      <Skeleton className="h-9 w-9 rounded-lg" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
    {[1, 2, 3].map(i => (
      <Skeleton key={i} className="h-24 w-full rounded-xl" />
    ))}
  </div>
)

function App() {
  // Ticker view bypasses auth entirely
  if (window.location.hash === '#ticker') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <SimpleTest />
      </Suspense>
    )
  }

  return (
    <ThemeProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <AuthGuard>
              <SubscriptionGuard>
                <AppShell />
              </SubscriptionGuard>
            </AuthGuard>
          </SubscriptionProvider>
        </AuthProvider>
    </ThemeProvider>
  )
}

export default App
