import { useState, useEffect } from 'react';
import { Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { formatCurrency } from '@comp-intel/shared/lib/formatters';
import { cn } from '../../lib/cn';
import { alertService } from '@comp-intel/shared/services/alerts';
import { PriceAlert } from '@comp-intel/shared/types/alerts';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerName: string;
  scriptName: string;
  currentBuyRate: number;
  currentSellRate: number;
  existingAlert?: PriceAlert;
  onSuccess?: () => void;
}

export function AlertDialog({
  open,
  onOpenChange,
  dealerName,
  scriptName,
  currentBuyRate,
  currentSellRate,
  existingAlert,
  onSuccess,
}: AlertDialogProps) {
  const isEdit = !!existingAlert;

  const [rateType, setRateType] = useState<'buy' | 'sell'>(existingAlert?.rateType || 'buy');
  const [condition, setCondition] = useState<'above' | 'below'>(existingAlert?.condition || 'above');
  const [threshold, setThreshold] = useState('');
  const [triggerMode, setTriggerMode] = useState<'one_shot' | 'persistent'>(existingAlert?.triggerMode || 'one_shot');
  const [cooldownMinutes, setCooldownMinutes] = useState(String(existingAlert?.cooldownMinutes || 30));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setRateType(existingAlert?.rateType || 'buy');
      setCondition(existingAlert?.condition || 'above');
      setThreshold(
        existingAlert
          ? String(existingAlert.threshold)
          : String(rateType === 'buy' ? currentBuyRate : currentSellRate)
      );
      setTriggerMode(existingAlert?.triggerMode || 'one_shot');
      setCooldownMinutes(String(existingAlert?.cooldownMinutes || 30));
      setShowAdvanced(false);
      setError('');
    }
  // Only reset on open/existingAlert change, not rateType
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingAlert]);

  // Update threshold when rate type changes (only for new alerts)
  useEffect(() => {
    if (!existingAlert && open) {
      setThreshold(String(rateType === 'buy' ? currentBuyRate : currentSellRate));
    }
  }, [rateType, currentBuyRate, currentSellRate, existingAlert, open]);

  const currentRate = rateType === 'buy' ? currentBuyRate : currentSellRate;

  const handleSubmit = async () => {
    const thresholdNum = parseFloat(threshold);
    if (isNaN(thresholdNum) || thresholdNum <= 0) {
      setError('Please enter a valid threshold price');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isEdit && existingAlert) {
        await alertService.updateAlert(existingAlert.id, {
          condition,
          rateType,
          threshold: thresholdNum,
          triggerMode,
          cooldownMinutes: parseInt(cooldownMinutes) || 30,
        });
      } else {
        await alertService.createAlert({
          dealerName,
          scriptName,
          condition,
          rateType,
          threshold: thresholdNum,
          triggerMode,
          cooldownMinutes: parseInt(cooldownMinutes) || 30,
        });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save alert');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            {isEdit ? 'Edit Alert' : 'Set Price Alert'}
          </DialogTitle>
          <DialogDescription>
            {dealerName} — {scriptName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Rate Type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Rate Type</Label>
            <ToggleGroup
              type="single"
              value={rateType}
              onValueChange={(v: 'buy' | 'sell') => v && setRateType(v)}
              className="grid grid-cols-2 w-full h-11 bg-muted/50 rounded-lg p-1 gap-1"
            >
              <ToggleGroupItem
                value="buy"
                className="text-sm font-medium data-[state=on]:bg-blue-500 data-[state=on]:text-white data-[state=on]:shadow-sm rounded-md h-full"
              >
                Buy
              </ToggleGroupItem>
              <ToggleGroupItem
                value="sell"
                className="text-sm font-medium data-[state=on]:bg-orange-500 data-[state=on]:text-white data-[state=on]:shadow-sm rounded-md h-full"
              >
                Sell
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              Current {rateType} rate: <span className="font-mono font-semibold">{formatCurrency(currentRate)}</span>
            </p>
          </div>

          {/* Condition */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Alert when price goes</Label>
            <ToggleGroup
              type="single"
              value={condition}
              onValueChange={(v: 'above' | 'below') => v && setCondition(v)}
              className="grid grid-cols-2 w-full h-11 bg-muted/50 rounded-lg p-1 gap-1"
            >
              <ToggleGroupItem
                value="above"
                className="text-sm font-medium data-[state=on]:bg-red-500 data-[state=on]:text-white data-[state=on]:shadow-sm rounded-md h-full"
              >
                Above
              </ToggleGroupItem>
              <ToggleGroupItem
                value="below"
                className="text-sm font-medium data-[state=on]:bg-green-500 data-[state=on]:text-white data-[state=on]:shadow-sm rounded-md h-full"
              >
                Below
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Threshold */}
          <div className="space-y-2">
            <Label htmlFor="threshold" className="text-sm font-medium">Threshold Price</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₹</span>
              <Input
                id="threshold"
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="pl-7 h-12 text-lg font-mono"
                placeholder="Enter price"
                step="0.01"
              />
            </div>
          </div>

          {/* Summary */}
          <div className={cn(
            "p-3 rounded-lg text-sm",
            "bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40"
          )}>
            Alert when <span className="font-semibold">{rateType}</span> rate goes{' '}
            <span className="font-semibold">{condition}</span>{' '}
            <span className="font-mono font-bold">{formatCurrency(parseFloat(threshold) || 0)}</span>
          </div>

          {/* Advanced Options (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 pl-1">
                {/* Trigger Mode */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Trigger Mode</Label>
                  <ToggleGroup
                    type="single"
                    value={triggerMode}
                    onValueChange={(v: 'one_shot' | 'persistent') => v && setTriggerMode(v)}
                    className="grid grid-cols-2 w-full h-10 bg-muted/50 rounded-lg p-1 gap-1"
                  >
                    <ToggleGroupItem
                      value="one_shot"
                      className="text-xs font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm rounded-md h-full"
                    >
                      One-shot
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="persistent"
                      className="text-xs font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm rounded-md h-full"
                    >
                      Persistent
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <p className="text-xs text-muted-foreground">
                    {triggerMode === 'one_shot'
                      ? 'Fires once then deactivates'
                      : 'Fires repeatedly with cooldown'}
                  </p>
                </div>

                {/* Cooldown */}
                {triggerMode === 'persistent' && (
                  <div className="space-y-2">
                    <Label htmlFor="cooldown" className="text-sm font-medium">Cooldown (minutes)</Label>
                    <Input
                      id="cooldown"
                      type="number"
                      value={cooldownMinutes}
                      onChange={(e) => setCooldownMinutes(e.target.value)}
                      min={5}
                      max={10080}
                      className="h-10"
                    />
                    <p className="text-xs text-muted-foreground">Min 5 min, max 7 days</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500 font-medium">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="gap-2">
            {loading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
            {isEdit ? 'Update Alert' : 'Create Alert'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
