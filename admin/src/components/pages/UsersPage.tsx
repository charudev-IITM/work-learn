import { useState, useEffect, useCallback } from 'react'
import { Search, X, Loader2, UserCheck, UserX, Ban, LogOut, Eye, ShieldOff, AlertTriangle, RefreshCw, Download, Check, Columns } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '../ui/dropdown-menu'
import { adminService, type AdminUser } from '../../services/admin'
import { UserDetailPanel } from './UserDetailPanel'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/format'

type GrantPlan = 'annual' | 'monthly'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  authenticated: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  created: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">No sub</span>
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status] || 'bg-muted text-muted-foreground')}>
      {status}
    </span>
  )
}

function TrialBadge({ user }: { user: AdminUser }) {
  if (!user.trial_status || user.trial_status === 'not_claimed') {
    return <span className="text-xs text-muted-foreground">&mdash;</span>
  }
  if (user.trial_status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        Active ({user.trial_days_left}d left)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
      Expired
    </span>
  )
}

const ALL_EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: 'phone', label: 'Phone' },
  { key: 'name', label: 'Name' },
  { key: 'business', label: 'Business' },
  { key: 'joined', label: 'Joined (IST)' },
  { key: 'last_login', label: 'Last Login (IST)' },
  { key: 'onboarding', label: 'Onboarded' },
  { key: 'subscription_status', label: 'Subscription' },
  { key: 'subscription_plan', label: 'Plan' },
  { key: 'subscription_expiry', label: 'Expiry (IST)' },
  { key: 'trial_status', label: 'Trial' },
  { key: 'is_active', label: 'Account Active' },
  { key: 'is_online', label: 'Online Now' },
]

type ColumnKey = 'last_login' | 'onboarded' | 'plan_type' | 'expiry' | 'account_active' | 'online_now'

const TOGGLE_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'last_login', label: 'Last Login' },
  { key: 'onboarded', label: 'Onboarded' },
  { key: 'plan_type', label: 'Plan Type' },
  { key: 'expiry', label: 'Expiry' },
  { key: 'account_active', label: 'Account Active' },
  { key: 'online_now', label: 'Online Now' },
]

const COLUMN_PREFS_KEY = 'admin_users_visible_columns'
const VALID_KEYS = new Set<string>(TOGGLE_COLUMNS.map(c => c.key))

