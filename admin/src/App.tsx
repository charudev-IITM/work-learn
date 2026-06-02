import { useAuth } from './contexts/AuthContext'
import { AdminLogin } from './components/auth/AdminLogin'
import { AdminShell } from './components/layout/AdminShell'
import { Loader2 } from 'lucide-react'

function AppContent() {
  const { isAuthenticated, isLoading, flowStep } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated || flowStep === 'access_denied') {
    return <AdminLogin />
  }

  return <AdminShell />
}

export default function App() {
  return <AppContent />
}
