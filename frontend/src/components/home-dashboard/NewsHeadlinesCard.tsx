import { Newspaper, ChevronRight, ExternalLink } from 'lucide-react'
import { DashboardNewsData } from '../../hooks/useDashboardNews'
import { getRelativeTime } from '@comp-intel/shared/lib/formatters'
import { useNavigation } from '../../contexts/NavigationContext'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../../lib/cn'

const SOURCE_LABELS: Record<string, string> = {
  reuters: 'Reuters',
  moneycontrol: 'MC',
}


interface NewsHeadlinesCardProps {
  data: DashboardNewsData
}

export function NewsHeadlinesCard({ data }: NewsHeadlinesCardProps) {
  const { articles, loading } = data
  const { navigate } = useNavigation()

  // Show max 2 headlines for compact layout
  const visibleArticles = articles.slice(0, 2)

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden flex",
        "bg-white border border-gray-200",
        "border-l-[3px] border-l-amber-500",
        "dark:bg-white/[0.07] dark:border-white/[0.08] dark:border-l-white/[0.08]",
        "dark:backdrop-blur-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
      )}
    >
      <div className="flex-1">
      {/* Header — compact */}
      <button
        onClick={() => navigate('news')}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-white/[0.06]"
      >
        <div className="flex items-center gap-2">
          <Newspaper className="w-3.5 h-3.5 text-gray-950 dark:text-indigo-400" />
          <span className="text-xs font-bold text-gray-950 dark:text-white">Market News</span>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-white/25" />
      </button>

      {/* Headlines — tighter */}
      <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
        {loading ? (
          <NewsSkeleton />
        ) : visibleArticles.length === 0 ? (
          <p className="text-[10px] text-gray-400 dark:text-white/35 px-3 py-2">No recent articles</p>
        ) : (
          visibleArticles.map((article) => (
            <a
              key={article.id}
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-white/[0.03] dark:active:bg-white/[0.05] transition-colors no-underline text-foreground"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[8px] font-bold tracking-wider uppercase text-gray-950 dark:text-indigo-300">
                    {SOURCE_LABELS[article.source] || article.source}
                  </span>
                  {article.tagSentiment && (
                    <span className={cn(
                      "text-[8px] font-semibold px-1 py-0.5 rounded",
                      article.tagSentiment === 'Bullish'
                        ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                        : article.tagSentiment === 'Bearish'
                          ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                          : "bg-gray-50 text-gray-500 dark:bg-white/[0.06] dark:text-white/40"
                    )}>
                      {article.tagSentiment}
                    </span>
                  )}
                  <span className="text-[9px] text-gray-300 dark:text-white/25 ml-auto shrink-0">
                    {getRelativeTime(article.publishedAt)}
                  </span>
                </div>
                <p className="text-[11px] font-medium leading-snug line-clamp-2 text-gray-950 dark:text-white/80">
                  {article.title}
                </p>
              </div>
              <ExternalLink className="w-3 h-3 text-gray-300 dark:text-white/20 shrink-0 mt-0.5" />
            </a>
          ))
        )}
      </div>

      {/* Footer */}
      {!loading && articles.length > 0 && (
        <button
          onClick={() => navigate('news')}
          className="w-full text-[10px] text-gray-950 dark:text-indigo-300 font-semibold py-1.5 text-center hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors border-t border-gray-100 dark:border-white/[0.06]"
        >
          See all news
        </button>
      )}
      </div>
    </div>
  )
}

function NewsSkeleton() {
  return (
    <>
      {[1, 2].map(i => (
        <div key={i} className="px-3 py-2 space-y-1">
          <Skeleton className="h-2 w-14" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-3/4" />
        </div>
      ))}
    </>
  )
}
