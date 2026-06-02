import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { GoldieThinkingTextMessage } from '../../../types/goldie'
import { cn } from '../../../lib/cn'

interface ThinkingTextProps {
  message: GoldieThinkingTextMessage
}

export function ThinkingText({ message }: ThinkingTextProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex justify-start">
      <div className="flex-shrink-0 w-7 h-7 mr-2" />
      <div className="min-w-0 max-w-[85%]">
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 text-xs text-muted-foreground/70',
            'hover:text-muted-foreground transition-colors',
          )}
        >
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 transition-transform duration-200',
              expanded && 'rotate-90',
            )}
          />
          <span>Thought for a moment</span>
        </button>

        {expanded && (
          <div className="mt-1.5 ml-5 text-xs text-muted-foreground/60 leading-relaxed whitespace-pre-wrap border-l-2 border-muted-foreground/15 pl-3">
            {message.content}
          </div>
        )}
      </div>
    </div>
  )
}
