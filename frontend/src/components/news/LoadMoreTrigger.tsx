import { useEffect, useRef } from 'react';
import { Skeleton } from '../ui/skeleton';

interface LoadMoreTriggerProps {
  onVisible: () => void;
  loading: boolean;
}

export function LoadMoreTrigger({ onVisible, loading }: LoadMoreTriggerProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          onVisible();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onVisible, loading]);

  return (
    <div ref={sentinelRef} className="py-3">
      {loading && (
        <div className="bg-card rounded-xl ring-1 ring-gray-200/50 dark:ring-gray-700/50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      )}
    </div>
  );
}
