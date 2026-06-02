"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { TrendingUp, Target, Heart, Zap } from "lucide-react";
import { useStats } from "@/lib/useStats";

const values = [
  {
    icon: Zap,
    title: "Speed First",
    description:
      "In bullion trading, milliseconds matter. Every decision we make prioritizes speed — from sub-second live updates to instant screen rendering.",
  },
  {
    icon: Target,
    title: "Accuracy Always",
    description:
      "We ensure data accuracy with real-time validation and health monitoring. Stale data is detected and flagged instantly, so you never trade on outdated information.",
  },
  {
    icon: Heart,
    title: "Built for Traders",
    description:
      "SpotCompare was born from the daily frustrations of bullion market professionals. Every feature is shaped by real feedback from traders, dealers, and jewellers.",
  },
];

export default function AboutPage() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const stats = useStats();

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-32 lg:pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute top-1/3 left-1/3 w-[500px] h-[400px] bg-gold-500/[0.04] rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-4"
          >
            About
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
          >
            The Story Behind{" "}
            <span className="text-gradient-gold">SpotCompare</span>
          </motion.h1>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 lg:py-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7 }}
            className="space-y-6 text-white/50 leading-relaxed"
          >
            <p className="text-lg text-white/70">
              SpotCompare was built to solve a problem that every bullion trader in India faces
              daily: comparing rates across multiple dealers in real time.
            </p>
            <p>
              Before SpotCompare, traders had to manually check each dealer&apos;s website or app,
              one at a time. By the time they compared five or six dealers, the first rates
              had already changed. It was like trying to photograph a moving train — by the
              time you pressed the shutter, the moment was gone.
            </p>
            <p>
              We built SpotCompare to put all those rates on one screen, updating every
              second. No more tab-switching. No more phone calls. Just open SpotCompare and
              see every dealer&apos;s buy and sell rates, side by side, live.
            </p>
            <p>
              Today, SpotCompare tracks {stats.dealers}+ dealers across {stats.cities}+ cities in India, covering all major bullion
              markets. Our infrastructure is built for reliability and speed — with real-time
              data infrastructure, automatic health monitoring, and 99.9% uptime.
            </p>
            <p className="text-lg text-white/70">
              We&apos;re on a mission to bring transparency and speed to India&apos;s bullion
              market. One rate at a time.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Values */}
      <section ref={ref} className="py-16 lg:py-24">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            className="text-2xl sm:text-3xl font-bold text-center mb-14"
          >
            Our <span className="text-gradient-gold">Values</span>
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-6">
            {values.map((value, i) => {
              const Icon = value.icon;
              return (
                <motion.div
                  key={value.title}
                  initial={{ opacity: 0, y: 30 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.1 + i * 0.15, duration: 0.6 }}
                  className="glass-gold rounded-2xl p-7 text-center"
                >
                  <div className="w-12 h-12 mx-auto mb-5 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-gold-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-3">{value.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">
                    {value.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team / Founder */}
      <section className="py-16 lg:py-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 text-center">
          <div className="glass-gold rounded-2xl p-10 lg:p-14">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
              <TrendingUp className="w-10 h-10 text-obsidian" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Kamal Patwa</h3>
            <p className="text-sm text-gold-400 mb-4">Founder</p>
            <p className="text-sm text-white/40 leading-relaxed max-w-lg mx-auto">
              With over a decade of experience building large-scale distributed computing systems
              and data infrastructure handling billions of data points a day, Kamal built
              SpotCompare from the ground up — from the real-time data infrastructure
              to the mobile-first interface. His deep expertise in high-performance
              systems ensures SpotCompare delivers sub-second updates reliably at scale, giving
              traders a real edge in the market.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
