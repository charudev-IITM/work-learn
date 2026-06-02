import { useReducer, useState, useCallback } from 'react';
import { Save, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { useCalculator } from '../../contexts/CalculatorContext';
import { builderReducer, initialBuilderState } from '@comp-intel/shared/calculator/builderReducer';
import { nodeId, makeLiteral } from '@comp-intel/shared/calculator/astOps';
import { useFormulaEval } from '../../calculator/useFormulaEval';
import { formatCalcValue } from '@comp-intel/shared/calculator/formatValue';
import { ASTNodeView } from './ASTNodeView';
import { NodePicker } from './NodePicker';
import type { Formula, ASTNode, BinaryOperator } from '@comp-intel/shared/types/calculator';

interface FormulaBuilderProps {
  open: boolean;
  onClose: () => void;
  editingFormula: Formula | null;
}

export function FormulaBuilder({ open, onClose, editingFormula }: FormulaBuilderProps) {
  // Key forces remount when switching between new/edit or different formulas
  const builderKey = editingFormula?.id ?? 'new';
  return (
    <FormulaBuilderInner key={builderKey} open={open} onClose={onClose} editingFormula={editingFormula} />
  );
}

function FormulaBuilderInner({ open, onClose, editingFormula }: FormulaBuilderProps) {
  const { createFormula, updateFormula } = useCalculator();
  const [state, dispatch] = useReducer(
    builderReducer,
    editingFormula
      ? {
          ast: editingFormula.ast,
          focusedNodeId: null,
          formulaName: editingFormula.name,
          formulaDescription: editingFormula.description ?? '',
          isDirty: false,
          editingFormulaId: editingFormula.id,
        }
      : initialBuilderState
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetNodeId, setPickerTargetNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const evalResult = useFormulaEval(state.ast);

  // When a node is tapped in the tree, open the picker to replace it
  const handleNodeTap = useCallback((id: string) => {
    setPickerTargetNodeId(id);
    setPickerOpen(true);
  }, []);

  // When a node is selected from the picker
  const handleNodeSelect = useCallback((node: ASTNode) => {
    if (pickerTargetNodeId && state.ast) {
      dispatch({ type: 'REPLACE_NODE', nodeId: pickerTargetNodeId, replacement: node });
    } else if (!state.ast) {
      dispatch({ type: 'SET_ROOT', node });
    }
    setPickerOpen(false);
    setPickerTargetNodeId(null);
  }, [pickerTargetNodeId, state.ast]);

  // Add an operator: wraps the root (or focused node) in a binary op
  const handleAddOperator = useCallback((op: BinaryOperator) => {
    if (!state.ast) {
      // No tree yet — create a binary with two placeholders
      const left = makeLiteral(0);
      const right = makeLiteral(0);
      dispatch({
        type: 'SET_ROOT',
        node: { kind: 'binary', id: nodeId(), op, left, right },
      });
    } else {
      // Wrap root in a new binary, root goes left, placeholder right
      dispatch({ type: 'WRAP_NODE', nodeId: state.ast.id, op, side: 'left' });
    }
  }, [state.ast]);

  const handleSave = async () => {
    if (!state.ast) return;
    if (!state.formulaName.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (state.editingFormulaId) {
        await updateFormula(state.editingFormulaId, {
          name: state.formulaName.trim(),
          description: state.formulaDescription.trim() || undefined,
          ast: state.ast,
        });
      } else {
        await createFormula({
          name: state.formulaName.trim(),
          description: state.formulaDescription.trim() || undefined,
          ast: state.ast,
        });
      }
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save formula');
    } finally {
      setSaving(false);
    }
  };

  // Start fresh when dialog opens/closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
    }
  };

  const canSave = state.ast !== null && state.formulaName.trim().length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="top-0 translate-y-0 h-full max-h-screen sm:top-[50%] sm:translate-y-[-50%] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-lg flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="border-b p-3 sm:p-4 shrink-0">
            <DialogHeader>
              <DialogTitle>{state.editingFormulaId ? 'Edit Formula' : 'New Formula'}</DialogTitle>
              <DialogDescription className="sr-only">
                Build a formula using live dealer rates
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 space-y-2">
              <Input
                placeholder="Formula name (e.g. KJ vs CSV Premium)"
                value={state.formulaName}
                onChange={e => dispatch({ type: 'SET_NAME', name: e.target.value })}
                className="h-9 text-sm"
                autoFocus
              />
              <Input
                placeholder="Description (optional)"
                value={state.formulaDescription}
                onChange={e => dispatch({ type: 'SET_DESCRIPTION', desc: e.target.value })}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Formula tree area */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
            {!state.ast ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Start building your formula
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPickerTargetNodeId(null);
                      setPickerOpen(true);
                    }}
                  >
                    Add Rate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const node = makeLiteral(0);
                      dispatch({ type: 'SET_ROOT', node });
                    }}
                  >
                    Add Number
                  </Button>
                  {(['+', '-', '*', '/'] as BinaryOperator[]).map(op => (
                    <Button
                      key={op}
                      variant="outline"
                      size="sm"
                      className="w-9 h-9 p-0 font-mono text-lg"
                      onClick={() => handleAddOperator(op)}
                    >
                      {op === '*' ? '×' : op === '/' ? '÷' : op}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <ASTNodeView
                  node={state.ast}
                  focusedNodeId={state.focusedNodeId}
                  onNodeTap={handleNodeTap}
                  onRemoveNode={(id) => dispatch({ type: 'REMOVE_NODE', nodeId: id })}
                  onSetOperator={(id, op) => dispatch({ type: 'SET_OPERATOR', nodeId: id, op })}
                  onWrapNode={(id, op) => dispatch({ type: 'WRAP_NODE', nodeId: id, op, side: 'left' })}
                />
                {/* Operator buttons below the tree */}
                <div className="flex justify-center gap-2 pt-2 border-t">
                  {(['+', '-', '*', '/'] as BinaryOperator[]).map(op => (
                    <Button
                      key={op}
                      variant="outline"
                      size="sm"
                      className="w-9 h-9 p-0 font-mono text-lg"
                      onClick={() => handleAddOperator(op)}
                    >
                      {op === '*' ? '×' : op === '/' ? '÷' : op}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Live preview + save bar */}
          <div className="border-t p-3 shrink-0 space-y-2">
            {state.ast && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Live Result</span>
                <span className="font-mono font-bold text-lg">
                  {evalResult.value !== null
                    ? formatCalcValue(evalResult.value)
                    : evalResult.error
                      ? evalResult.error.kind === 'division_by_zero' ? 'Div/0' : 'Error'
                      : '—'}
                </span>
              </div>
            )}
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={!canSave || saving}
              >
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Node picker (separate dialog to avoid z-index issues) */}
      <NodePicker
        open={pickerOpen}
        onClose={() => { setPickerOpen(false); setPickerTargetNodeId(null); }}
        onSelect={handleNodeSelect}
      />
    </>
  );
}
