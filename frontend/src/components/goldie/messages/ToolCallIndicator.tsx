import { Check } from 'lucide-react'
import type { GoldieToolCallMessage } from '../../../types/goldie'
import { cn } from '../../../lib/cn'

export function ToolCallIndicator({ message }: { message: GoldieToolCallMessage }) {
  const isComplete = message.status === 'complete'

  return (
    <div className="flex justify-start">
      <div className="flex-shrink-0 w-7 h-7 mr-2" />
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl border',
          isComplete
            ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/30 dark:border-amber-800/20'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200/50 dark:border-amber-800/30',
        )}
      >
        {isComplete ? (
          <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
        )}
        <span
          className={cn(
            'text-xs font-medium',
            isComplete
              ? 'text-amber-600/80 dark:text-amber-400/70'
              : 'text-amber-700 dark:text-amber-400',
          )}
        >
          {isComplete ? (message.resultSummary || message.toolLabel.replace('...', '')) : message.toolLabel}
        </span>
      </div>
    </div>
  )
}
