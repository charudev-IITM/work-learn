import { useState, useEffect } from 'react'
import { Loader2, Shield, List, Bell, AlertTriangle, Clock } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet'
import { Badge } from '../ui/badge'
import { adminService, type AdminUserDetail as AdminUserDetailData } from '../../services/admin'
import { cn } from '../../lib/cn'
import { formatDateTime } from '../../lib/format'

interface Props {
  userId: string | null
  onClose: () => void
}

function TrialStatusBadge({ status, daysLeft }: { status: string | null; daysLeft: number | null }) {
  if (!status || status === 'not_claimed') return <span className="font-medium">Not claimed</span>
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        Active ({daysLeft}d left)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
      Expired
    </span>
  )
}

export function UserDetailPanel({ userId, onClose }: Props) {
  const [data, setData] = useState<AdminUserDetailData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId) { setData(null); return }
    let active = true
    setLoading(true)
    adminService.getUserDetail(userId)
      .then((d) => { if (active) setData(d) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId])

  const u = data?.user

  return (
    <Sheet open={!!userId} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : u ? (
          <>
            <SheetHeader className="mb-6">
              <SheetTitle className="flex items-center gap-2">
                {u.is_online && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />}
                {u.name || 'Unnamed'}
                {!u.is_active && <Badge variant="destructive" className="text-[10px]">Banned</Badge>}
                {u.is_admin && <Badge variant="secondary" className="text-[10px]">Admin</Badge>}
              </SheetTitle>
              <SheetDescription>{u.phone || 'No phone'}</SheetDescription>
            </SheetHeader>

            <Section title="Profile">
              {u.business && <InfoRow label="Company" value={u.business} />}
              <InfoRow label="Joined" value={formatDateTime(u.created_at)} />
              <InfoRow label="Last Login" value={formatDateTime(u.last_login)} />
              <InfoRow label="Onboarded" value={u.onboarding_complete ? 'Yes' : 'No'} />
              {u.ban_reason && <InfoRow label="Ban Reason" value={u.ban_reason} />}
              {u.banned_at && <InfoRow label="Banned At" value={formatDateTime(u.banned_at)} />}
            </Section>

            {data.trial_started_at && (
              <Section title="Trial" icon={<Clock className="w-3.5 h-3.5" />}>
                <InfoRow label="Started" value={formatDateTime(data.trial_started_at)} />
                <InfoRow label="Ends" value={formatDateTime(data.trial_ends_at)} />
                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-muted-foreground">Status</span>
                  <TrialStatusBadge status={u.trial_status} daysLeft={u.trial_days_left} />
                </div>
              </Section>
            )}

            {u.subscription && (
              <Section title="Subscription">
                <InfoRow label="Status" value={u.subscription.status} />
                <InfoRow label="Plan" value={u.subscription.plan_type || '-'} />
                <InfoRow label="Expires" value={formatDateTime(u.subscription.current_period_end)} />
                {u.subscription.razorpay_subscription_id && (
                  <InfoRow label="Razorpay ID" value={u.subscription.razorpay_subscription_id} />
                )}
              </Section>
            )}

            {data.sessions.length > 0 && (
              <Section title="Recent Sessions" icon={<Shield className="w-3.5 h-3.5" />}>
                <div className="space-y-2">
                  {data.sessions.map((s) => (
                    <div key={s.id} className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate">{s.device_hint || 'Unknown device'}</span>
                        {s.revoked_at && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-destructive border-destructive/30">Revoked</Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground flex gap-4">
                        <span>{s.ip_address || 'No IP'}</span>
                        <span>{formatDateTime(s.created_at)}</span>
                      </div>
                      {s.revoke_reason && (
                        <span className="text-muted-foreground/60">{s.revoke_reason}</span>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {data.watchlists.length > 0 && (
              <Section title="Watchlists" icon={<List className="w-3.5 h-3.5" />}>
                <div className="space-y-1">
                  {data.watchlists.map((w) => (
                    <div key={w.id} className="flex items-center justify-between text-sm py-1.5">
                      <span>{w.name}</span>
                      <span className="text-muted-foreground">{w.script_count} scripts</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {data.alerts.length > 0 && (
              <Section title="Alerts" icon={<Bell className="w-3.5 h-3.5" />}>
                <div className="space-y-1">
                  {data.alerts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm py-1.5">
                      <span className="truncate">{a.dealer_name} / {a.script_name}</span>
                      <span className={cn('text-xs', a.is_active ? 'text-emerald-500' : 'text-muted-foreground')}>
                        {a.rate_type} {a.condition} {a.threshold}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {(data.abuse_score !== null || data.abuse_events.length > 0) && (
              <Section title="Abuse" icon={<AlertTriangle className="w-3.5 h-3.5" />}>
                {data.abuse_score !== null && <InfoRow label="Score" value={String(data.abuse_score)} />}
                {data.abuse_events.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {data.abuse_events.map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-sm py-1">
                        <span className="truncate">{e.signal} ({e.score_delta > 0 ? '+' : ''}{e.score_delta})</span>
                        <span className="text-muted-foreground text-xs">{formatDateTime(e.occurred_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>User Detail</SheetTitle>
            <SheetDescription>Failed to load user details.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
        {icon}{title}
      </h3>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  )
}
