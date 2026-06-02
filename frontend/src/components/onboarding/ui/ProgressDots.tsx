import { cn } from '../../../lib/cn';

interface ProgressDotsProps {
  current: number;
  total: number;
}

export function ProgressDots({ current, total }: ProgressDotsProps) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-full transition-all duration-300',
            i === current
              ? 'w-6 h-2 bg-amber-500'
              : i < current
                ? 'w-2 h-2 bg-amber-500/60'
                : 'w-2 h-2 bg-muted-foreground/20',
          )}
        />
      ))}
    </div>
  );
}
