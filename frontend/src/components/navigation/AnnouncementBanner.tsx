import { useState, useEffect } from 'react'
import { Megaphone, X, AlertTriangle, Wrench } from 'lucide-react'
import { cn } from '../../lib/cn'

interface Announcement {
  message: string
  announcement_type: 'info' | 'warning' | 'maintenance'
  timestamp: string
}

const ICON_MAP = {
  info: Megaphone,
  warning: AlertTriangle,
  maintenance: Wrench,
}

const STYLE_MAP = {
  info: 'bg-primary/10 text-primary border-primary/20',
  warning: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900',
  maintenance: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900',
}

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)

  useEffect(() => {
    const handler = (e: CustomEvent<Announcement>) => {
      setAnnouncement(e.detail)
    }
    window.addEventListener('admin:announcement', handler as EventListener)
    return () => window.removeEventListener('admin:announcement', handler as EventListener)
  }, [])

  if (!announcement) return null

  const Icon = ICON_MAP[announcement.announcement_type] || Megaphone
  const style = STYLE_MAP[announcement.announcement_type] || STYLE_MAP.info

  return (
    <div className={cn('flex items-center gap-2 px-4 py-2 text-sm border-b shrink-0', style)}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 truncate">{announcement.message}</span>
      <button
        onClick={() => setAnnouncement(null)}
        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
