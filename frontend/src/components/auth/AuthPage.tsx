import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { PhoneInput } from './PhoneInput';
import { OTPInput } from './OTPInput';
import { OnboardingForm } from './OnboardingForm';
import { useAuth } from '../../contexts/AuthContext';
import { useStats } from '../../hooks/useStats';

export function AuthPage() {
  const { flowStep } = useAuth();
  const stats = useStats();
  const [displacedMsg, setDisplacedMsg] = useState<string | null>(null);

  useEffect(() => {
    const msg = sessionStorage.getItem('auth:displaced_msg');
    if (msg) {
      setDisplacedMsg(msg);
      sessionStorage.removeItem('auth:displaced_msg');
    }
  }, []);

  const renderFlow = () => {
    switch (flowStep) {
      case 'otp_verification':
        return <OTPInput />;
      case 'onboarding':
        return <OnboardingForm />;
      default:
        return <PhoneInput />;
    }
  };

  return (
    <div className="min-h-screen relative" style={{ background: '#0a0a0a' }}>
      {/* ── Ambient gold glow (percentage-based to avoid overflow on narrow screens) ── */}
      <div
        className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[150vw] max-w-[600px] aspect-square rounded-full opacity-[0.07]"
        style={{
          background: 'radial-gradient(circle, #f59e0b 0%, #b45309 40%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute bottom-[-10%] right-0 w-[100vw] max-w-[400px] aspect-square rounded-full opacity-[0.04]"
        style={{
          background: 'radial-gradient(circle, #fcd34d 0%, transparent 60%)',
          filter: 'blur(60px)',
        }}
      />

      {/* ── Subtle grain overlay ── */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ── Main layout ── */}
      <div className="relative z-10 min-h-screen flex flex-col">

        {/* ── Brand header ── */}
        <div className="pt-12 pb-2 px-6">
          <div className="flex flex-col items-center">
            {/* Logo mark + wordmark */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                  boxShadow: '0 0 24px rgba(251, 191, 36, 0.25)',
                }}
              >
                <TrendingUp className="w-5 h-5" style={{ color: '#050505' }} strokeWidth={2.5} />
              </div>
              <h1
                className="text-2xl font-semibold tracking-tight"
                style={{ color: '#fafafa' }}
              >
                Spot
                <span
                  style={{
                    background: 'linear-gradient(135deg, #fcd34d 0%, #f59e0b 50%, #d97706 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Compare
                </span>
              </h1>
            </div>

            <div
              className="text-[11px] tracking-[0.25em] uppercase"
              style={{ color: '#a8a29e' }}
            >
              Bullion Intelligence
            </div>

            {/* Gold accent line */}
            <div
              className="mt-4 w-16 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)',
              }}
            />
          </div>
        </div>

        {/* ── Session displaced warning ── */}
        {displacedMsg && (
          <div className="mx-auto max-w-sm px-6 mt-4">
            <div
              className="rounded-lg p-3 flex items-start gap-2"
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
              <div className="text-sm" style={{ color: '#fcd34d' }}>{displacedMsg}</div>
            </div>
          </div>
        )}

        {/* ── Auth form ── */}
        <div className="flex-1 flex items-start justify-center pt-8 pb-8 px-3 sm:px-5">
          <div className="w-full max-w-sm">
            <div
              className="rounded-2xl p-4 sm:p-6"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
              }}
            >
              {renderFlow()}
            </div>

            {/* ── Trust strip ── */}
            <div className="mt-8 flex items-center justify-center gap-6">
              {[
                { icon: '◈', label: 'Secure' },
                { icon: '◉', label: 'Real-time' },
                { icon: '◆', label: `${stats.dealers}+ Dealers` },
              ].map((item) => (
                <span
                  key={item.label}
                  className="flex items-center gap-1.5 text-[11px] tracking-wide"
                  style={{ color: '#78716c' }}
                >
                  <span style={{ color: '#a8a29e', fontSize: '8px' }}>{item.icon}</span>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="pb-8 px-6">
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-12 h-px mb-2"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
              }}
            />
            <p className="text-[11px]" style={{ color: '#57534e' }}>
              &copy; {new Date().getFullYear()} Spot Compare
            </p>
            <div className="flex items-center gap-1 text-[11px]" style={{ color: '#44403c' }}>
              <span>Made with</span>
              <span style={{ color: '#ef4444' }}>&hearts;</span>
              <span>by</span>
              <a
                href="https://zettatech.in"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors"
                style={{ color: '#78716c', fontWeight: 500 }}
              >
                Zetta Tech
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
