// ── AST Node Types ────────────────────────────────────────────────────────────

/** A reference to a live bullion rate from rateStore */
export interface RateRefNode {
  kind: 'rate_ref';
  id: string;
  competitor: string;   // e.g. "KJBullion" — matches rateStore key
  symbol: string;       // e.g. "GOLD999" — matches rateStore symbol
  rateType: 'buy' | 'sell';
  displayName?: string; // e.g. "KJ Bullion Gold 999 Buy" — for UI only
}

/** A user-supplied constant number */
export interface LiteralNode {
  kind: 'literal';
  id: string;
  value: number;
}

/** Binary arithmetic operation */
export type BinaryOperator = '+' | '-' | '*' | '/';

export interface BinaryNode {
  kind: 'binary';
  id: string;
  op: BinaryOperator;
  left: ASTNode;
  right: ASTNode;
}

/** Union of all AST node types */
export type ASTNode = RateRefNode | LiteralNode | BinaryNode;

// ── Evaluation ────────────────────────────────────────────────────────────────

export type EvalError =
  | { kind: 'division_by_zero'; nodeId: string }
  | { kind: 'missing_rate'; nodeId: string }
  | { kind: 'unsupported_node'; nodeKind: string };

export interface EvalResult {
  value: number | null;
  staleRefs: string[];   // node IDs of rate refs with stale timestamps
  missingRefs: string[]; // node IDs of rate refs with no data
  error: EvalError | null;
}

// ── Formula (persisted entity) ────────────────────────────────────────────────

export interface Formula {
  id: string;
  name: string;
  description?: string;
  ast: ASTNode;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

// ── API Request Shapes ────────────────────────────────────────────────────────

export interface FormulaCreateRequest {
  name: string;
  description?: string;
  ast: ASTNode;
}

export interface FormulaUpdateRequest {
  name?: string;
  description?: string;
  ast?: ASTNode;
  orderIndex?: number;
}

// ── Builder State ─────────────────────────────────────────────────────────────

export interface BuilderState {
  ast: ASTNode | null;
  focusedNodeId: string | null;
  formulaName: string;
  formulaDescription: string;
  isDirty: boolean;
  /** When editing an existing formula, this is its ID */
  editingFormulaId: string | null;
}

export type BuilderAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DESCRIPTION'; desc: string }
  | { type: 'SET_FOCUS'; nodeId: string | null }
  | { type: 'SET_ROOT'; node: ASTNode }
  | { type: 'REPLACE_NODE'; nodeId: string; replacement: ASTNode }
  | { type: 'WRAP_NODE'; nodeId: string; op: BinaryOperator; side: 'left' | 'right' }
  | { type: 'REMOVE_NODE'; nodeId: string }
  | { type: 'SET_OPERATOR'; nodeId: string; op: BinaryOperator }
  | { type: 'LOAD_FORMULA'; formula: Formula }
  | { type: 'RESET' };
