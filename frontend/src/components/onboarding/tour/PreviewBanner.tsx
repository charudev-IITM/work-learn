import { Sparkles, Clock } from 'lucide-react';
import { formatCountdown } from '@comp-intel/shared/lib/formatters';

interface PreviewBannerProps {
  remainingSeconds: number;
  onSubscribeTap: () => void;
}

export function PreviewBanner({ remainingSeconds, onSubscribeTap }: PreviewBannerProps) {
  const isUrgent = remainingSeconds <= 60;

  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium truncate">Exploring Spot Compare</span>
        <span className="flex items-center gap-1 text-xs font-mono opacity-90">
          <Clock className="w-3 h-3" />
          <span className={isUrgent ? 'animate-pulse font-bold' : ''}>
            {formatCountdown(remainingSeconds)}
          </span>
        </span>
      </div>
      <button
        onClick={onSubscribeTap}
        className="shrink-0 ml-3 px-4 py-1.5 bg-white text-amber-700 text-sm font-semibold rounded-full hover:bg-amber-50 active:bg-amber-100 transition-colors"
      >
        Subscribe
      </button>
    </div>
  );
}