const PAGE_SIZE = 50

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [grantTarget, setGrantTarget] = useState<AdminUser | null>(null)
  const [grantPlan, setGrantPlan] = useState<GrantPlan>('annual')
  const [grantDuration, setGrantDuration] = useState('')
  const [granting, setGranting] = useState(false)

  const [revokeTarget, setRevokeTarget] = useState<AdminUser | null>(null)
  const [revoking, setRevoking] = useState(false)

  const [banTarget, setBanTarget] = useState<AdminUser | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banning, setBanning] = useState(false)

  const [unbanTarget, setUnbanTarget] = useState<AdminUser | null>(null)
  const [unbanning, setUnbanning] = useState(false)

  const [logoutTarget, setLogoutTarget] = useState<AdminUser | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const [detailUserId, setDetailUserId] = useState<string | null>(null)

  const [exportOpen, setExportOpen] = useState(false)
  const [exportCols, setExportCols] = useState<Set<string>>(new Set(ALL_EXPORT_COLUMNS.map(c => c.key)))
  const [exporting, setExporting] = useState(false)

  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(() => {
    try {
      const stored = localStorage.getItem(COLUMN_PREFS_KEY)
      if (stored) {
        const parsed: unknown = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return new Set(parsed.filter((k): k is ColumnKey => VALID_KEYS.has(k as string)))
        }
      }
    } catch { /* ignore */ }
    return new Set<ColumnKey>()
  })

  const toggleCol = (key: ColumnKey) => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(Array.from(next)))
      return next
    })
  }

  const fetchUsers = useCallback(async (query?: string, activeFilter?: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminService.listUsers(query || undefined, activeFilter || undefined, PAGE_SIZE, 0)
      setUsers(data.users)
      setTotal(data.total)
      setHasMore(data.has_more)
    } catch {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers(undefined, filter) }, [fetchUsers, filter])

  const handleSearch = () => fetchUsers(search, filter)

  const handleLoadMore = async () => {
    setLoadingMore(true)
    try {
      const data = await adminService.listUsers(search || undefined, filter || undefined, PAGE_SIZE, users.length)
      setUsers((prev) => [...prev, ...data.users])
      setHasMore(data.has_more)
    } catch {
      setError('Failed to load more users')
    } finally {
      setLoadingMore(false)
    }
  }

  const toggleFilter = (f: string) => {
    setSearch('')
    setFilter((prev) => (prev === f ? null : f))
  }

  const updateUser = (updated: AdminUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
  }

  const handleGrant = async () => {
    if (!grantTarget) return
    setGranting(true)
    try {
      const duration = grantDuration ? parseInt(grantDuration) : undefined
      const updated = await adminService.grantSubscription(grantTarget.id, { plan_type: grantPlan, duration_days: duration })
      updateUser(updated)
      setGrantTarget(null)
      setGrantDuration('')
    } catch { setError('Failed to grant subscription') } finally { setGranting(false) }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      const updated = await adminService.revokeSubscription(revokeTarget.id)
      updateUser(updated)
      setRevokeTarget(null)
    } catch { setError('Failed to revoke subscription') } finally { setRevoking(false) }
  }

  const handleBan = async () => {
    if (!banTarget || !banReason.trim()) return
    setBanning(true)
    try {
      const updated = await adminService.banUser(banTarget.id, banReason.trim())
      updateUser(updated)
      setBanTarget(null)
      setBanReason('')
    } catch { setError('Failed to ban user') } finally { setBanning(false) }
  }

  const handleUnban = async () => {
    if (!unbanTarget) return
    setUnbanning(true)
    try {
      const updated = await adminService.unbanUser(unbanTarget.id)
      updateUser(updated)
      setUnbanTarget(null)
    } catch { setError('Failed to unban user') } finally { setUnbanning(false) }
  }

  const handleForceLogout = async () => {
    if (!logoutTarget) return
    setLoggingOut(true)
    try {
      const updated = await adminService.forceLogout(logoutTarget.id)
      updateUser(updated)
      setLogoutTarget(null)
    } catch { setError('Failed to force logout') } finally { setLoggingOut(false) }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await adminService.exportUsers(
        Array.from(exportCols),
        search || undefined,
        filter || undefined,
      )
      setExportOpen(false)
    } catch {
      setError('Failed to export users')
    } finally {
      setExporting(false)
    }
  }

  const toggleExportCol = (key: string) => {
    setExportCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allSelected = exportCols.size === ALL_EXPORT_COLUMNS.length
  const toggleAll = () => {
    setExportCols(allSelected ? new Set() : new Set(ALL_EXPORT_COLUMNS.map(c => c.key)))
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} total{filter ? ` (filtered: ${filter})` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Columns className="w-3.5 h-3.5" />
                Columns
                {visibleCols.size > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium px-1.5 py-0">
                    {visibleCols.size}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {TOGGLE_COLUMNS.map(col => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={visibleCols.has(col.key)}
                  onCheckedChange={() => toggleCol(col.key)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => { setExportCols(new Set(ALL_EXPORT_COLUMNS.map(c => c.key))); setExportOpen(true) }} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchUsers(search, filter)} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-2 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by phone or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9"
              disabled={filter === 'abuse'}
            />
            {search && (
              <button onClick={() => { setSearch(''); fetchUsers('', filter) }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button onClick={handleSearch}>Search</Button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => toggleFilter('abuse')}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              filter === 'abuse'
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            <AlertTriangle className="w-3 h-3" />Abuse
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* User table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {filter === 'abuse' ? 'No users with abuse events' : search ? 'No users match your search' : 'No users found'}
        </div>
      ) : (
        <div className="border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Subscription</th>
                <th className="text-left px-4 py-3 font-medium">Trial</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
                {TOGGLE_COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                  <th key={col.key} className="text-left px-4 py-3 font-medium whitespace-nowrap">{col.label}</th>
                ))}
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => {
                const sub = u.subscription
                const isActive = sub?.status === 'active' || sub?.status === 'authenticated'
                const isBanned = !u.is_active
                return (
                  <tr key={u.id} className={cn('hover:bg-muted/30 transition-colors', isBanned && 'bg-destructive/5')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {u.is_online && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />}
                        <span className="font-medium">{u.name || 'Unnamed'}</span>
                        {u.is_admin && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">admin</Badge>}
                        {isBanned && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Banned</Badge>}
                        {u.abuse_score != null && (
                          <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                            <AlertTriangle className="w-3 h-3" />{u.abuse_score}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {u.phone || 'No phone'}
                        {u.business && <span className="ml-1.5 text-muted-foreground/60">&middot; {u.business}</span>}
                      </p>
                      {isBanned && u.ban_reason && (
                        <p className="text-[10px] text-destructive/70 mt-0.5 truncate max-w-[240px]">{u.ban_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sub?.status || null} />
                      {sub && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          {sub.plan_type && <span className="capitalize">{sub.plan_type}</span>}
                          {sub.current_period_end && <span>Exp {formatDate(sub.current_period_end)}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TrialBadge user={u} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(u.created_at)}</td>
                    {visibleCols.has('last_login') && (
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(u.last_login)}</td>
                    )}
                    {visibleCols.has('onboarded') && (
                      <td className="px-4 py-3">
                        {u.onboarding_complete
                          ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Yes</span>
                          : <span className="text-xs text-muted-foreground">No</span>
                        }
                      </td>
                    )}
                    {visibleCols.has('plan_type') && (
                      <td className="px-4 py-3 text-muted-foreground">
                        {sub?.plan_type
                          ? <span className="capitalize text-sm">{sub.plan_type}</span>
                          : <span className="text-xs">&mdash;</span>
                        }
                      </td>
                    )}
                    {visibleCols.has('expiry') && (
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(sub?.current_period_end ?? null)}</td>
                    )}
                    {visibleCols.has('account_active') && (
                      <td className="px-4 py-3">
                        {u.is_active
                          ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Active</span>
                          : <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive">Inactive</span>
                        }
                      </td>
                    )}
                    {visibleCols.has('online_now') && (
                      <td className="px-4 py-3">
                        {u.is_online
                          ? <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Online</span>
                          : <span className="text-xs text-muted-foreground">Offline</span>
                        }
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {!u.is_admin && (
                          <>
                            <Button size="sm" variant={isActive ? 'outline' : 'default'} className="h-7 text-xs gap-1"
                              onClick={() => { setGrantTarget(u); setGrantPlan('annual'); setGrantDuration('') }}>
                              <UserCheck className="w-3.5 h-3.5" />Grant
                            </Button>
                            {sub && isActive && (
                              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
                                onClick={() => setRevokeTarget(u)}>
                                <UserX className="w-3.5 h-3.5" />Revoke
                              </Button>
                            )}
                            {!isBanned ? (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={() => { setBanTarget(u); setBanReason('') }}>
                                <Ban className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                                onClick={() => setUnbanTarget(u)}>
                                <ShieldOff className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setLogoutTarget(u)}>
                              <LogOut className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDetailUserId(u.id)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {!loading && hasMore && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : `Load more (${users.length} of ${total})`}
          </Button>
        </div>
      )}

      {/* Grant Dialog */}
      <Dialog open={!!grantTarget} onOpenChange={(open) => !open && setGrantTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Grant Subscription</DialogTitle>
            <DialogDescription>Grant access to <span className="font-medium text-foreground">{grantTarget?.name || grantTarget?.phone}</span></DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Plan Type</label>
              <div className="flex gap-2">
                {(['annual', 'monthly'] as const).map((plan) => (
                  <button key={plan} onClick={() => setGrantPlan(plan)}
                    className={cn('flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                      grantPlan === plan ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/50')}>
                    {plan === 'annual' ? 'Annual (365d)' : 'Monthly (30d)'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Custom Duration (days)</label>
              <Input type="number" placeholder={grantPlan === 'annual' ? '365' : '30'} value={grantDuration} onChange={(e) => setGrantDuration(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Leave empty for default</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantTarget(null)}>Cancel</Button>
            <Button onClick={handleGrant} disabled={granting}>
              {granting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Granting...</> : 'Grant Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Dialog */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke Subscription</DialogTitle>
            <DialogDescription>Immediately revoke access for <span className="font-medium text-foreground">{revokeTarget?.name || revokeTarget?.phone}</span>.{revokeTarget?.subscription?.razorpay_subscription_id && ' The Razorpay subscription will also be cancelled.'}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Revoking...</> : 'Revoke Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban Dialog */}
      <Dialog open={!!banTarget} onOpenChange={(open) => !open && setBanTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>Ban <span className="font-medium text-foreground">{banTarget?.name || banTarget?.phone}</span>. They will be force-logged-out and unable to sign in.</DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium mb-2 block">Reason</label>
            <Input placeholder="Reason for banning..." value={banReason} onChange={(e) => setBanReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBan} disabled={banning || !banReason.trim()}>
              {banning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Banning...</> : 'Ban User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unban Dialog */}
      <Dialog open={!!unbanTarget} onOpenChange={(open) => !open && setUnbanTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unban User</DialogTitle>
            <DialogDescription>Unban <span className="font-medium text-foreground">{unbanTarget?.name || unbanTarget?.phone}</span>?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnbanTarget(null)}>Cancel</Button>
            <Button onClick={handleUnban} disabled={unbanning}>
              {unbanning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Unbanning...</> : 'Unban User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Logout Dialog */}
      <Dialog open={!!logoutTarget} onOpenChange={(open) => !open && setLogoutTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Force Logout</DialogTitle>
            <DialogDescription>Force logout <span className="font-medium text-foreground">{logoutTarget?.name || logoutTarget?.phone}</span>? This will not ban them.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogoutTarget(null)}>Cancel</Button>
            <Button onClick={handleForceLogout} disabled={loggingOut}>
              {loggingOut ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Logging out...</> : 'Force Logout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export CSV Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Export CSV</DialogTitle>
            <DialogDescription>
              Export <span className="font-medium text-foreground">{total.toLocaleString()} users</span>
              {search && <> matching &ldquo;{search}&rdquo;</>}
              {filter && <> (filter: {filter})</>}
            </DialogDescription>
          </DialogHeader>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Columns</span>
              <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ALL_EXPORT_COLUMNS.map((col) => (
                <button key={col.key} type="button" onClick={() => toggleExportCol(col.key)} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted cursor-pointer text-left">
                  <span className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                    exportCols.has(col.key) ? 'bg-primary border-primary' : 'border-border'
                  )}>
                    {exportCols.has(col.key) && <Check className="w-3 h-3 text-primary-foreground" />}
                  </span>
                  {col.label}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button onClick={handleExport} disabled={exporting || exportCols.size === 0}>
              {exporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exporting...</> : `Export ${total.toLocaleString()} users`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Detail Panel */}
      <UserDetailPanel userId={detailUserId} onClose={() => setDetailUserId(null)} />
    </div>
  )
}
