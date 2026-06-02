import React, { useState } from 'react';
import { Pencil, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/cn';
import { LiveFormulaValue } from './LiveFormulaValue';
import { astToString } from '@comp-intel/shared/calculator/astOps';
import type { Formula } from '@comp-intel/shared/types/calculator';

interface FormulaCardProps {
  formula: Formula;
  onEdit: (formula: Formula) => void;
  onDelete: (formulaId: string) => void;
}

export const FormulaCard = React.memo(function FormulaCard({
  formula,
  onEdit,
  onDelete,
}: FormulaCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const formulaString = astToString(formula.ast);

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Main row — tappable */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer active:bg-muted/50 transition-colors"
        onClick={() => { setIsExpanded(prev => { if (prev) setConfirmDelete(false); return !prev; }); }}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{formula.name}</div>
          <div className="text-xs text-muted-foreground truncate font-mono mt-0.5">
            {formulaString}
          </div>
        </div>
        <LiveFormulaValue ast={formula.ast} className="text-lg" />
        <ChevronDown className={cn(
          'w-4 h-4 text-muted-foreground transition-transform shrink-0',
          isExpanded && 'rotate-180'
        )} />
      </div>

      {/* Expanded actions */}
      {isExpanded && (
        <div className="border-t px-3 py-2 flex items-center gap-2 bg-muted/30">
          {formula.description && (
            <span className="text-xs text-muted-foreground flex-1 truncate">
              {formula.description}
            </span>
          )}
          {!formula.description && <span className="flex-1" />}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={(e) => { e.stopPropagation(); onEdit(formula); }}
          >
            <Pencil className="w-3.5 h-3.5 mr-1" />
            Edit
          </Button>
          {!confirmDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                variant="destructive"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={(e) => { e.stopPropagation(); onDelete(formula.id); }}
              >
                Confirm
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
