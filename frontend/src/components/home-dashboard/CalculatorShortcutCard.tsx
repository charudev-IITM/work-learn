import { useState, useEffect } from 'react'
import { Calculator, ChevronRight } from 'lucide-react'
import { useNavigation } from '../../contexts/NavigationContext'
import { calculatorService } from '@comp-intel/shared/services/calculator'
import { cn } from '../../lib/cn'

export function CalculatorShortcutCard() {
  const { navigate } = useNavigation()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    calculatorService.getFormulas()
      .then((formulas) => setCount(formulas.length))
      .catch(() => {}) // silent — non-critical
  }, [])

  return (
    <button
      onClick={() => navigate('calculator')}
      className={cn(
        "w-full text-left rounded-2xl transition-all active:scale-[0.99] flex overflow-hidden",
        "bg-white border border-gray-200",
        "border-l-[3px] border-l-indigo-500",
        "dark:bg-white/[0.07] dark:border-white/[0.08] dark:border-l-white/[0.08]",
        "dark:backdrop-blur-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
      )}
    >
      <div className="flex-1 flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Calculator className="w-3.5 h-3.5 text-gray-950 dark:text-indigo-400" />
          <span className="text-xs font-bold text-gray-950 dark:text-white">Calculations</span>
          {count !== null && count > 0 && (
            <span className={cn(
              "inline-flex items-center justify-center min-w-4 h-4 px-1 text-[9px] font-bold rounded-md",
              "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"
            )}>
              {count}
            </span>
          )}
          {count === 0 && (
            <span className="text-[9px] font-medium text-gray-400 dark:text-white/30">
              Tap to create
            </span>
          )}
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-white/25" />
      </div>
    </button>
  )
}
