import { BarChart3, Users, CreditCard, MessageSquare, ScrollText, Megaphone, LayoutDashboard, LogOut, Sun, Moon, Monitor, Settings, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

export type AdminPage = 'overview' | 'users' | 'subscriptions' | 'dealer-requests' | 'audit-log' | 'broadcast' | 'settings'

interface SidebarProps {
  currentPage: AdminPage
  onNavigate: (page: AdminPage) => void
  open: boolean
  onClose: () => void
}

const NAV_ITEMS: { id: AdminPage; label: string; icon: typeof Users }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'dealer-requests', label: 'Dealer Requests', icon: MessageSquare },
  { id: 'audit-log', label: 'Audit Log', icon: ScrollText },
  { id: 'broadcast', label: 'Broadcast', icon: Megaphone },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ currentPage, onNavigate, open, onClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const { theme, setTheme, actualTheme } = useTheme()

  const cycleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  }

  const ThemeIcon = theme === 'system' ? Monitor : actualTheme === 'dark' ? Moon : Sun

  const handleNavigate = (page: AdminPage) => {
    onNavigate(page)
    onClose()
  }

  return (
    <>
      {/* Backdrop — mobile only */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col transition-transform duration-200 lg:relative lg:translate-x-0 lg:z-auto',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            <div>
              <h1 className="font-semibold text-sm">SpotCompare</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ops Panel</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 rounded hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                currentPage === item.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t space-y-1">
          <button
            onClick={cycleTheme}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <ThemeIcon className="w-4 h-4" />
            <span className="flex-1 text-left">{theme === 'system' ? `System (${actualTheme})` : theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
          </button>
          <div className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground">
            <span className="truncate">{user?.name || user?.phone}</span>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
