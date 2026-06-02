import React, { createContext, useContext, useCallback, useEffect, useState, useMemo } from 'react';
import type { Formula, FormulaCreateRequest, FormulaUpdateRequest } from '@comp-intel/shared/types/calculator';
import { calculatorService } from '@comp-intel/shared/services/calculator';
import { useAuth } from './AuthContext';

interface CalculatorContextType {
  formulas: Formula[];
  isLoading: boolean;
  error: string | null;
  createFormula: (data: FormulaCreateRequest) => Promise<Formula>;
  updateFormula: (id: string, data: FormulaUpdateRequest) => Promise<Formula>;
  deleteFormula: (id: string) => Promise<void>;
  refreshFormulas: () => Promise<void>;
  clearError: () => void;
}

const CalculatorContext = createContext<CalculatorContextType | null>(null);

export function CalculatorProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFormulas = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await calculatorService.getFormulas();
      setFormulas(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load formulas');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFormulas();
  }, [fetchFormulas]);

  const createFormula = useCallback(async (data: FormulaCreateRequest) => {
    const formula = await calculatorService.createFormula(data);
    setFormulas(prev => [...prev, formula]);
    return formula;
  }, []);

  const updateFormula = useCallback(async (id: string, data: FormulaUpdateRequest) => {
    const updated = await calculatorService.updateFormula(id, data);
    setFormulas(prev => prev.map(f => f.id === id ? updated : f));
    return updated;
  }, []);

  const deleteFormula = useCallback(async (id: string) => {
    await calculatorService.deleteFormula(id);
    setFormulas(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(() => ({
    formulas, isLoading, error,
    createFormula, updateFormula, deleteFormula,
    refreshFormulas: fetchFormulas, clearError,
  }), [formulas, isLoading, error, createFormula, updateFormula, deleteFormula, fetchFormulas, clearError]);

  return (
    <CalculatorContext.Provider value={value}>
      {children}
    </CalculatorContext.Provider>
  );
}

export function useCalculator() {
  const ctx = useContext(CalculatorContext);
  if (!ctx) throw new Error('useCalculator must be used within CalculatorProvider');
  return ctx;
}
