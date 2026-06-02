import { CalculatorProvider } from '../contexts/CalculatorContext';
import { FormulaList } from '../components/calculator/FormulaList';

export default function CalculatorView() {
  return (
    <CalculatorProvider>
      <FormulaList />
    </CalculatorProvider>
  );
}
