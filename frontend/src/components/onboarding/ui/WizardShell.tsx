import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { ProgressDots } from './ProgressDots';
import { cn } from '../../../lib/cn';

interface WizardShellProps {
  children: React.ReactNode;
  currentStep: number;
  totalSteps: number;
  showBack?: boolean;
  showSkip?: boolean;
  showProgress?: boolean;
  onBack?: () => void;
  onSkip?: () => void;
  headerExtra?: React.ReactNode;
}

export function WizardShell({
  children,
  currentStep,
  totalSteps,
  showBack = false,
  showSkip = false,
  showProgress = true,
  onBack,
  onSkip,
  headerExtra,
}: WizardShellProps) {
  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
        <div className="w-16">
          {showBack && onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2 rounded-lg active:bg-muted/50"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Back</span>
            </button>
          )}
        </div>

        <div className="flex-1 flex justify-center">
          {showProgress && <ProgressDots current={currentStep} total={totalSteps} />}
          {headerExtra}
        </div>

        <div className="w-16 flex justify-end">
          {showSkip && onSkip && (
            <button
              onClick={onSkip}
              className={cn(
                'text-sm text-muted-foreground hover:text-foreground transition-colors',
                'px-3 py-2 rounded-lg active:bg-muted/50',
              )}
            >
              Skip
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
