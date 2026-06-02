/**
 * Pure formula evaluation engine — no React, no side effects.
 * Takes an AST + resolver functions, returns a result.
 */

import type { ASTNode, EvalResult, EvalError } from '../types/calculator';

/** Resolves a rate reference to a numeric value, or null if unavailable */
export type RateResolver = (
  competitor: string,
  symbol: string,
  rateType: 'buy' | 'sell'
) => number | null;

/** Returns true if a rate entry is stale (timestamp too old) */
export type StaleChecker = (competitor: string, symbol: string) => boolean;

interface EvalContext {
  resolveRate: RateResolver;
  checkStale: StaleChecker;
  staleRefs: string[];
  missingRefs: string[];
}

function evalNode(node: ASTNode, ctx: EvalContext): number | null {
  switch (node.kind) {
    case 'literal':
      return node.value;

    case 'rate_ref': {
      const value = ctx.resolveRate(node.competitor, node.symbol, node.rateType);
      if (value === null) {
        ctx.missingRefs.push(node.id);
        return null;
      }
      if (ctx.checkStale(node.competitor, node.symbol)) {
        ctx.staleRefs.push(node.id);
      }
      return value;
    }

    case 'binary': {
      const left = evalNode(node.left, ctx);
      const right = evalNode(node.right, ctx);
      if (left === null || right === null) return null;
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': {
          if (right === 0) {
            throw { kind: 'division_by_zero', nodeId: node.id } satisfies EvalError;
          }
          return left / right;
        }
        default:
          throw { kind: 'unsupported_node', nodeKind: `binary/${node.op}` } satisfies EvalError;
      }
    }

    default:
      throw { kind: 'unsupported_node', nodeKind: (node as any).kind } satisfies EvalError;
  }
}

function isEvalError(e: unknown): e is EvalError {
  return typeof e === 'object' && e !== null && 'kind' in e;
}

/**
 * Evaluate a formula AST against live rate data.
 * Never throws — all errors captured in the result.
 */
export function evaluateAST(
  node: ASTNode,
  resolveRate: RateResolver,
  checkStale: StaleChecker
): EvalResult {
  const ctx: EvalContext = {
    resolveRate,
    checkStale,
    staleRefs: [],
    missingRefs: [],
  };

  let value: number | null = null;
  let error: EvalError | null = null;

  try {
    value = evalNode(node, ctx);
  } catch (e) {
    if (isEvalError(e)) {
      error = e;
    } else {
      throw e; // unexpected errors re-throw
    }
  }

  return { value, staleRefs: ctx.staleRefs, missingRefs: ctx.missingRefs, error };
}
