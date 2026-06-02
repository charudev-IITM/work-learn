import { useState } from 'react'
import type { GoldieConfirmationMessage } from '../../../types/goldie'
import { cn } from '../../../lib/cn'

interface ConfirmationCardProps {
  message: GoldieConfirmationMessage
  onResolve: (nonce: string, accepted: boolean) => void
}

export function ConfirmationCard({ message, onResolve }: ConfirmationCardProps) {
  const [loading, setLoading] = useState(false)

  const handleResolve = (accepted: boolean) => {
    setLoading(true)
    onResolve(message.nonce, accepted)
  }

  const isPending = message.status === 'pending'
  const isAccepted = message.status === 'accepted'
  const isRejected = message.status === 'rejected'

  return (
    <div className="flex justify-start">
      <div className="flex-shrink-0 w-7 h-7 mr-2" />
      <div className="max-w-[85%] rounded-xl border border-amber-300/50 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden">
        {/* Left accent bar */}
        <div className="flex">
          <div className="w-1 bg-gradient-to-b from-amber-400 to-yellow-500 flex-shrink-0" />
          <div className="p-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground mb-2">{message.summary}</p>

            {/* Details grid */}
            <div className="space-y-1 mb-3">
              {Object.entries(message.details).map(([key, value]) => (
                <div key={key} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground flex-shrink-0">{key}:</span>
                  <span className="text-foreground font-medium truncate">{String(value)}</span>
                </div>
              ))}
            </div>

            {/* Action buttons / status */}
            {isPending && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleResolve(true)}
                  disabled={loading}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors',
                    'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700',
                    'disabled:opacity-50',
                  )}
                >
                  {loading ? 'Processing...' : 'Confirm'}
                </button>
                <button
                  onClick={() => handleResolve(false)}
                  disabled={loading}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors',
                    'bg-muted text-muted-foreground hover:bg-muted/80 active:bg-muted/60',
                    'disabled:opacity-50',
                  )}
                >
                  Cancel
                </button>
              </div>
            )}
            {isAccepted && (
              <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Done
              </div>
            )}
            {isRejected && (
              <div className="text-xs text-muted-foreground font-medium">Cancelled</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
