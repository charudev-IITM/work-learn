import { cn } from '../../lib/cn';
import { AnimatedPrice } from '../ui/animated-price';
import { useFormulaEval } from '../../calculator/useFormulaEval';
import { formatCalcValue } from '@comp-intel/shared/calculator/formatValue';
import type { ASTNode } from '@comp-intel/shared/types/calculator';

interface LiveFormulaValueProps {
  ast: ASTNode;
  className?: string;
}

export function LiveFormulaValue({ ast, className }: LiveFormulaValueProps) {
  const result = useFormulaEval(ast);
  const hasStale = result.staleRefs.length > 0;
  const hasMissing = result.missingRefs.length > 0;

  if (result.error) {
    const errorText =
      result.error.kind === 'division_by_zero' ? 'Div/0' :
      result.error.kind === 'missing_rate' ? 'N/A' : 'Error';
    return (
      <span className={cn('text-destructive font-mono text-sm', className)}>
        {errorText}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <AnimatedPrice
        value={result.value ?? undefined}
        formatter={formatCalcValue}
        showTrend
        className={cn(
          'font-mono font-bold',
          hasStale ? 'text-amber-500 dark:text-amber-400' : '',
          className
        )}
      />
      {hasMissing && (
        <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
          {result.missingRefs.length} N/A
        </span>
      )}
      {hasStale && !hasMissing && (
        <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1 rounded">
          stale
        </span>
      )}
    </div>
  );
}
