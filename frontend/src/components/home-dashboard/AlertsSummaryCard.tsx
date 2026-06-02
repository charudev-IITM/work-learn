import { Bell, ChevronRight } from 'lucide-react'
import { DashboardAlertsData } from '../../hooks/useDashboardAlerts'
import { formatCurrency, getRelativeTime } from '@comp-intel/shared/lib/formatters'
import { useNavigation } from '../../contexts/NavigationContext'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../../lib/cn'

interface AlertsSummaryCardProps {
  data: DashboardAlertsData
}

export function AlertsSummaryCard({ data }: AlertsSummaryCardProps) {
  const { activeCount, recentTriggered, loading } = data
  const { navigate } = useNavigation()

  return (
    <button
      onClick={() => navigate('alerts')}
      className={cn(
        "w-full text-left rounded-2xl transition-all active:scale-[0.99] flex overflow-hidden",
        "bg-white border border-gray-200",
        "border-l-[3px] border-l-gray-950",
        "dark:bg-white/[0.07] dark:border-white/[0.08] dark:border-l-white/[0.08]",
        "dark:backdrop-blur-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
      )}
    >
      <div className="flex-1">
      {/* Header — compact */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Bell className="w-3.5 h-3.5 text-gray-950 dark:text-indigo-400" />
          <span className="text-xs font-bold text-gray-950 dark:text-white">Price Alerts</span>
          {activeCount > 0 && (
            <span className={cn(
              "inline-flex items-center justify-center min-w-4 h-4 px-1 text-[9px] font-bold rounded-md",
              "bg-gray-950 text-white dark:bg-indigo-500 dark:text-white dark:shadow-[0_0_8px_rgba(99,102,241,0.4)]"
            )}>
              {activeCount}
            </span>
          )}
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-white/25" />
      </div>

      {/* Body — tighter */}
      <div className="px-3 py-2">
        {loading ? (
          <AlertsSkeleton />
        ) : recentTriggered.length === 0 ? (
          <p className="text-[10px] text-gray-400 dark:text-white/35">
            {activeCount > 0
              ? `${activeCount} active alert${activeCount !== 1 ? 's' : ''}, none triggered yet`
              : 'No alerts configured. Tap to set up price alerts.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {recentTriggered.slice(0, 2).map(alert => (
              <div key={alert.id} className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate text-gray-950 dark:text-white/85">{alert.dealerName}</p>
                  <p className="text-[9px] text-gray-400 dark:text-white/35 truncate">
                    {alert.scriptName} · {alert.rateType} {alert.condition} {formatCurrency(alert.threshold)}
                  </p>
                </div>
                <span className="text-[9px] text-gray-300 dark:text-white/25 shrink-0 ml-2">
                  {getRelativeTime(alert.lastTriggeredAt!)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </button>
  )
}

function AlertsSkeleton() {
  return (
    <div className="space-y-1.5">
      {[1, 2].map(i => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-2.5 w-12 ml-auto" />
        </div>
      ))}
    </div>
  )
}
