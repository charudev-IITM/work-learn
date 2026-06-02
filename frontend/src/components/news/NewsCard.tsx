import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { getRelativeTime } from '@comp-intel/shared/lib/formatters';
import { cn } from '../../lib/cn';
import { NewsArticle } from '@comp-intel/shared/types/news';
import { Badge } from '../ui/badge';

interface NewsCardProps {
  article: NewsArticle;
}

const SOURCE_LABELS: Record<string, string> = {
  reuters: 'Reuters',
  moneycontrol: 'Moneycontrol',
  googlenews: 'Google News',
};

const SENTIMENT_STYLES: Record<string, string> = {
  Bullish: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  Bearish: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  Neutral: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
};

export function NewsCard({ article }: NewsCardProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = !!article.imageUrl && !imgError;

  return (
    <a
      href={article.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block bg-card rounded-xl shadow-sm cursor-pointer active:scale-[0.99] transition-transform",
        "backdrop-blur-sm bg-white/95 dark:bg-gray-900/95",
        "ring-1 ring-gray-200/50 dark:ring-gray-700/50",
        "no-underline text-foreground",
      )}
    >
      <div className="p-4">
        {/* Source + time + sentiment row */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-primary">
            {SOURCE_LABELS[article.source] || article.source}
          </span>
          <span className="text-xs text-muted-foreground">
            {getRelativeTime(article.publishedAt)}
          </span>
          <div className="flex-1" />
          {article.tagSentiment && (
            <span className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
              SENTIMENT_STYLES[article.tagSentiment] || SENTIMENT_STYLES.Neutral,
            )}>
              {article.tagSentiment}
            </span>
          )}
        </div>

        {/* Title + Summary + optional Thumbnail */}
        <div className={cn("flex gap-3", showImage && "items-start")}>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold leading-snug mb-1.5 line-clamp-2">
              {article.title}
            </h3>
            {article.summary && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-2">
                {article.summary}
              </p>
            )}
          </div>
          {showImage && (
            <img
              src={article.imageUrl!}
              alt=""
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg shrink-0"
            />
          )}
        </div>

        {/* Tags + author row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {article.tagCommodity && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
              {article.tagCommodity}
            </Badge>
          )}
          {article.tagTopic && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
              {article.tagTopic}
            </Badge>
          )}
          {article.tagGeography && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
              {article.tagGeography}
            </Badge>
          )}
          <div className="flex-1" />
          {article.author && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              {article.author}
            </span>
          )}
          <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
        </div>
      </div>
    </a>
  );
}
