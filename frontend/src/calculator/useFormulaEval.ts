import { useMemo } from 'react';
import { useGlobalRateVersion } from '../hooks/useRateVersion';
import { getRate } from '@comp-intel/shared/stores/rateStore';
import { evaluateAST } from '@comp-intel/shared/calculator/evaluator';
import type { ASTNode, EvalResult } from '@comp-intel/shared/types/calculator';

const STALE_THRESHOLD_MS = 35_000;

/**
 * Reactively evaluate a formula AST against live rate data.
 * Re-evaluates whenever any rate in the store changes.
 */
export function useFormulaEval(ast: ASTNode | null): EvalResult {
  const rateVersion = useGlobalRateVersion();

  return useMemo(() => {
    if (!ast) return { value: null, staleRefs: [], missingRefs: [], error: null };

    const resolveRate = (competitor: string, symbol: string, rateType: 'buy' | 'sell') => {
      const entry = getRate(competitor, symbol);
      if (!entry) return null;
      return rateType === 'buy' ? (entry.buy_rate ?? null) : (entry.sell_rate ?? null);
    };

    const checkStale = (competitor: string, symbol: string) => {
      const entry = getRate(competitor, symbol);
      if (!entry?.timestamp) return false;
      // Backend sends UTC timestamps without 'Z' suffix; ensure UTC parsing
      const ts = entry.timestamp.endsWith('Z') ? entry.timestamp : entry.timestamp + 'Z';
      return Date.now() - new Date(ts).getTime() > STALE_THRESHOLD_MS;
    };

    return evaluateAST(ast, resolveRate, checkStale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ast, rateVersion]);
}
