"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Send, Mail, MapPin, Clock, CheckCircle, Loader2 } from "lucide-react";

// Replace with your real Turnstile site key from Cloudflare dashboard
const TURNSTILE_SITE_KEY = "0x4AAAAAACqABnmr8Cq7v3LD";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      getResponse: (widgetId: string) => string | undefined;
    };
    onTurnstileLoad?: () => void;
  }
}

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderTurnstile = useCallback(() => {
    if (window.turnstile && turnstileRef.current && !widgetIdRef.current) {
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "dark",
        callback: (token: string) => setCaptchaToken(token),
        "expired-callback": () => setCaptchaToken(null),
        "error-callback": () => setCaptchaToken(null),
      });
    }
  }, []);

  useEffect(() => {
    // Load Turnstile script
    if (document.querySelector('script[src*="turnstile"]')) {
      renderTurnstile();
      return;
    }

    window.onTurnstileLoad = renderTurnstile;

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      window.onTurnstileLoad = undefined;
    };
  }, [renderTurnstile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!captchaToken) {
      setError("Please complete the captcha verification.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("https://formsubmit.co/ajax/hello@spotcompare.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          subject: formData.subject,
          message: formData.message,
          _subject: "SpotCompare Contact Form",
        }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError("Something went wrong. Please try again or email us directly.");
      }
    } catch {
      setError("Network error. Please try again or email us directly.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-32 lg:pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-4"
          >
            Contact
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
          >
            Get in <span className="text-gradient-gold">Touch</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/40 max-w-xl mx-auto"
          >
            Have a question, feedback, or want to request access? We&apos;d love to hear from you.
          </motion.p>
        </div>
      </section>

      {/* Contact Form + Info */}
      <section className="py-10 lg:py-16">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-10 lg:gap-16">
            {/* Info Cards */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="lg:col-span-2 space-y-5"
            >
              <div className="glass-gold rounded-xl p-6">
                <Mail className="w-5 h-5 text-gold-400 mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">Email</h3>
                <p className="text-sm text-white/40">hello@spotcompare.com</p>
              </div>
              <div className="glass-gold rounded-xl p-6">
                <MapPin className="w-5 h-5 text-gold-400 mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">Locations</h3>
                <p className="text-sm text-white/40">India & United States</p>
              </div>
              <div className="glass-gold rounded-xl p-6">
                <Clock className="w-5 h-5 text-gold-400 mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">Response Time</h3>
                <p className="text-sm text-white/40">Within 24 hours</p>
              </div>
            </motion.div>

            {/* Form */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="lg:col-span-3"
            >
              {submitted ? (
                <div className="glass-gold rounded-2xl p-10 text-center">
                  <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <CheckCircle className="w-7 h-7 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Message Sent!</h3>
                  <p className="text-sm text-white/40">
                    Thank you for reaching out. We&apos;ll get back to you within 24 hours.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="glass-gold rounded-2xl p-8 space-y-5"
                >
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                        Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-3 text-sm bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/20 transition-all"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-3 text-sm bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/20 transition-all"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                      Subject
                    </label>
                    <input
                      type="text"
                      name="subject"
                      required
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-4 py-3 text-sm bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/20 transition-all"
                      placeholder="How can we help?"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                      Message
                    </label>
                    <textarea
                      name="message"
                      required
                      rows={5}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full px-4 py-3 text-sm bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/40 focus:ring-1 focus:ring-gold-500/20 transition-all resize-none"
                      placeholder="Tell us more..."
                    />
                  </div>
                  {/* Cloudflare Turnstile CAPTCHA */}
                  <div ref={turnstileRef} className="flex justify-center" />
                  <button
                    type="submit"
                    disabled={sending || !captchaToken}
                    className="flex items-center justify-center gap-2 w-full py-3.5 text-sm font-semibold rounded-xl btn-gold disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        Send Message
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  {error && (
                    <p className="text-sm text-red-400 text-center">{error}</p>
                  )}
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
