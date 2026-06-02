import React, { useState } from 'react';
import { AlertCircle, Loader2, User, Briefcase, ArrowRight } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { useAuth } from '../../../contexts/AuthContext';
import { cn } from '../../../lib/cn';

interface ProfileStepProps {
  onNext: () => void;
}

export function ProfileStep({ onNext }: ProfileStepProps) {
  const { completeOnboarding, isLoading, error, clearError, pendingPhone } = useAuth();
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleNameChange = (value: string) => {
    setName(value);
    if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: '' }));
    if (error) clearError();
  };

  const handleBusinessChange = (value: string) => {
    setBusiness(value);
    if (formErrors.business) setFormErrors((prev) => ({ ...prev, business: '' }));
    if (error) clearError();
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      errors.name = 'Name is required';
    } else if (trimmedName.length < 2) {
      errors.name = 'Name must be at least 2 characters';
    } else if (trimmedName.length > 100) {
      errors.name = 'Name must be under 100 characters';
    }
    const trimmedBusiness = business.trim();
    if (trimmedBusiness && trimmedBusiness.length > 200) {
      errors.business = 'Business name must be under 200 characters';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !pendingPhone) return;

    try {
      await completeOnboarding({
        phone: pendingPhone,
        name: name.trim(),
        business: business.trim() || undefined,
      });
      // AuthContext will dispatch onboarding_wizard step, which triggers onNext
      // via the OnboardingWizard detecting the flow step change
      onNext();
    } catch {
      // Error handled by AuthContext
    }
  };

  return (
    <div className="flex-1 flex flex-col px-6 pb-8 pt-2">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/25">
          <User className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-1">
          Tell us about yourself
        </h1>
        <p className="text-sm text-muted-foreground">
          So we can personalize your experience
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <div className="space-y-4 flex-1">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium text-foreground/80">
              Your Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter your name"
                className={cn(
                  'h-12 pl-10 text-base rounded-xl',
                  formErrors.name && 'border-red-500 focus:border-red-500'
                )}
                disabled={isLoading}
                autoFocus
                autoComplete="name"
                maxLength={100}
              />
            </div>
            {formErrors.name && (
              <p className="text-xs text-red-600 dark:text-red-400">{formErrors.name}</p>
            )}
          </div>

          {/* Business */}
          <div className="space-y-2">
            <Label htmlFor="business" className="text-sm font-medium text-foreground/80">
              Business Name{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="business"
                type="text"
                value={business}
                onChange={(e) => handleBusinessChange(e.target.value)}
                placeholder="Your business or company"
                className={cn(
                  'h-12 pl-10 text-base rounded-xl',
                  formErrors.business && 'border-red-500 focus:border-red-500'
                )}
                disabled={isLoading}
                autoComplete="organization"
                maxLength={200}
              />
            </div>
            {formErrors.business && (
              <p className="text-xs text-red-600 dark:text-red-400">{formErrors.business}</p>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="shrink-0 pt-4">
          <Button
            type="submit"
            disabled={isLoading || !name.trim()}
            className="w-full h-14 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold text-base rounded-xl shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Setting up...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                Continue
                <ArrowRight className="w-5 h-5" />
              </div>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
