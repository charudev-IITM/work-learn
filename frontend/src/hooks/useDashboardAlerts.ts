import { useState, useEffect, useCallback, useRef } from 'react'
import { alertService } from '@comp-intel/shared/services/alerts'
import { PriceAlert } from '@comp-intel/shared/types/alerts'

export interface DashboardAlertsData {
  activeCount: number
  recentTriggered: PriceAlert[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useDashboardAlerts(): DashboardAlertsData {
  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null)
      const data = await alertService.getAlerts()
      if (mountedRef.current) setAlerts(data)
    } catch (err: any) {
      if (mountedRef.current) setError(err.message || 'Failed to load alerts')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  const activeCount = alerts.filter(a => a.isActive).length

  const recentTriggered = alerts
    .filter(a => a.lastTriggeredAt !== null)
    .sort((a, b) =>
      new Date(b.lastTriggeredAt!).getTime() - new Date(a.lastTriggeredAt!).getTime()
    )
    .slice(0, 3)

  return { activeCount, recentTriggered, loading, error, refetch: fetchAlerts }
}
