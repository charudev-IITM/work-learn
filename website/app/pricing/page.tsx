"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { Check, ArrowRight, Zap, Store, Code2, Mail } from "lucide-react";

const features = [
  "100+ live dealer connections",
  "17+ cities covered",
  "Sub-second real-time updates",
  "Multiple watchlists",
  "Buy / Sell / Differences modes",
  "Drag & drop ordering",
  "Built-in calculator",
  "Live bullion news",
  "SONA AI Agent — ask anything about rates",
  "Smart BEST rate detection",
  "Price alerts",
  "Mobile-first design",
  "Secure authentication",
  "Priority support",
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const monthlyTotal = 1179;   // 999 + 18% GST
  const annualTotal = 11799;   // 9999 + 18% GST
  const annualMonthly = Math.round(annualTotal / 12); // ₹983/mo
  const displayPrice = annual ? annualMonthly : monthlyTotal;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-32 lg:pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gold-500/[0.04] rounded-full blur-[150px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-4"
          >
            Pricing
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
          >
            Simple, <span className="text-gradient-gold">Transparent</span> Pricing
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/40 max-w-xl mx-auto"
          >
            One plan. All features. No hidden fees.
          </motion.p>
        </div>
      </section>

      {/* Pricing Card */}
      <section ref={ref} className="py-10 lg:py-16">
        <div className="max-w-lg mx-auto px-6 lg:px-8">
          {/* Billing Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center gap-4 mb-10"
          >
            <span
              className={`text-sm font-medium transition-colors ${
                !annual ? "text-white" : "text-white/40"
              }`}
            >
              Monthly
            </span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
                annual ? "bg-gold-500" : "bg-white/10"
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-obsidian transition-transform duration-300 ${
                  annual ? "translate-x-7" : "translate-x-0"
                }`}
              />
            </button>
            <span
              className={`text-sm font-medium transition-colors ${
                annual ? "text-white" : "text-white/40"
              }`}
            >
              Annual
            </span>
            {annual && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-full"
              >
                2 Months Free
              </motion.span>
            )}
          </motion.div>

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="glass-gold rounded-3xl p-8 lg:p-10 glow-gold-strong"
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
                <Zap className="w-5 h-5 text-obsidian" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Pro</h3>
                <p className="text-xs text-white/40">Full platform access</p>
              </div>
            </div>

            {/* Price */}
            <div className="mb-8">
              <div className="flex items-baseline gap-1">
                <span className="text-5xl lg:text-6xl font-bold text-white font-mono">
                  &#8377;{displayPrice}
                </span>
                <span className="text-white/40 text-sm">/month</span>
              </div>
              {annual && (
                <p className="text-sm text-white/30 mt-2">
                  &#8377;{annualTotal.toLocaleString("en-IN")} billed annually
                  <span className="line-through ml-2 text-white/20">
                    &#8377;{(monthlyTotal * 12).toLocaleString("en-IN")}
                  </span>
                </p>
              )}
              {!annual && (
                <p className="text-sm text-white/30 mt-2">
                  Switch to annual — get <span className="text-emerald-400 font-medium">2 months free</span>
                </p>
              )}
            </div>

            {/* CTA */}
            <Link
              href="https://app.spotcompare.com"
              className="flex items-center justify-center gap-2 w-full py-4 text-sm font-semibold rounded-xl btn-gold mb-8"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>

            {/* Features List */}
            <div className="space-y-3.5">
              <p className="text-xs uppercase tracking-wider text-white/30 font-semibold mb-4">
                Everything Included
              </p>
              {features.map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-gold-500/10 border border-gold-500/25 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-gold-400" />
                  </div>
                  <span className="text-sm text-white/60">{feature}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Note */}
          <p className="text-center text-xs text-white/20 mt-6">
            All prices in INR. Prices include 18% GST.
          </p>
        </div>
      </section>

      {/* Dealer Signup & Data Integration */}
      <section className="py-16 lg:py-24">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Dealer Signup */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6 }}
              className="glass-gold rounded-2xl p-8"
            >
              <div className="w-11 h-11 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mb-5">
                <Store className="w-5 h-5 text-gold-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Are You a Bullion Dealer?</h3>
              <p className="text-sm text-white/40 leading-relaxed mb-6">
                Get your rates listed on SpotCompare and reach thousands of traders
                across India. We&apos;ll work with you to get your live rates on the platform.
              </p>
              <a
                href="mailto:onboarding@spotcompare.com"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gold-400 hover:text-gold-300 transition-colors"
              >
                <Mail className="w-4 h-4" />
                onboarding@spotcompare.com
              </a>
            </motion.div>

            {/* Data Integration */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="glass-gold rounded-2xl p-8"
            >
              <div className="w-11 h-11 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mb-5">
                <Code2 className="w-5 h-5 text-gold-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Need Data Integration?</h3>
              <p className="text-sm text-white/40 leading-relaxed mb-6">
                Integrate live bullion rates into your own applications, trading systems,
                or analytics dashboards. Get in touch for integration documentation and pricing.
              </p>
              <a
                href="mailto:api@spotcompare.com"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gold-400 hover:text-gold-300 transition-colors"
              >
                <Mail className="w-4 h-4" />
                api@spotcompare.com
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ link */}
      <section className="py-16 text-center">
        <p className="text-white/40 text-sm">
          Have questions?{" "}
          <Link href="/faq" className="text-gold-400 hover:text-gold-300 transition-colors">
            Check our FAQ
          </Link>{" "}
          or{" "}
          <Link href="/contact" className="text-gold-400 hover:text-gold-300 transition-colors">
            contact us
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
