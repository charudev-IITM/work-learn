import { ExternalLink } from 'lucide-react'
import type { GoldieNewsCardsMessage } from '../../../types/goldie'
import { getRelativeTime } from '@comp-intel/shared/lib/formatters'
import { cn } from '../../../lib/cn'

const SOURCE_LABELS: Record<string, string> = {
  reuters: 'Reuters',
  moneycontrol: 'Moneycontrol',
  googlenews: 'Google News',
}

export function NewsCards({ message }: { message: GoldieNewsCardsMessage }) {
  const { articles } = message
  if (!articles.length) return null

  return (
    <div className="flex items-start gap-2 px-1">
      <div className="w-7 h-7 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-sm">📰</span>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {articles.map((article, i) => (
          <a
            key={i}
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "block rounded-xl p-3 no-underline transition-colors",
              "bg-white/5 dark:bg-white/[0.03]",
              "ring-1 ring-gray-200/30 dark:ring-gray-700/30",
              "hover:ring-amber-400/40 hover:bg-amber-50/5 dark:hover:bg-amber-950/10",
              "active:scale-[0.99] transition-all",
            )}
          >
            {/* Source + time row */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold text-amber-500 dark:text-amber-400">
                {SOURCE_LABELS[article.source] || article.source}
              </span>
              {article.published_at && (
                <span className="text-[11px] text-muted-foreground">
                  {getRelativeTime(article.published_at)}
                </span>
              )}
              <div className="flex-1" />
              <ExternalLink className="w-3 h-3 text-muted-foreground/50 shrink-0" />
            </div>

            {/* Title */}
            <h4 className="text-[13px] font-semibold leading-snug line-clamp-2 text-foreground">
              {article.title}
            </h4>

            {/* Summary */}
            {article.summary && (
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mt-1">
                {article.summary}
              </p>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}
