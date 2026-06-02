import { useState, useEffect, useCallback } from 'react'
import { CreditCard, TrendingUp, TrendingDown, Loader2, RefreshCw } from 'lucide-react'
import { adminService, type SubscriptionAnalytics } from '../../services/admin'
import { Button } from '../ui/button'
import { formatDateTime } from '../../lib/format'

export default function SubscriptionsPage() {
  const [data, setData] = useState<SubscriptionAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const analytics = await adminService.getSubscriptionAnalytics()
      setData(analytics)
    } catch {
      setError('Failed to load subscription analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive">{error || 'No data'}</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Subscription Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Revenue and subscriber metrics</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Subscribers" value={data.total_active} icon={CreditCard} color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-950/30" />
        <StatCard label="MRR Estimate" value={`₹${data.mrr_estimate.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon={TrendingUp} color="text-blue-500" bg="bg-blue-50 dark:bg-blue-950/30" />
        <StatCard label="New (7d)" value={data.new_last_7d} subValue={`${data.new_last_30d} in 30d`} icon={TrendingUp} color="text-primary" bg="bg-primary/5" />
        <StatCard label="Cancelled (7d)" value={data.cancelled_last_7d} subValue={`${data.cancelled_last_30d} in 30d`} icon={TrendingDown} color="text-destructive" bg="bg-destructive/5" />
      </div>

      {/* By Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">By Plan</h2>
          <div className="space-y-3">
            {Object.entries(data.by_plan).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between">
                <span className="capitalize font-medium">{plan}</span>
                <span className="text-2xl font-bold tabular-nums">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
            <span>Total Created (pending)</span>
            <span>{data.total_created}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground mt-1">
            <span>Total Cancelled</span>
            <span>{data.total_cancelled}</span>
          </div>
        </div>

        {/* Recent Events */}
        <div className="border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Recent Events</h2>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {data.recent_events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent events</p>
            ) : (
              data.recent_events.map((event, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <div>
                    <span className="font-medium">{event.event_type}</span>
                    {event.plan_type && <span className="text-muted-foreground ml-2 capitalize">{event.plan_type}</span>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{event.user_phone || 'Unknown'}</div>
                    <div>{formatDateTime(event.processed_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, subValue, icon: Icon, color, bg }: {
  label: string; value: string | number; subValue?: string; icon: typeof CreditCard; color: string; bg: string
}) {
  return (
    <div className={`rounded-xl border p-5 ${bg}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="text-3xl font-bold tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</span>
      {subValue && <p className="text-xs text-muted-foreground mt-1">{subValue}</p>}
    </div>
  )
}
