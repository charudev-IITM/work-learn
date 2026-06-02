import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, Store } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { cn } from '../../lib/cn';
import { submitDealerRequest } from '@comp-intel/shared/services/dealerRequests';

interface RequestDealerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestDealerDialog({ open, onOpenChange }: RequestDealerDialogProps) {
  const [formData, setFormData] = useState({
    dealerName: '',
    dealerUrl: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
    if (error) setError('');
  };

  const normalizeUrl = (raw: string) => {
    const trimmed = raw.trim();
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.dealerName.trim()) {
      errors.dealerName = 'Dealer name is required';
    }

    if (!formData.dealerUrl.trim()) {
      errors.dealerUrl = 'Website URL is required';
    } else {
      try {
        const url = new URL(normalizeUrl(formData.dealerUrl));
        if (!url.hostname.includes('.')) {
          errors.dealerUrl = 'Please enter a valid URL';
        }
      } catch {
        errors.dealerUrl = 'Please enter a valid URL';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError('');

    try {
      await submitDealerRequest({
        dealerName: formData.dealerName.trim(),
        dealerUrl: normalizeUrl(formData.dealerUrl),
        notes: formData.notes.trim() || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        resetAndClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setFormData({ dealerName: '', dealerUrl: '', notes: '' });
    setFormErrors({});
    setError('');
    setSuccess(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        resetAndClose();
      } else {
        setSuccess(false);
        onOpenChange(true);
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="w-5 h-5" />
            Request a Dealer
          </DialogTitle>
          <DialogDescription>
            Submit a bullion dealer you'd like us to add to the platform.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <p className="text-sm font-medium text-foreground">Request submitted!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="dealerName" className="text-sm font-medium">
                Dealer Name
              </Label>
              <Input
                id="dealerName"
                type="text"
                value={formData.dealerName}
                onChange={(e) => handleInputChange('dealerName', e.target.value)}
                placeholder="e.g. KJ Bullion"
                className={cn(
                  "h-11 text-sm",
                  formErrors.dealerName && "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                )}
                disabled={isSubmitting}
                autoFocus
              />
              {formErrors.dealerName && (
                <p className="text-xs text-red-600 dark:text-red-400">{formErrors.dealerName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dealerUrl" className="text-sm font-medium">
                Website URL
              </Label>
              <Input
                id="dealerUrl"
                type="text"
                value={formData.dealerUrl}
                onChange={(e) => handleInputChange('dealerUrl', e.target.value)}
                placeholder="e.g. kjbullion.com"
                className={cn(
                  "h-11 text-sm",
                  formErrors.dealerUrl && "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                )}
                disabled={isSubmitting}
              />
              {formErrors.dealerUrl && (
                <p className="text-xs text-red-600 dark:text-red-400">{formErrors.dealerUrl}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-sm font-medium">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Any additional info (e.g. city, platform type)"
                rows={2}
                maxLength={1000}
                className={cn(
                  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "ring-offset-background placeholder:text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "resize-none"
                )}
                disabled={isSubmitting}
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isSubmitting || !formData.dealerName || !formData.dealerUrl}
                className="w-full h-11"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting...</span>
                  </div>
                ) : (
                  "Submit Request"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
