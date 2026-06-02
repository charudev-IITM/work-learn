import React, { useState } from 'react';
import { AlertCircle, Loader2, User, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/cn';

export function OnboardingForm() {
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
    } catch {
      // Error handled by context
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.1))',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}
        >
          <Sparkles className="w-6 h-6" style={{ color: '#f59e0b' }} />
        </div>
        <h2 className="text-lg font-medium mb-1" style={{ color: '#fafafa' }}>
          Almost There
        </h2>
        <p className="text-sm" style={{ color: '#78716c' }}>
          Tell us a bit about yourself
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-4 p-3 rounded-lg flex items-start gap-2"
          style={{
            background: 'rgba(180, 83, 50, 0.12)',
            border: '1px solid rgba(212, 132, 106, 0.2)',
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#d4846a' }} />
          <div className="text-sm" style={{ color: '#e0a48d' }}>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name field */}
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: '#a8a29e' }}>
            Your Name <span style={{ color: '#f59e0b' }}>*</span>
          </label>
          <div className="relative">
            <User
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: '#57534e' }}
            />
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter your name"
              className={cn(
                "w-full h-12 pl-10 pr-4 text-base rounded-xl outline-none transition-all duration-200",
                "placeholder:text-stone-600",
                formErrors.name && "ring-1 ring-[#d4846a]/40"
              )}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fafafa',
              }}
              disabled={isLoading}
              autoFocus
              autoComplete="name"
              maxLength={100}
            />
          </div>
          {formErrors.name && (
            <p className="text-xs" style={{ color: '#d4846a' }}>{formErrors.name}</p>
          )}
        </div>

        {/* Business field */}
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: '#a8a29e' }}>
            Business Name{' '}
            <span className="font-normal" style={{ color: '#57534e' }}>(optional)</span>
          </label>
          <input
            type="text"
            value={business}
            onChange={(e) => handleBusinessChange(e.target.value)}
            placeholder="Your business or company"
            className={cn(
              "w-full h-12 px-4 text-base rounded-xl outline-none transition-all duration-200",
              "placeholder:text-stone-600",
              formErrors.business && "ring-1 ring-[#d4846a]/40"
            )}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fafafa',
            }}
            disabled={isLoading}
            autoComplete="organization"
            maxLength={200}
          />
          {formErrors.business && (
            <p className="text-xs" style={{ color: '#d4846a' }}>{formErrors.business}</p>
          )}
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            className="w-full h-12 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 active:scale-[0.98]"
            style={{
              background: isLoading || !name.trim()
                ? 'rgba(245, 158, 11, 0.15)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: isLoading || !name.trim() ? '#92400e' : '#0a0a0a',
              boxShadow: isLoading || !name.trim()
                ? 'none'
                : '0 4px 16px rgba(245, 158, 11, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Setting up...</span>
              </div>
            ) : (
              'Get Started'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
