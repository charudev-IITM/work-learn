import { Pause, Play, Clock } from 'lucide-react';
import { Button } from '../../ui/button';
import { formatCountdown } from '@comp-intel/shared/lib/formatters';

interface PreviewResumeOverlayProps {
  remainingSeconds: number;
  onResume: () => void;
}

export function PreviewResumeOverlay({ remainingSeconds, onResume }: PreviewResumeOverlayProps) {
  return (
    <div className="fixed inset-0 z-[998] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-[999] w-80 max-w-[calc(100vw-32px)] bg-card border border-border rounded-2xl p-6 shadow-2xl text-center animate-in fade-in-0 zoom-in-95 duration-300">
        <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Pause className="w-7 h-7 text-amber-500" />
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-2">
          Your preview is paused
        </h3>

        <div className="flex items-center justify-center gap-2 mb-4 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-mono">{formatCountdown(remainingSeconds)} remaining</span>
        </div>

        <Button
          onClick={onResume}
          className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold"
        >
          <Play className="w-4 h-4 mr-2" />
          Resume Exploring
        </Button>
      </div>
    </div>
  );
}
