import { useState, useEffect, useRef, useCallback } from 'react'
import { Users, CreditCard, Wifi, Bot, MessageSquare, Loader2, RefreshCw, Clock } from 'lucide-react'
import { adminService, type AdminOverview, type JourneyStats, type OnlineHistoryPoint } from '../../services/admin'
import { Button } from '../ui/button'
import { OnlineMiniSparkline, OnlineHistoryDialog } from '../charts/OnlineChart'

const REFRESH_INTERVAL = 30_000

type SinceFilter = '1d' | '7d' | '30d' | undefined
const SINCE_OPTIONS: { label: string; value: SinceFilter }[] = [
  { label: 'All Time', value: undefined },
  { label: '30 days', value: '30d' },
  { label: '7 days', value: '7d' },
  { label: 'Today', value: '1d' },
]

const FUNNEL_STAGES: { key: keyof JourneyStats; label: string; color: string; bg: string }[] = [
  { key: 'signed_up', label: 'Signed Up', color: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  { key: 'onboarded', label: 'Onboarded', color: 'bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  { key: 'trial_claimed', label: 'Trial Claimed', color: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  { key: 'subscribed', label: 'Subscribed', color: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
]

export default function OverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const activeRef = useRef(true)

  const [journey, setJourney] = useState<JourneyStats | null>(null)
  const [journeyLoading, setJourneyLoading] = useState(false)
  const [journeyError, setJourneyError] = useState(false)
  const [sinceFilter, setSinceFilter] = useState<SinceFilter>(undefined)
  const [onlineDialogOpen, setOnlineDialogOpen] = useState(false)
  const [sparklinePoints, setSparklinePoints] = useState<OnlineHistoryPoint[]>([])

  const fetchData = useCallback(async () => {
    try {
      const overview = await adminService.getOverview()
      if (activeRef.current) setData(overview)
    } catch { /* silent */ } finally {
      if (activeRef.current) setLoading(false)
    }
    // Sparkline — decorative, so fetch silently
    try {
      const hist = await adminService.getOnlineHistory('today')
      if (activeRef.current) setSparklinePoints(hist.points.slice(-180))
    } catch { /* silent */ }
  }, [])

  const fetchJourney = useCallback(async (since: SinceFilter) => {
    setJourneyLoading(true)
    setJourneyError(false)
    try {
      const stats = await adminService.getJourneyStats(since)
      setJourney(stats)
    } catch {
      setJourneyError(true)
    } finally {
      setJourneyLoading(false)
    }
  }, [])

  useEffect(() => {
    activeRef.current = true
    fetchData()
    fetchJourney(sinceFilter)
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL)
    return () => {
      activeRef.current = false
      clearInterval(intervalRef.current)
    }
  }, [fetchData, fetchJourney, sinceFilter])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) return null

  const stats = [
    { label: 'Total Users', value: data.total_users, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { label: 'Active Subscriptions', value: data.active_subscriptions, icon: CreditCard, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { label: 'Scrapers', value: data.total_scrapers, icon: Bot, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' },
    { label: 'Pending Requests', value: data.pending_dealer_requests, icon: MessageSquare, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30' },
  ]

  const pct = (n: number) => journey && journey.signed_up > 0 ? ((n / journey.signed_up) * 100).toFixed(1) : '0'
  const conversion = (current: number, previous: number) => previous > 0 ? ((current / previous) * 100).toFixed(1) + '%' : '-'

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Platform stats at a glance</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-xl border p-5 ${s.bg}`}>
            <div className="flex items-center gap-2 mb-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-sm text-muted-foreground">{s.label}</span>
            </div>
            <span className="text-3xl font-bold tabular-nums">{s.value.toLocaleString()}</span>
          </div>
        ))}
        {/* Online Now — clickable with sparkline */}
        <button
          onClick={() => setOnlineDialogOpen(true)}
          className="rounded-xl border p-5 bg-amber-50 dark:bg-amber-950/30 text-left hover:ring-2 hover:ring-amber-400/60 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="w-5 h-5 text-amber-500" />
            <span className="text-sm text-muted-foreground">Online Now</span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <span className="text-3xl font-bold tabular-nums">{data.online_users.toLocaleString()}</span>
            {sparklinePoints.length > 1 && (
              <OnlineMiniSparkline points={sparklinePoints} />
            )}
          </div>
        </button>
      </div>

      <OnlineHistoryDialog
        open={onlineDialogOpen}
        onClose={() => setOnlineDialogOpen(false)}
        currentCount={data.online_users}
      />

      {/* Journey Funnel */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">User Journey</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              {SINCE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setSinceFilter(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    sinceFilter === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => fetchJourney(sinceFilter)} disabled={journeyLoading}>
              <RefreshCw className={`w-3.5 h-3.5 ${journeyLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {journeyLoading && !journey ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : journeyError && !journey ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm mb-2">Failed to load journey stats</p>
            <Button variant="outline" size="sm" onClick={() => fetchJourney(sinceFilter)}>
              <RefreshCw className="w-3.5 h-3.5 mr-2" />Retry
            </Button>
          </div>
        ) : journey ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left — Table */}
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Stage</th>
                      <th className="text-right px-4 py-2.5 font-medium">Count</th>
                      <th className="text-right px-4 py-2.5 font-medium">% of Signups</th>
                      <th className="text-right px-4 py-2.5 font-medium">Conversion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {FUNNEL_STAGES.map((stage, i) => {
                      const count = journey[stage.key]
                      const prevCount = i > 0 ? journey[FUNNEL_STAGES[i - 1].key] : count
                      return (
                        <tr key={stage.key} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${stage.color}`} />
                            {stage.label}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">{count.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{pct(count)}%</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                            {i === 0 ? '-' : conversion(count, prevCount)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Right — Bar chart */}
              <div className="space-y-3 py-2">
                {FUNNEL_STAGES.map((stage) => {
                  const count = journey[stage.key]
                  const widthPct = journey.signed_up > 0 ? Math.max((count / journey.signed_up) * 100, 3) : 0
                  return (
                    <div key={stage.key}>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{stage.label}</span>
                        <span className="tabular-nums">{pct(count)}%</span>
                      </div>
                      <div className="h-9 bg-muted/40 rounded-lg overflow-hidden">
                        <div
                          className={`h-full ${stage.color} rounded-lg flex items-center px-3 transition-all duration-500`}
                          style={{ width: `${widthPct}%`, minWidth: count > 0 ? '48px' : '0' }}
                        >
                          <span className="text-white text-xs font-semibold tabular-nums">
                            {count.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Trial Active stat card — Online Now already shown in top stat cards */}
            <div className="mt-6">
              <div className="rounded-xl border p-5 bg-amber-50 dark:bg-amber-950/30 max-w-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <span className="text-sm text-muted-foreground">Trial Active</span>
                </div>
                <span className="text-3xl font-bold tabular-nums">{journey.trial_active.toLocaleString()}</span>
                <p className="text-xs text-muted-foreground mt-1">Users currently in trial period</p>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground/50 text-center mt-8">
        Auto-refreshes every 30s
      </p>
    </div>
  )
}
