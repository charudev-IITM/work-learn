import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/cn';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

interface CountryCode {
  code: string;
  country: string;
  flag: string;
  label: string;
  maxDigits: number;
}

const COUNTRY_CODES: CountryCode[] = [
  { code: '+91', country: 'IN', flag: '\u{1F1EE}\u{1F1F3}', label: 'India', maxDigits: 10 },
  { code: '+1', country: 'US', flag: '\u{1F1FA}\u{1F1F8}', label: 'US/Canada', maxDigits: 10 },
  { code: '+971', country: 'AE', flag: '\u{1F1E6}\u{1F1EA}', label: 'UAE', maxDigits: 9 },
];

export function PhoneInput() {
  const { sendOTP, isLoading, error, clearError } = useAuth();
  const [phone, setPhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [formError, setFormError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current) return;

    const existingScript = document.querySelector('script[src*="turnstile"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      script.onload = () => renderTurnstile();
    } else {
      renderTurnstile();
    }

    function renderTurnstile() {
      if (!(window as any).turnstile || !turnstileRef.current) return;
      while (turnstileRef.current.firstChild) {
        turnstileRef.current.removeChild(turnstileRef.current.firstChild);
      }
      (window as any).turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        size: 'compact',
        appearance: 'interaction-only',
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(null),
        theme: 'dark',
      });
    }
  }, []);

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, selectedCountry.maxDigits);
    setPhone(digits);
    if (formError) setFormError('');
    if (error) clearError();
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone || phone.length < 7) {
      setFormError('Please enter a valid phone number');
      return;
    }

    try {
      let captchaToken: string | undefined;
      if (TURNSTILE_SITE_KEY && turnstileToken) {
        captchaToken = turnstileToken;
      }

      await sendOTP(`${selectedCountry.code}${phone}`, captchaToken, 'turnstile');
    } catch {
      // Error handled by context
    }
  }, [phone, selectedCountry, sendOTP, turnstileToken]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-6">
        <h2
          className="text-lg font-medium mb-1"
          style={{ color: '#fafafa' }}
        >
          Welcome
        </h2>
        <p className="text-sm" style={{ color: '#78716c' }}>
          Enter your phone number to get started
        </p>
      </div>

      {/* Error display */}
      {(error || formError) && (
        <div
          className="mb-4 p-3 rounded-lg flex items-start gap-2"
          style={{
            background: 'rgba(180, 83, 50, 0.12)',
            border: '1px solid rgba(212, 132, 106, 0.2)',
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#d4846a' }} />
          <div className="text-sm" style={{ color: '#e0a48d' }}>{error || formError}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: '#a8a29e' }}>
            Phone Number
          </label>
          <div className="flex gap-2">
            {/* Country code selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCountryPicker(!showCountryPicker)}
                className="h-12 px-3 flex items-center gap-1.5 rounded-xl text-sm font-medium transition-colors"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#e7e5e4',
                }}
              >
                <span className="text-base">{selectedCountry.flag}</span>
                <span>{selectedCountry.code}</span>
                <ChevronDown className="w-3 h-3" style={{ color: '#78716c' }} />
              </button>

              {showCountryPicker && (
                <div
                  className="absolute top-full left-0 mt-1 w-48 rounded-lg shadow-xl z-50 overflow-hidden"
                  style={{
                    background: '#1c1917',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  {COUNTRY_CODES.map((country) => (
                    <button
                      key={country.country}
                      type="button"
                      onClick={() => {
                        setSelectedCountry(country);
                        setShowCountryPicker(false);
                        setPhone('');
                      }}
                      className={cn(
                        "w-full px-3 py-2.5 flex items-center gap-2 text-sm text-left transition-colors",
                        selectedCountry.country === country.country
                          ? "bg-amber-500/10"
                          : "hover:bg-white/5"
                      )}
                    >
                      <span className="text-base">{country.flag}</span>
                      <span className="font-medium" style={{ color: '#e7e5e4' }}>{country.code}</span>
                      <span style={{ color: '#78716c' }}>{country.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Phone number input */}
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="Phone number"
              className={cn(
                "flex-1 min-w-0 h-12 px-4 text-base rounded-xl outline-none transition-all duration-200",
                "placeholder:text-stone-600",
                formError && "ring-1 ring-[#d4846a]/40"
              )}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fafafa',
              }}
              disabled={isLoading}
              autoComplete="tel"
            />
          </div>
        </div>

        {/* Turnstile — must be on-screen for challenge to work; clip overflow to prevent layout shift */}
        {TURNSTILE_SITE_KEY && (
          <div style={{ height: turnstileToken ? 0 : 'auto', overflow: 'hidden' }}>
            <div
              ref={turnstileRef}
              className="flex justify-center"
            />
          </div>
        )}

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading || phone.length < 7}
            className="w-full h-12 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 active:scale-[0.98]"
            style={{
              background: isLoading || phone.length < 7
                ? 'rgba(245, 158, 11, 0.15)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: isLoading || phone.length < 7 ? '#92400e' : '#0a0a0a',
              boxShadow: isLoading || phone.length < 7
                ? 'none'
                : '0 4px 16px rgba(245, 158, 11, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sending OTP...</span>
              </div>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
