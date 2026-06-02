import { Sun, Moon, Monitor, ArrowRight } from 'lucide-react';
import { Button } from '../../ui/button';
import { useTheme } from '../../../contexts/ThemeContext';
import { cn } from '../../../lib/cn';

interface ThemeStepProps {
  onNext: () => void;
}

const THEMES = [
  {
    id: 'light' as const,
    label: 'Light',
    icon: Sun,
    description: 'Clean & bright',
    preview: {
      bg: 'bg-white',
      card: 'bg-gray-100',
      text: 'text-gray-900',
      textMuted: 'text-gray-400',
      border: 'border-gray-200',
      accent: 'bg-amber-500',
    },
  },
  {
    id: 'dark' as const,
    label: 'Dark',
    icon: Moon,
    description: 'Easy on the eyes',
    preview: {
      bg: 'bg-gray-900',
      card: 'bg-gray-800',
      text: 'text-white',
      textMuted: 'text-gray-500',
      border: 'border-gray-700',
      accent: 'bg-amber-500',
    },
  },
  {
    id: 'system' as const,
    label: 'System',
    icon: Monitor,
    description: 'Match your device',
    preview: {
      // Split preview: left half light, right half dark
      bg: 'bg-gradient-to-r from-white to-gray-900',
      card: 'bg-gradient-to-r from-gray-100 to-gray-800',
      text: 'text-gray-900',
      textMuted: 'text-gray-400',
      border: 'border-gray-300',
      accent: 'bg-amber-500',
    },
  },
] as const;

export function ThemeStep({ onNext }: ThemeStepProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex-1 flex flex-col px-6 pb-8 pt-2">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-foreground mb-1">
          Choose your look
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a theme that suits you
        </p>
      </div>

      {/* Theme Options */}
      <div className="flex-1 flex items-start justify-center pt-2">
        <div className="grid grid-cols-3 gap-3 w-full max-w-md">
          {THEMES.map((t, i) => {
            const isSelected = theme === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  'relative flex flex-col items-center gap-2.5',
                  'rounded-2xl border-2 p-3 transition-all duration-200',
                  'active:scale-[0.97]',
                  isSelected
                    ? 'border-amber-500 ring-2 ring-amber-500/30 shadow-sm shadow-amber-500/10'
                    : 'border-border/60 hover:border-border',
                )}
                style={{
                  animation: `fadeSlideIn 0.3s ease-out ${i * 0.08}s both`,
                }}
              >
                {/* Checkmark */}
                {isSelected && (
                  <div
                    className="absolute top-2 right-2 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center"
                    style={{ animation: 'fadeSlideIn 0.15s ease-out both' }}
                  >
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}

                {/* Mini preview */}
                <div className={cn(
                  'w-full aspect-[4/3] rounded-xl overflow-hidden border',
                  t.preview.border,
                )}>
                  {t.id === 'system' ? (
                    /* Split preview for system */
                    <div className="w-full h-full flex">
                      <div className="w-1/2 bg-white p-1.5 flex flex-col gap-1">
                        <div className="h-1.5 w-3/4 rounded-full bg-gray-300" />
                        <div className="flex-1 rounded bg-gray-100 flex flex-col justify-center gap-0.5 p-1">
                          <div className="h-1 w-full rounded-full bg-gray-200" />
                          <div className="h-1 w-2/3 rounded-full bg-amber-400" />
                        </div>
                      </div>
                      <div className="w-1/2 bg-gray-900 p-1.5 flex flex-col gap-1">
                        <div className="h-1.5 w-3/4 rounded-full bg-gray-600" />
                        <div className="flex-1 rounded bg-gray-800 flex flex-col justify-center gap-0.5 p-1">
                          <div className="h-1 w-full rounded-full bg-gray-700" />
                          <div className="h-1 w-2/3 rounded-full bg-amber-500" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={cn('w-full h-full p-1.5 flex flex-col gap-1', t.preview.bg)}>
                      <div className={cn('h-1.5 w-3/4 rounded-full', t.id === 'dark' ? 'bg-gray-600' : 'bg-gray-300')} />
                      <div className={cn('flex-1 rounded flex flex-col justify-center gap-0.5 p-1', t.preview.card)}>
                        <div className={cn('h-1 w-full rounded-full', t.id === 'dark' ? 'bg-gray-700' : 'bg-gray-200')} />
                        <div className={cn('h-1 w-2/3 rounded-full', t.preview.accent)} />
                      </div>
                      <div className={cn('flex gap-1 mt-auto')}>
                        <div className={cn('h-1 flex-1 rounded-full', t.id === 'dark' ? 'bg-gray-700' : 'bg-gray-200')} />
                        <div className={cn('h-1 flex-1 rounded-full', t.id === 'dark' ? 'bg-gray-700' : 'bg-gray-200')} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Icon & label */}
                <Icon className={cn(
                  'w-5 h-5 transition-colors',
                  isSelected ? 'text-amber-500' : 'text-muted-foreground',
                )} />
                <div className="text-center">
                  <div className={cn(
                    'text-sm font-semibold transition-colors',
                    isSelected ? 'text-foreground' : 'text-foreground/70',
                  )}>
                    {t.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {t.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="shrink-0 pt-4">
        <Button
          onClick={onNext}
          className="w-full h-14 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold text-base rounded-xl shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-all"
        >
          Continue
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
