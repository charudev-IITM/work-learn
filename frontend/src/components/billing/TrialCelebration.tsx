import { Gift } from 'lucide-react';

interface TrialCelebrationProps {
  message?: string;
}

export function TrialCelebration({ message = 'Enjoy full access to all features. Redirecting...' }: TrialCelebrationProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex flex-col items-center justify-center p-6">
      <div className="animate-[scaleIn_0.4s_ease-out] flex flex-col items-center text-center gap-4">
        <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Gift className="w-12 h-12 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold">Your Free Trial is Active!</h1>
        <p className="text-muted-foreground">{message}</p>
      </div>
      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
