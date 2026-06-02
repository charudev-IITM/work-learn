/**
 * Pure AST manipulation functions — immutable tree operations.
 * Used by the builder reducer to transform formula trees.
 */

import type { ASTNode, BinaryOperator, LiteralNode } from '../types/calculator';

let nodeCounter = 0;
/** Generate a unique node ID (no external dependency needed) */
export function nodeId(): string {
  return `n_${Date.now().toString(36)}_${(nodeCounter++).toString(36)}`;
}

/** Create a placeholder literal node */
export function makeLiteral(value = 0): LiteralNode {
  return { kind: 'literal', id: nodeId(), value };
}

/** Find a node by ID anywhere in the tree */
export function findNode(tree: ASTNode, id: string): ASTNode | null {
  if (tree.id === id) return tree;
  if (tree.kind === 'binary') {
    return findNode(tree.left, id) ?? findNode(tree.right, id);
  }
  return null;
}

/**
 * Replace a node by ID with a new node. Returns new tree (immutable).
 * Returns original tree unchanged if nodeId not found.
 */
export function replaceNode(tree: ASTNode, targetId: string, replacement: ASTNode): ASTNode {
  if (tree.id === targetId) return replacement;
  if (tree.kind === 'binary') {
    const newLeft = replaceNode(tree.left, targetId, replacement);
    const newRight = replaceNode(tree.right, targetId, replacement);
    if (newLeft === tree.left && newRight === tree.right) return tree;
    return { ...tree, left: newLeft, right: newRight };
  }
  return tree;
}

/**
 * Wrap a node in a binary operation.
 * The existing node goes on `side`, a placeholder literal on the other.
 */
export function wrapNode(
  tree: ASTNode,
  targetId: string,
  op: BinaryOperator,
  side: 'left' | 'right'
): ASTNode {
  const existing = findNode(tree, targetId);
  if (!existing) return tree;
  const placeholder = makeLiteral(0);
  const wrapper: ASTNode = {
    kind: 'binary',
    id: nodeId(),
    op,
    left: side === 'left' ? existing : placeholder,
    right: side === 'right' ? existing : placeholder,
  };
  return replaceNode(tree, targetId, wrapper);
}

/**
 * Remove a node by ID. When a binary node's child is removed,
 * the sibling collapses up to replace the parent.
 */
export function removeNode(tree: ASTNode, targetId: string): ASTNode | null {
  if (tree.id === targetId) return null;
  if (tree.kind === 'binary') {
    if (tree.left.id === targetId) return tree.right;
    if (tree.right.id === targetId) return tree.left;
    const newLeft = removeNode(tree.left, targetId);
    const newRight = removeNode(tree.right, targetId);
    if (newLeft === null) return newRight ?? tree.right;
    if (newRight === null) return newLeft ?? tree.left;
    return { ...tree, left: newLeft, right: newRight };
  }
  return tree;
}

/** Collect all rate_ref nodes from a tree */
export function collectRateRefs(
  tree: ASTNode
): Array<{ competitor: string; symbol: string; rateType: 'buy' | 'sell' }> {
  const refs: Array<{ competitor: string; symbol: string; rateType: 'buy' | 'sell' }> = [];
  function walk(node: ASTNode) {
    if (node.kind === 'rate_ref') {
      refs.push({ competitor: node.competitor, symbol: node.symbol, rateType: node.rateType });
    } else if (node.kind === 'binary') {
      walk(node.left);
      walk(node.right);
    }
  }
  walk(tree);
  return refs;
}

/** Pretty-print an AST as a human-readable formula string */
export function astToString(node: ASTNode): string {
  switch (node.kind) {
    case 'literal':
      return node.value.toString();
    case 'rate_ref':
      return node.displayName || `${node.competitor}.${node.symbol}.${node.rateType === 'buy' ? 'Buy' : 'Sell'}`;
    case 'binary': {
      const left = astToString(node.left);
      const right = astToString(node.right);
      const opSymbol = node.op === '*' ? '×' : node.op === '/' ? '÷' : node.op;
      return `(${left} ${opSymbol} ${right})`;
    }
  }
}
