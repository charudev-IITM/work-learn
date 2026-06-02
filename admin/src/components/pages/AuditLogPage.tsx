import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { adminService, type AuditLogEntry } from '../../services/admin'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { formatDateTime } from '../../lib/format'

const PAGE_SIZE = 50

const ACTION_STYLES: Record<string, string> = {
  ban: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  unban: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  force_logout: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  grant_sub: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  revoke_sub: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  dismiss_request: 'bg-muted text-muted-foreground',
  broadcast: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEntries = useCallback(async (offset = 0, append = false) => {
    if (!append) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const data = await adminService.getAuditLog(PAGE_SIZE, offset)
      if (append) {
        setEntries((prev) => [...prev, ...data.entries])
      } else {
        setEntries(data.entries)
      }
      setTotal(data.total)
      setHasMore(data.has_more)
    } catch {
      setError('Failed to load audit log')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} total actions</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchEntries()}>
          <RefreshCw className="w-4 h-4 mr-2" />Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No audit log entries yet</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium">Admin</th>
                <th className="text-left px-4 py-3 font-medium">Target</th>
                <th className="text-left px-4 py-3 font-medium">Details</th>
                <th className="text-left px-4 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Badge className={`text-xs ${ACTION_STYLES[entry.action] || 'bg-muted text-muted-foreground'}`}>
                      {entry.action.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.admin_name || entry.admin_phone || '-'}</td>
                  <td className="px-4 py-3">{entry.target_user_name || entry.target_user_phone || '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                    {entry.details ? JSON.stringify(entry.details) : '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDateTime(entry.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && hasMore && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => fetchEntries(entries.length, true)} disabled={loadingMore}>
            {loadingMore ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</> : `Load more (${entries.length} of ${total})`}
          </Button>
        </div>
      )}
    </div>
  )
}
