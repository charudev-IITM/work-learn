import { useState, useRef, useEffect } from 'react'
import { Megaphone, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { adminService } from '../../services/admin'
import { cn } from '../../lib/cn'

type AnnouncementType = 'info' | 'warning' | 'maintenance'

const TYPES: { id: AnnouncementType; label: string; description: string }[] = [
  { id: 'info', label: 'Info', description: 'General information' },
  { id: 'warning', label: 'Warning', description: 'Important notice' },
  { id: 'maintenance', label: 'Maintenance', description: 'Scheduled downtime' },
]

const ANNOUNCEMENT_STYLES: Record<AnnouncementType, string> = {
  warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200',
  maintenance: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-200',
  info: 'bg-primary/5 border-primary/20 text-foreground',
}

export default function BroadcastPage() {
  const [message, setMessage] = useState('')
  const [type, setType] = useState<AnnouncementType>('info')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const sentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (sentTimerRef.current) clearTimeout(sentTimerRef.current)
  }, [])

  const handleSend = async () => {
    setConfirmOpen(false)
    if (!message.trim()) return
    setSending(true)
    setError(null)
    setSent(false)
    try {
      await adminService.broadcast({ message: message.trim(), type })
      setSent(true)
      setMessage('')
      if (sentTimerRef.current) clearTimeout(sentTimerRef.current)
      sentTimerRef.current = setTimeout(() => setSent(false), 5000)
    } catch {
      setError('Failed to send broadcast')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Broadcast</h1>
        <p className="text-sm text-muted-foreground mt-1">Send announcements to all connected users</p>
      </div>

      <div className="border rounded-xl p-6 space-y-6">
        {/* Type selector */}
        <div>
          <label className="text-sm font-medium mb-3 block">Announcement Type</label>
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={cn(
                  'flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors text-left',
                  type === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/50'
                )}
              >
                <div>{t.label}</div>
                <div className="text-xs text-muted-foreground font-normal mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Message input */}
        <div>
          <label className="text-sm font-medium mb-2 block">Message</label>
          <Input
            placeholder="Type your announcement..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground mt-1.5">{message.length}/500 characters</p>
        </div>

        {/* Preview */}
        {message.trim() && (
          <div>
            <label className="text-sm font-medium mb-2 block">Preview</label>
            <div className={cn('rounded-lg border p-3 text-sm', ANNOUNCEMENT_STYLES[type])}>
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 shrink-0" />
                <span>{message.trim()}</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {sent && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />Broadcast sent successfully
          </div>
        )}

        <Button onClick={() => setConfirmOpen(true)} disabled={sending || !message.trim()} className="w-full">
          {sending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
          ) : (
            <><Megaphone className="w-4 h-4 mr-2" />Send to all users</>
          )}
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Broadcast</DialogTitle>
            <DialogDescription>
              This will send a <span className="font-medium text-foreground">{type}</span> announcement to all currently connected users. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className={cn('rounded-lg border p-3 text-sm', ANNOUNCEMENT_STYLES[type])}>
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 shrink-0" />
              <span>{message.trim()}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleSend}>Send Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
