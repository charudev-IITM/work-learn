import { useState } from 'react';
import { ArrowLeft, Plus, Calculator } from 'lucide-react';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { useCalculator } from '../../contexts/CalculatorContext';
import { FormulaCard } from './FormulaCard';
import { FormulaBuilder } from './FormulaBuilder';
import { useNavigation } from '../../contexts/NavigationContext';
import type { Formula } from '@comp-intel/shared/types/calculator';

const FORMULA_LIMIT = 20;

export function FormulaList() {
  const { navigate } = useNavigation();
  const { formulas, isLoading, error, deleteFormula, clearError } = useCalculator();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingFormula, setEditingFormula] = useState<Formula | null>(null);

  const handleEdit = (formula: Formula) => {
    setEditingFormula(formula);
    setBuilderOpen(true);
  };

  const handleDelete = async (formulaId: string) => {
    try {
      await deleteFormula(formulaId);
    } catch {
      // error handled by context
    }
  };

  const handleBuilderClose = () => {
    setBuilderOpen(false);
    setEditingFormula(null);
  };

  const atLimit = formulas.length >= FORMULA_LIMIT;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { navigate('dashboard'); }}
            className="w-9 h-9 p-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Calculator</h1>
            <p className="text-xs text-muted-foreground">
              {formulas.length} formula{formulas.length !== 1 ? 's' : ''}
              {atLimit && ' (limit reached)'}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => { setEditingFormula(null); setBuilderOpen(true); }}
            disabled={atLimit}
            className="gap-1"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-3 p-2 rounded-md bg-destructive/10 text-destructive text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="border rounded-lg bg-card p-3 flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : formulas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Calculator className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-semibold text-lg mb-1">No formulas yet</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Create custom formulas using live dealer rates. Track spreads, ratios, averages, and more in real-time.
            </p>
            <Button onClick={() => { setEditingFormula(null); setBuilderOpen(true); }} className="gap-1">
              <Plus className="w-4 h-4" />
              Create First Formula
            </Button>
          </div>
        ) : (
          formulas.map(formula => (
            <FormulaCard
              key={formula.id}
              formula={formula}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Formula Builder Dialog */}
      <FormulaBuilder
        open={builderOpen}
        onClose={handleBuilderClose}
        editingFormula={editingFormula}
      />
    </div>
  );
}
