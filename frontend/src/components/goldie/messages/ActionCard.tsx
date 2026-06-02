import { useCallback } from 'react'
import { Calculator, Check, Loader2 } from 'lucide-react'
import type { GoldieActionCardMessage, ChatAction } from '../../../types/goldie'
import { calculatorService } from '@comp-intel/shared/services/calculator'
import { cn } from '../../../lib/cn'

interface ActionCardProps {
  message: GoldieActionCardMessage
  dispatch: React.Dispatch<ChatAction>
}

export function ActionCard({ message, dispatch }: ActionCardProps) {
  const handleSave = useCallback(async () => {
    if (message.status !== 'available') return
    dispatch({ type: 'UPDATE_ACTION_CARD', id: message.id, status: 'saving' })

    try {
      await calculatorService.createFormula({
        name: message.data.name,
        description: message.data.description,
        ast: message.data.ast,
      })
      dispatch({ type: 'UPDATE_ACTION_CARD', id: message.id, status: 'saved' })
    } catch {
      dispatch({ type: 'UPDATE_ACTION_CARD', id: message.id, status: 'error' })
    }
  }, [message.id, message.status, message.data, dispatch])

  const isSaved = message.status === 'saved'
  const isSaving = message.status === 'saving'
  const isError = message.status === 'error'

  return (
    <div className="flex justify-start">
      <div className="flex-shrink-0 w-7 h-7 mr-2" />
      <button
        onClick={handleSave}
        disabled={isSaved || isSaving}
        className={cn(
          'group flex items-center gap-2.5 px-4 py-2.5 rounded-xl',
          'border transition-all duration-200',
          'active:scale-[0.98]',
          isSaved
            ? 'border-green-300/50 dark:border-green-700/50 bg-green-50/50 dark:bg-green-950/20'
            : isError
              ? 'border-red-300/50 dark:border-red-700/50 bg-red-50/50 dark:bg-red-950/20'
              : 'border-violet-300/50 dark:border-violet-700/40 bg-violet-50/50 dark:bg-violet-950/20 hover:bg-violet-100/60 dark:hover:bg-violet-900/30 cursor-pointer',
          (isSaved || isSaving) && 'cursor-default',
        )}
      >
        {/* Icon */}
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          'transition-colors duration-200',
          isSaved
            ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'
            : isError
              ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
              : 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400',
        )}>
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isSaved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Calculator className="w-4 h-4" />
          )}
        </div>

        {/* Label + formula name */}
        <div className="text-left min-w-0">
          <div className={cn(
            'text-xs font-semibold leading-none mb-0.5',
            isSaved
              ? 'text-green-700 dark:text-green-400'
              : isError
                ? 'text-red-700 dark:text-red-400'
                : 'text-violet-700 dark:text-violet-300',
          )}>
            {isSaved ? 'Saved to Calculator' : isError ? 'Failed to save' : message.label}
          </div>
          <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
            {message.data.name}
          </div>
        </div>

        {/* Sparkle indicator for available state */}
        {!isSaved && !isSaving && !isError && (
          <div className="text-violet-400 dark:text-violet-500 opacity-60 group-hover:opacity-100 transition-opacity ml-auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L13.09 7.26L18 6L14.74 9.74L20 12L14.74 14.26L18 18L13.09 16.74L12 22L10.91 16.74L6 18L9.26 14.26L4 12L9.26 9.74L6 6L10.91 7.26L12 2Z" />
            </svg>
          </div>
        )}
      </button>
    </div>
  )
}
