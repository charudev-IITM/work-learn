import type { GoldieTextMessage, GoldieErrorMessage } from '../../../types/goldie'
import { cn } from '../../../lib/cn'
import { GoldieMarkdown } from './GoldieMarkdown'

export function GoldieMessage({ message }: { message: GoldieTextMessage | GoldieErrorMessage }) {
  const isError = message.kind === 'error'
  const content = message.content
  const isStreaming = message.kind === 'text' && message.status === 'streaming'

  return (
    <div className="flex justify-start">
      {/* Goldie avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center mr-2 mt-0.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2L14.09 8.26L20.18 8.63L15.54 12.74L16.82 18.77L12 15.4L7.18 18.77L8.46 12.74L3.82 8.63L9.91 8.26L12 2Z"
            fill="rgba(120, 53, 15, 0.8)"
          />
        </svg>
      </div>

      <div
        className={cn(
          'max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed',
          isError
            ? 'bg-destructive/10 text-destructive border border-destructive/20'
            : 'bg-muted text-foreground',
        )}
      >
        {isStreaming ? (
          <>
            <GoldieMarkdown content={content} />
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-amber-500 animate-pulse rounded-sm align-text-bottom" />
          </>
        ) : (
          <GoldieMarkdown content={content} />
        )}
      </div>
    </div>
  )
}
