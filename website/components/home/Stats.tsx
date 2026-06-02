"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useInView } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { Users, BarChart3, Zap, Shield } from "lucide-react";
import { useStats } from "@/lib/useStats";

/* ── Single Stat Card ─────────────────────────────────── */
function StatCard({
  icon: Icon,
  value,
  suffix,
  prefix,
  label,
  delay,
  inView,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  delay: number;
  inView: boolean;
}) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (inView) {
      // Small delay to stagger the NumberFlow animations
      const timer = setTimeout(() => setDisplayed(value), delay * 1000);
      return () => clearTimeout(timer);
    }
  }, [inView, value, delay]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      className="relative group"
    >
      <div className="glass glass-shimmer rounded-2xl p-8 text-center transition-all duration-500 hover:border-gold-500/20 hover:bg-gold-500/[0.02]">
        {/* Icon */}
        <div className="w-12 h-12 mx-auto mb-5 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center group-hover:bg-gold-500/15 transition-colors duration-300">
          <Icon className="w-5 h-5 text-gold-400" />
        </div>

        {/* Value */}
        <div className="text-4xl lg:text-5xl font-bold tracking-tight text-white mb-2 font-mono">
          {prefix}
          <NumberFlow
            value={displayed}
            spinTiming={{ duration: 1500 }}
            transformTiming={{ duration: 600 }}
          />
          {suffix}
        </div>

        {/* Label */}
        <p className="text-sm text-white/40 font-medium">{label}</p>

        {/* Glow on hover */}
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-b from-gold-500/[0.04] to-transparent" />
      </div>
    </motion.div>
  );
}

/* ── Stats Section ────────────────────────────────────── */
export function Stats() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const { dealers, cities } = useStats();

  const stats = [
    { icon: Users, value: dealers, suffix: "+", label: "Dealers Tracked", prefix: "" },
    { icon: BarChart3, value: cities, suffix: "+", label: "Cities Covered", prefix: "" },
    { icon: Zap, value: 1, suffix: "s", label: "Update Speed", prefix: "<" },
    { icon: Shield, value: 99, suffix: "%", label: "Uptime", prefix: "" },
  ];

  return (
    <section ref={ref} className="relative py-28 lg:py-36">
      <div className="absolute inset-0 gradient-mesh opacity-50" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-3">
            By the Numbers
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Built for <span className="shiny-text-gold" style={{ "--shiny-speed": "4s" } as React.CSSProperties}>Speed &amp; Scale</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
          {stats.map((stat, i) => (
            <StatCard key={stat.label} {...stat} delay={0.1 + i * 0.15} inView={isInView} />
          ))}
        </div>
      </div>
    </section>
  );
}
