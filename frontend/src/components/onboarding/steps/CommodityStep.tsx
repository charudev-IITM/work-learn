import { ArrowRight } from 'lucide-react';
import { Button } from '../../ui/button';
import { useOnboarding } from '../../../contexts/OnboardingContext';
import { cn } from '../../../lib/cn';

interface CommodityStepProps {
  onNext: () => void;
}

const COMMODITIES = [
  {
    id: 'Gold',
    label: 'Gold',
    emoji: '🥇',
    bgSelected: 'bg-amber-500/15 border-amber-500 ring-amber-500/30',
    bgDefault: 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40',
    textSelected: 'text-amber-700 dark:text-amber-400',
  },
  {
    id: 'Silver',
    label: 'Silver',
    emoji: '🥈',
    bgSelected: 'bg-slate-400/15 border-slate-400 ring-slate-400/30',
    bgDefault: 'bg-slate-400/5 border-slate-400/20 hover:border-slate-400/40',
    textSelected: 'text-slate-600 dark:text-slate-300',
  },
];

export function CommodityStep({ onNext }: CommodityStepProps) {
  const { selectedCommodities, toggleCommodity } = useOnboarding();

  return (
    <div className="flex-1 flex flex-col px-6 pb-8 pt-2">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-foreground mb-1">
          What do you trade?
        </h1>
        <p className="text-sm text-muted-foreground">
          Select the commodities you deal in
        </p>
      </div>

      {/* Commodity Grid */}
      <div className="flex-1 flex items-start justify-center pt-4">
        <div className="grid grid-cols-2 gap-4 w-full max-w-md">
          {COMMODITIES.map((commodity) => {
            const isSelected = selectedCommodities.includes(commodity.id);
            return (
              <button
                key={commodity.id}
                onClick={() => toggleCommodity(commodity.id)}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-3',
                  'h-36 rounded-2xl border-2 transition-all duration-200',
                  'active:scale-[0.97]',
                  isSelected
                    ? `${commodity.bgSelected} ring-2`
                    : commodity.bgDefault,
                )}
              >
                <span className="text-4xl">{commodity.emoji}</span>
                <span
                  className={cn(
                    'text-base font-semibold transition-colors',
                    isSelected ? commodity.textSelected : 'text-foreground/70',
                  )}
                >
                  {commodity.label}
                </span>
                {isSelected && (
                  <div className="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="shrink-0 pt-4">
        <Button
          onClick={onNext}
          disabled={selectedCommodities.length === 0}
          className="w-full h-14 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold text-base rounded-xl shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          Continue
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
        {selectedCommodities.length === 0 && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            Select at least one commodity
          </p>
        )}
      </div>
    </div>
  );
}
