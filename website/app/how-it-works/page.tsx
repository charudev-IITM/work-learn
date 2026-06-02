"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  UserPlus,
  ListPlus,
  Zap,
  Trophy,
  ArrowRight,
} from "lucide-react";
import { useStats } from "@/lib/useStats";

const staticSteps = [
  {
    icon: UserPlus,
    step: "01",
    title: "Create Your Account",
    description:
      "Sign up in seconds with OTP verification. Quick, simple, and secure — you'll be live in under two minutes.",
    detail: "Safe and secure authentication keeps your session protected across devices.",
  },
  {
    icon: ListPlus,
    step: "02",
    title: "Build Your Watchlist",
    description:
      "Search across all 100+ dealers and 17+ cities. Add the gold and silver rates you care about to your personalized watchlist. Create multiple watchlists for different strategies.",
    detail:
      "Real-time search shows live rates as you browse. Set multipliers for unit conversion.",
  },
  {
    icon: Zap,
    step: "03",
    title: "Watch Rates Update Live",
    description:
      "Once your watchlist is set, rates update every second automatically via our live connection. See prices move in real time with animated transitions and trend indicators.",
    detail:
      "Switch between Buy, Sell, and Differences mode to analyze from every angle.",
  },
  {
    icon: Trophy,
    step: "04",
    title: "Spot the Best Rate",
    description:
      "SpotCompare automatically highlights the best buy and sell rates with a 'BEST' badge. Sort by rate, dealer, or difference to find exactly what you need in milliseconds.",
    detail:
      "Use Differences mode to peg a reference dealer and see exactly how others compare.",
  },
];

function StepCard({
  step,
  index,
  inView,
}: {
  step: (typeof staticSteps)[0];
  index: number;
  inView: boolean;
}) {
  const Icon = step.icon;
  const isEven = index % 2 === 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: isEven ? -40 : 40 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ delay: 0.2 * index, duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
      className="relative"
    >
      <div className="glass-gold rounded-2xl p-8 lg:p-10 transition-all duration-300 hover:border-gold-500/30">
        <div className="flex items-start gap-6">
          {/* Step Number */}
          <div className="shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold-500/20 to-gold-600/10 border border-gold-500/25 flex items-center justify-center">
              <span className="text-xl font-bold text-gradient-gold font-mono">
                {step.step}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-3">
              <Icon className="w-5 h-5 text-gold-400" />
              <h3 className="text-xl font-semibold text-white">{step.title}</h3>
            </div>
            <p className="text-sm leading-relaxed text-white/50 mb-4">
              {step.description}
            </p>
            <p className="text-xs text-gold-500/60 leading-relaxed italic">
              {step.detail}
            </p>
          </div>
        </div>
      </div>

      {/* Connector line (except last) */}
      {index < staticSteps.length - 1 && (
        <div className="hidden lg:block absolute left-10 top-full w-px h-8 bg-gradient-to-b from-gold-500/20 to-transparent" />
      )}
    </motion.div>
  );
}

export default function HowItWorksPage() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const s = useStats();

  const steps = staticSteps.map((step) => {
    if (step.step === "02") {
      return {
        ...step,
        description: `Search across all ${s.dealers}+ dealers and ${s.cities}+ cities. Add the gold and silver rates you care about to your personalized watchlist. Create multiple watchlists for different strategies.`,
      };
    }
    return step;
  });

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-32 lg:pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[400px] bg-gold-500/[0.03] rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-4"
          >
            How it Works
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
          >
            From Signup to{" "}
            <span className="text-gradient-gold">Best Rate</span> in Minutes
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/40 max-w-2xl mx-auto"
          >
            Getting started with SpotCompare is simple. Four steps to transform how you
            track bullion rates.
          </motion.p>
        </div>
      </section>

      {/* Steps */}
      <section ref={ref} className="py-20 lg:py-28">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 space-y-8">
          {steps.map((step, i) => (
            <StepCard key={step.step} step={step} index={i} inView={isInView} />
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 lg:py-28">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
            Simple Enough? <span className="text-gradient-gold">Let&apos;s Go.</span>
          </h2>
          <p className="text-white/40 mb-8 max-w-lg mx-auto">
            Start tracking live bullion rates in under two minutes.
          </p>
          <Link
            href="https://app.spotcompare.com"
            className="inline-flex items-center gap-2 px-8 py-4 text-sm font-semibold rounded-xl btn-gold"
          >
            Get Started Now
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
