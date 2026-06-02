import { useState, useEffect } from 'react'
import { Loader2, ExternalLink, X, Inbox } from 'lucide-react'
import { Button } from '../ui/button'
import { adminService, type AdminDealerRequest } from '../../services/admin'
import { formatDate } from '../../lib/format'

export default function DealerRequestsPage() {
  const [requests, setRequests] = useState<AdminDealerRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    adminService.getDealerRequests()
      .then((data) => { if (active) setRequests(data) })
      .catch(() => { if (active) setError('Failed to load requests') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const handleDismiss = async (id: string) => {
    setDismissing(id)
    try {
      await adminService.dismissDealerRequest(id)
      setRequests((prev) => prev.filter((r) => r.id !== id))
    } catch {
      setError('Failed to dismiss request')
    } finally {
      setDismissing(null)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dealer Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">User-submitted dealer addition requests</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="w-10 h-10 mb-3 opacity-40" />
          <span>No dealer requests</span>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Dealer</th>
                <th className="text-left px-4 py-3 font-medium">URL</th>
                <th className="text-left px-4 py-3 font-medium">Requested By</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium">{r.dealer_name}</span>
                    {r.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{r.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <a href={r.dealer_url} target="_blank" rel="noopener noreferrer"
                      className="text-primary text-xs flex items-center gap-1 hover:underline truncate max-w-[200px]">
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      {r.dealer_url}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.user_name || r.user_phone || 'Unknown'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDismiss(r.id)}
                      disabled={dismissing === r.id}
                    >
                      {dismissing === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Dismiss'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
