"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { ArrowRight, Lock } from "lucide-react";
import { ShinyText } from "@/components/effects/ShinyText";
import { useStats } from "@/lib/useStats";

/* ── Types ────────────────────────────────────────────── */
interface DealerRate {
  label: string;
  initial: string;
  goldBuy: number;
  goldSell: number;
  silverBuy: number;
  silverSell: number;
}

/* ── Masked dealer data (no real names or rates) ─────── */
const initialRates: DealerRate[] = [
  { label: "Dealer A", initial: "A", goldBuy: 73245, goldSell: 73395, silverBuy: 93150, silverSell: 93420 },
  { label: "Dealer B", initial: "B", goldBuy: 73210, goldSell: 73380, silverBuy: 93100, silverSell: 93390 },
  { label: "Dealer C", initial: "C", goldBuy: 73260, goldSell: 73410, silverBuy: 93180, silverSell: 93450 },
  { label: "Dealer D", initial: "D", goldBuy: 73195, goldSell: 73365, silverBuy: 93080, silverSell: 93360 },
  { label: "Dealer E", initial: "E", goldBuy: 73230, goldSell: 73400, silverBuy: 93130, silverSell: 93410 },
];

/* ── Blurred price display ───────────────────────────── */
function BlurredPrice({ value, flash, isBest }: { value: string; flash: boolean; isBest: boolean }) {
  return (
    <span
      className={`font-mono text-sm tabular-nums transition-colors duration-500 select-none ${
        flash ? "text-emerald-400" : "text-white/80"
      } ${isBest ? "text-gold-400 font-semibold" : ""}`}
      style={{ filter: "blur(6px)" }}
    >
      {value}
    </span>
  );
}

/* ── Blurred dealer name ─────────────────────────────── */
function BlurredDealer({ label, initial }: { label: string; initial: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-500/20 to-gold-600/10 border border-gold-500/20 flex items-center justify-center text-xs font-bold text-gold-400">
        {initial}
      </div>
      <div>
        <p className="text-sm font-medium text-white select-none" style={{ filter: "blur(5px)" }}>
          {label} Bullion
        </p>
        <p className="text-[10px] text-white/30 font-mono">Gold 999 · 10g</p>
      </div>
    </div>
  );
}

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

/* ── Live Demo Section ────────────────────────────────── */
export function LiveDemo() {
  const stats = useStats();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [rates, setRates] = useState(initialRates);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"gold" | "silver">("gold");
  const [lastUpdate, setLastUpdate] = useState("");

  const tickRates = useCallback(() => {
    const randomIdx = Math.floor(Math.random() * initialRates.length);
    setFlashIdx(randomIdx);
    setTimeout(() => setFlashIdx(null), 600);

    setRates((prev) =>
      prev.map((r) => ({
        ...r,
        goldBuy: r.goldBuy + Math.floor(Math.random() * 50) - 25,
        goldSell: r.goldSell + Math.floor(Math.random() * 50) - 25,
        silverBuy: r.silverBuy + Math.floor(Math.random() * 60) - 30,
        silverSell: r.silverSell + Math.floor(Math.random() * 60) - 30,
      }))
    );
    setLastUpdate(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    if (!isInView) return;
    const interval = setInterval(tickRates, 2200);
    return () => clearInterval(interval);
  }, [isInView, tickRates]);

  // Find best sell (lowest)
  const bestSellIdx = rates.reduce(
    (best, r, i) =>
      (viewMode === "gold" ? r.goldSell : r.silverSell) <
      (viewMode === "gold" ? rates[best].goldSell : rates[best].silverSell)
        ? i
        : best,
    0
  );

  return (
    <section ref={ref} className="relative py-28 lg:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-obsidian via-surface to-obsidian" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-14"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-3">
            Live Preview
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
            Watch Rates Move in <ShinyText speed={4}>Real Time</ShinyText>
          </h2>
          <p className="text-white/40 max-w-2xl mx-auto">
            See how SpotCompare tracks multiple dealers simultaneously.
            Sign up to unlock real dealer names and live rates.
          </p>
        </motion.div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <button
              onClick={() => setViewMode("gold")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                viewMode === "gold"
                  ? "bg-gold-500/20 text-gold-400 border border-gold-500/30"
                  : "text-white/40 hover:text-white/60 border border-transparent"
              }`}
            >
              Gold
            </button>
            <button
              onClick={() => setViewMode("silver")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                viewMode === "silver"
                  ? "bg-white/10 text-white border border-white/20"
                  : "text-white/40 hover:text-white/60 border border-transparent"
              }`}
            >
              Silver
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {lastUpdate && <>Updated {lastUpdate}</>}
          </div>
        </motion.div>

        {/* Rate Table - Masked with overlay */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="relative"
        >
          <div className="glass rounded-2xl overflow-hidden glow-gold">
            {/* Table Header */}
            <div className="grid grid-cols-4 gap-4 px-6 py-3.5 border-b border-white/[0.06] text-xs uppercase tracking-wider text-white/30 font-semibold">
              <div>Dealer</div>
              <div className="text-right">Buy Rate</div>
              <div className="text-right">Sell Rate</div>
              <div className="text-right">Spread</div>
            </div>

            {/* Table Body - blurred data */}
            {rates.map((rate, i) => {
              const buy = viewMode === "gold" ? rate.goldBuy : rate.silverBuy;
              const sell = viewMode === "gold" ? rate.goldSell : rate.silverSell;
              const spread = sell - buy;

              return (
                <div
                  key={rate.label}
                  className={`grid grid-cols-4 gap-4 px-6 py-4 border-b border-white/[0.03] transition-colors duration-300 ${
                    i === bestSellIdx ? "bg-gold-500/[0.03]" : ""
                  }`}
                >
                  <BlurredDealer label={rate.label} initial={rate.initial} />
                  <div className="flex items-center justify-end">
                    <BlurredPrice value={formatINR(buy)} flash={flashIdx === i} isBest={false} />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <BlurredPrice value={formatINR(sell)} flash={flashIdx === i} isBest={i === bestSellIdx} />
                    {i === bestSellIdx && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30 badge-best">
                        Best
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-end">
                    <span className="font-mono text-xs text-white/40 select-none" style={{ filter: "blur(5px)" }}>
                      {formatINR(spread)}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Gradient fade overlay */}
            <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-surface via-surface/80 to-transparent pointer-events-none" />

            {/* CTA overlay */}
            <div className="absolute inset-x-0 bottom-0 h-[50%] flex flex-col items-center justify-end pb-8 z-10">
              <div className="flex items-center gap-2 text-white/50 text-sm mb-4">
                <Lock className="w-4 h-4" />
                <span>Real dealer names &amp; live rates hidden</span>
              </div>
              <Link
                href="https://app.spotcompare.com"
                className="inline-flex items-center gap-2 px-7 py-3.5 text-sm font-semibold rounded-xl btn-gold"
              >
                Sign Up to Reveal
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </motion.div>

        <p className="text-center text-xs text-white/20 mt-4">
          {stats.dealers}+ dealers across {stats.cities}+ cities tracked in real time. Sign up to see actual rates.
        </p>
      </div>
    </section>
  );
}
