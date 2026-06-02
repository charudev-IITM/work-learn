import { useState, lazy, Suspense } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar, type AdminPage } from './Sidebar'
import { Skeleton } from '../ui/skeleton'

const OverviewPage = lazy(() => import('../pages/OverviewPage'))
const UsersPage = lazy(() => import('../pages/UsersPage'))
const SubscriptionsPage = lazy(() => import('../pages/SubscriptionsPage'))
const DealerRequestsPage = lazy(() => import('../pages/DealerRequestsPage'))
const AuditLogPage = lazy(() => import('../pages/AuditLogPage'))
const BroadcastPage = lazy(() => import('../pages/BroadcastPage'))
const PlatformSettingsPage = lazy(() => import('../pages/PlatformSettingsPage'))

const LoadingFallback = () => (
  <div className="p-8 space-y-4">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-64" />
    <div className="grid grid-cols-3 gap-4 mt-6">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
    </div>
  </div>
)

export function AdminShell() {
  const [currentPage, setCurrentPage] = useState<AdminPage>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 overflow-y-auto">
        {/* Mobile header with hamburger */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-muted">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold capitalize">{currentPage.replace('-', ' ')}</span>
        </div>
        <Suspense fallback={<LoadingFallback />}>
          {currentPage === 'overview' && <OverviewPage />}
          {currentPage === 'users' && <UsersPage />}
          {currentPage === 'subscriptions' && <SubscriptionsPage />}
          {currentPage === 'dealer-requests' && <DealerRequestsPage />}
          {currentPage === 'audit-log' && <AuditLogPage />}
          {currentPage === 'broadcast' && <BroadcastPage />}
          {currentPage === 'settings' && <PlatformSettingsPage />}
        </Suspense>
      </main>
    </div>
  )
}
