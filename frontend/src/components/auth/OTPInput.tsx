import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
const OTP_LENGTH = 4;
const RESEND_COOLDOWN = 30;

export function OTPInput() {
  const { verifyOTP, sendOTP, isLoading, error, clearError, pendingPhone, resetFlow } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN);
  const [focusIndex, setFocusIndex] = useState(0);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef(false);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  useEffect(() => {
    hiddenRef.current?.focus();

    if ('OTPCredential' in window) {
      const ac = new AbortController();
      navigator.credentials
        .get({ otp: { transport: ['sms'] }, signal: ac.signal } as any)
        .then((cred: any) => {
          if (cred?.code) {
            applyCode(cred.code.replace(/\D/g, '').slice(0, OTP_LENGTH));
          }
        })
        .catch(() => {});
      return () => ac.abort();
    }
  }, []);

  const applyCode = useCallback((code: string) => {
    const newDigits = code.split('').slice(0, OTP_LENGTH);
    while (newDigits.length < OTP_LENGTH) newDigits.push('');
    setDigits(newDigits);
    setFocusIndex(Math.min(code.length, OTP_LENGTH - 1));

    if (code.length >= OTP_LENGTH && pendingPhone && !submitRef.current) {
      submitRef.current = true;
      const fullCode = newDigits.slice(0, OTP_LENGTH).join('');
      handleSubmit(fullCode);
    }
  }, [pendingPhone]);

  const handleHiddenChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (error) clearError();
    const raw = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    applyCode(raw);
  }, [error, clearError, applyCode]);

  const handleHiddenKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (error) clearError();
      setDigits(prev => {
        const newDigits = [...prev];
        for (let i = OTP_LENGTH - 1; i >= 0; i--) {
          if (newDigits[i]) {
            newDigits[i] = '';
            setFocusIndex(i);
            break;
          }
        }
        return newDigits;
      });
      e.preventDefault();
    }
  }, [error, clearError]);

  const handleSubmit = async (otp?: string) => {
    const code = otp || digits.join('');
    if (code.length !== OTP_LENGTH || !pendingPhone) return;

    try {
      await verifyOTP(pendingPhone, code);
    } catch {
      submitRef.current = false;
      setDigits(Array(OTP_LENGTH).fill(''));
      setFocusIndex(0);
      if (hiddenRef.current) hiddenRef.current.value = '';
      setTimeout(() => hiddenRef.current?.focus(), 100);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || !pendingPhone) return;
    try {
      await sendOTP(pendingPhone, undefined, undefined, true);
      setResendTimer(RESEND_COOLDOWN);
      setDigits(Array(OTP_LENGTH).fill(''));
      setFocusIndex(0);
      submitRef.current = false;
      if (hiddenRef.current) hiddenRef.current.value = '';
      hiddenRef.current?.focus();
    } catch {
      // Error handled by context
    }
  };

  const hiddenValue = digits.join('');
  const isComplete = digits.every(d => d !== '');

  return (
    <div className="w-full">
      {/* Back button */}
      <button
        onClick={resetFlow}
        className="flex items-center gap-1 text-sm mb-4 transition-colors"
        style={{ color: '#78716c' }}
        disabled={isLoading}
      >
        <ArrowLeft className="w-4 h-4" />
        Change number
      </button>

      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-medium mb-1" style={{ color: '#fafafa' }}>
          Verify OTP
        </h2>
        <p className="text-sm" style={{ color: '#78716c' }}>
          Enter the 4-digit code sent to{' '}
          <span className="font-medium" style={{ color: '#d6d3d1' }}>
            {pendingPhone}
          </span>
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

      {/* OTP digit boxes */}
      <div
        className="relative flex justify-center gap-3 mb-6 cursor-text"
        onClick={() => hiddenRef.current?.focus()}
      >
        <input
          ref={hiddenRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          value={hiddenValue}
          onChange={handleHiddenChange}
          onKeyDown={handleHiddenKeyDown}
          disabled={isLoading}
          className="absolute inset-0 w-full h-full opacity-0 z-10"
          aria-label="Enter verification code"
        />

        {digits.map((digit, index) => {
          const isFocused = index === focusIndex && document.activeElement === hiddenRef.current;
          const isFilled = !!digit;
          return (
            <div
              key={index}
              className="w-14 h-14 flex items-center justify-center text-2xl font-semibold rounded-xl transition-all duration-200"
              style={{
                background: isFilled
                  ? 'rgba(245, 158, 11, 0.08)'
                  : 'rgba(255, 255, 255, 0.03)',
                border: `2px solid ${
                  isFilled
                    ? 'rgba(245, 158, 11, 0.5)'
                    : isFocused
                      ? 'rgba(245, 158, 11, 0.4)'
                      : 'rgba(255, 255, 255, 0.08)'
                }`,
                color: '#fafafa',
                boxShadow: isFocused ? '0 0 0 3px rgba(245, 158, 11, 0.1)' : 'none',
              }}
            >
              {digit || (
                isFocused ? (
                  <span
                    className="w-0.5 h-6 animate-pulse rounded-full"
                    style={{ background: '#f59e0b' }}
                  />
                ) : null
              )}
            </div>
          );
        })}
      </div>

      {/* Verify button */}
      <button
        onClick={() => handleSubmit()}
        disabled={isLoading || !isComplete}
        className="w-full h-12 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 active:scale-[0.98]"
        style={{
          background: isLoading || !isComplete
            ? 'rgba(245, 158, 11, 0.15)'
            : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: isLoading || !isComplete ? '#92400e' : '#0a0a0a',
          boxShadow: isLoading || !isComplete
            ? 'none'
            : '0 4px 16px rgba(245, 158, 11, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Verifying...</span>
          </div>
        ) : (
          'Verify'
        )}
      </button>

      {/* Resend */}
      <div className="mt-4 text-center">
        {resendTimer > 0 ? (
          <p className="text-sm" style={{ color: '#78716c' }}>
            Resend OTP in{' '}
            <span className="font-medium" style={{ color: '#d6d3d1' }}>
              {resendTimer}s
            </span>
          </p>
        ) : (
          <button
            onClick={handleResend}
            disabled={isLoading}
            className="text-sm font-medium transition-colors"
            style={{ color: '#f59e0b' }}
          >
            Resend OTP
          </button>
        )}
      </div>
    </div>
  );
}
