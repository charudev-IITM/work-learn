import { X, WrapText } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/cn';
import type { ASTNode, BinaryOperator } from '@comp-intel/shared/types/calculator';

interface ASTNodeViewProps {
  node: ASTNode;
  focusedNodeId: string | null;
  onNodeTap: (nodeId: string) => void;
  onRemoveNode: (nodeId: string) => void;
  onSetOperator: (nodeId: string, op: BinaryOperator) => void;
  onWrapNode: (nodeId: string, op: BinaryOperator) => void;
  depth?: number;
}

const OP_DISPLAY: Record<string, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
};

const OP_CYCLE: BinaryOperator[] = ['+', '-', '*', '/'];

export function ASTNodeView({
  node,
  focusedNodeId,
  onNodeTap,
  onRemoveNode,
  onSetOperator,
  onWrapNode,
  depth = 0,
}: ASTNodeViewProps) {
  const isFocused = node.id === focusedNodeId;

  if (node.kind === 'literal') {
    return (
      <NodeChip
        label={node.value === 0 ? '0' : node.value.toString()}
        sublabel="number"
        focused={isFocused}
        onTap={() => onNodeTap(node.id)}
        onRemove={depth > 0 ? () => onRemoveNode(node.id) : undefined}
        onWrap={depth > 0 ? (op) => onWrapNode(node.id, op) : undefined}
        variant="literal"
      />
    );
  }

  if (node.kind === 'rate_ref') {
    const rateLabel = node.rateType === 'buy' ? 'Buy' : 'Sell';
    return (
      <NodeChip
        label={node.displayName || `${node.competitor} · ${node.symbol}`}
        sublabel={rateLabel}
        focused={isFocused}
        onTap={() => onNodeTap(node.id)}
        onRemove={depth > 0 ? () => onRemoveNode(node.id) : undefined}
        onWrap={depth > 0 ? (op) => onWrapNode(node.id, op) : undefined}
        variant="rate"
      />
    );
  }

  if (node.kind === 'binary') {
    const currentOpIdx = OP_CYCLE.indexOf(node.op);
    const cycleOp = () => {
      const next = OP_CYCLE[(currentOpIdx + 1) % OP_CYCLE.length];
      onSetOperator(node.id, next);
    };

    return (
      <div className={cn(
        'rounded-lg border p-2 space-y-1.5',
        depth === 0 ? 'bg-card' : 'bg-muted/30',
      )}>
        {/* Left operand */}
        <ASTNodeView
          node={node.left}
          focusedNodeId={focusedNodeId}
          onNodeTap={onNodeTap}
          onRemoveNode={onRemoveNode}
          onSetOperator={onSetOperator}
          onWrapNode={onWrapNode}
          depth={depth + 1}
        />

        {/* Operator row */}
        <div className="flex items-center gap-1.5 px-1">
          <button
            className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary font-mono text-lg font-bold hover:bg-primary/20 active:bg-primary/30 transition-colors"
            onClick={cycleOp}
            title="Tap to change operator"
          >
            {OP_DISPLAY[node.op]}
          </button>
          <div className="flex-1 border-t border-dashed border-border/50" />
          {depth > 0 && (
            <WrapButton nodeId={node.id} onWrapNode={onWrapNode} />
          )}
          {depth > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemoveNode(node.id)}
              title="Remove this operation"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Right operand */}
        <ASTNodeView
          node={node.right}
          focusedNodeId={focusedNodeId}
          onNodeTap={onNodeTap}
          onRemoveNode={onRemoveNode}
          onSetOperator={onSetOperator}
          onWrapNode={onWrapNode}
          depth={depth + 1}
        />
      </div>
    );
  }

  return null;
}

// ── Leaf node chip ─────────────────────────────────────────────

// ── Wrap button for binary nodes ──────────────────────────────

function WrapButton({ nodeId, onWrapNode }: { nodeId: string; onWrapNode: (id: string, op: BinaryOperator) => void }) {
  const [showOps, setShowOps] = useState(false);

  if (showOps) {
    return (
      <div className="flex gap-0.5">
        {(['+', '-', '*', '/'] as BinaryOperator[]).map(op => (
          <button
            key={op}
            className="w-6 h-6 rounded-md bg-primary/10 text-primary font-mono text-xs font-bold hover:bg-primary/20 active:bg-primary/30 transition-colors"
            onClick={() => { onWrapNode(nodeId, op); setShowOps(false); }}
          >
            {op === '*' ? '×' : op === '/' ? '÷' : op}
          </button>
        ))}
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
      onClick={() => setShowOps(true)}
      title="Wrap with operator (add brackets)"
    >
      <WrapText className="w-3.5 h-3.5" />
    </Button>
  );
}

// ── Leaf node chip ─────────────────────────────────────────────

interface NodeChipProps {
  label: string;
  sublabel: string;
  focused: boolean;
  onTap: () => void;
  onRemove?: () => void;
  onWrap?: (op: BinaryOperator) => void;
  variant: 'rate' | 'literal';
}

function NodeChip({ label, sublabel, focused, onTap, onRemove, onWrap, variant }: NodeChipProps) {
  const [showWrapOps, setShowWrapOps] = useState(false);

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition-all',
          'active:scale-[0.98]',
          focused && 'ring-2 ring-primary ring-offset-1',
          variant === 'rate'
            ? 'bg-blue-500/10 border-blue-500/30 dark:bg-blue-400/10 dark:border-blue-400/30'
            : 'bg-amber-500/10 border-amber-500/30 dark:bg-amber-400/10 dark:border-amber-400/30',
        )}
        onClick={onTap}
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{label}</div>
          <div className="text-[10px] text-muted-foreground">{sublabel}</div>
        </div>
        {onWrap && (
          <button
            className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            onClick={(e) => { e.stopPropagation(); setShowWrapOps(prev => !prev); }}
            title="Wrap with operator (add brackets)"
          >
            <WrapText className="w-3 h-3" />
          </button>
        )}
        {onRemove && (
          <button
            className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {showWrapOps && onWrap && (
        <div className="flex gap-1 pl-2">
          {(['+', '-', '*', '/'] as BinaryOperator[]).map(op => (
            <button
              key={op}
              className="w-7 h-7 rounded-md bg-primary/10 text-primary font-mono text-sm font-bold hover:bg-primary/20 active:bg-primary/30 transition-colors"
              onClick={() => { onWrap(op); setShowWrapOps(false); }}
            >
              {op === '*' ? '×' : op === '/' ? '÷' : op}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
