import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

interface AnimatedPriceProps {
  value: number | undefined;
  formatter: (value: number) => string;
  className?: string;
  showTrend?: boolean;
}

export function AnimatedPrice({ value, formatter, className, showTrend = false }: AnimatedPriceProps) {
  const [trendDirection, setTrendDirection] = useState<'up' | 'down' | null>(null);
  const prevValueRef = useRef<number | undefined>(value);
  const trendTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const prev = prevValueRef.current;
    if (prev !== undefined && value !== undefined && prev !== value) {
      setTrendDirection(value > prev ? 'up' : 'down');

      if (trendTimerRef.current) clearTimeout(trendTimerRef.current);
      trendTimerRef.current = setTimeout(() => setTrendDirection(null), 3000);
    }
    prevValueRef.current = value;
    return () => { if (trendTimerRef.current) clearTimeout(trendTimerRef.current); };
  }, [value]);

  if (value === undefined) {
    return <span className={className}>N/A</span>;
  }

  return (
    <span className={cn('relative inline-block', className)}>
      {formatter(value)}
      {showTrend && trendDirection && (
        <span className={cn(
          'absolute -right-2.5 top-1/2 -translate-y-1/2 w-0 h-0 border-x-[3px] border-x-transparent',
          trendDirection === 'up'
            ? 'border-b-[5px] border-b-green-600 dark:border-b-green-400'
            : 'border-t-[5px] border-t-red-600 dark:border-t-red-400'
        )} />
      )}
    </span>
  );
}
