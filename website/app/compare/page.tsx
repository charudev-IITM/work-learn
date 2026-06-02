"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  X,
  Zap,
  BarChart3,
  Eye,
  ArrowLeftRight,
  Layers,
  GripVertical,
  Calculator,
  Newspaper,
  MapPin,
  RefreshCw,
  Shield,
  Smartphone,
  Bell,
  IndianRupee,
  Clock,
  TrendingDown,
} from "lucide-react";
import { ShinyText } from "@/components/effects/ShinyText";
import { useStats } from "@/lib/useStats";

/* ── Feature comparison data ─────────────────────────── */
const featureComparison = [
  { feature: "Real-time rate updates", spotcompare: true, traditional: "Delayed or manual refresh" },
  { feature: "100+ dealers tracked", spotcompare: true, traditional: "10–30 dealers" },
  { feature: "17+ cities covered", spotcompare: true, traditional: "1–5 cities" },
  { feature: "Sub-second update speed", spotcompare: true, traditional: false },
  { feature: "Buy / Sell / Differences modes", spotcompare: true, traditional: false },
  { feature: "Smart BEST rate detection", spotcompare: true, traditional: false },
  { feature: "Multiple watchlists", spotcompare: true, traditional: false },
  { feature: "Drag & drop ordering", spotcompare: true, traditional: false },
  { feature: "Built-in calculator", spotcompare: true, traditional: false },
  { feature: "Live bullion news (India + global)", spotcompare: true, traditional: false },
  { feature: "Price alerts", spotcompare: true, traditional: "Extra cost" },
  { feature: "Rate multipliers (x0.1 to x100)", spotcompare: true, traditional: false },
  { feature: "Mobile-first responsive design", spotcompare: true, traditional: "Desktop only or poor mobile" },
  { feature: "Auto-reconnect & session persistence", spotcompare: true, traditional: false },
  { feature: "Secure authentication", spotcompare: true, traditional: "Basic login" },
  { feature: "Data feed integration available", spotcompare: true, traditional: "Extra cost" },
  { feature: "Dealer onboarding program", spotcompare: true, traditional: false },
  { feature: "No setup or installation fees", spotcompare: true, traditional: false },
];

/* ── Cost comparison data ────────────────────────────── */
const costComparison = [
  { item: "Setup / Onboarding Fee", spotcompare: "Free", traditional: "₹50,000 – ₹2,00,000+" },
  { item: "Annual License / Maintenance", spotcompare: "Included", traditional: "₹15,000 – ₹50,000/yr" },
  { item: "Monthly Subscription", spotcompare: "₹983/mo (annual) or ₹1,179/mo", traditional: "N/A (paid upfront)" },
  { item: "Real-time Data Feed", spotcompare: "Included", traditional: "₹10,000 – ₹30,000/yr extra" },
  { item: "Price Alerts Add-on", spotcompare: "Included", traditional: "₹5,000 – ₹15,000/yr extra" },
  { item: "News Feed Access", spotcompare: "Included", traditional: "Not available or extra" },
  { item: "Calculator / Tools", spotcompare: "Included", traditional: "Not available" },
  { item: "Data Feed Integration", spotcompare: "Available on request", traditional: "₹25,000 – ₹1,00,000+ extra" },
  { item: "Mobile App / Responsive UI", spotcompare: "Included", traditional: "₹15,000 – ₹50,000 extra" },
  { item: "Total Year 1 Cost", spotcompare: "₹11,799 – ₹14,148", traditional: "₹75,000 – ₹4,00,000+" },
  { item: "Total Year 2+ Cost", spotcompare: "₹11,799 – ₹14,148/yr", traditional: "₹30,000 – ₹1,50,000+/yr" },
];

/* ── All features list ───────────────────────────────── */
const allFeatures = [
  { icon: Zap, title: "Sub-Second Updates", desc: "Rates refresh every second via live connections" },
  { icon: BarChart3, title: "100+ Dealers", desc: "India's largest bullion dealer coverage on one screen" },
  { icon: MapPin, title: "17+ Cities", desc: "Mumbai, Delhi, Jaipur, Chennai, Bengaluru, and more" },
  { icon: Eye, title: "Buy / Sell / Differences", desc: "Three viewing modes including reference-based comparison" },
  { icon: ArrowLeftRight, title: "Smart BEST Detection", desc: "Auto-highlights highest buy and lowest sell rates" },
  { icon: Layers, title: "Multiple Watchlists", desc: "Separate watchlists for gold, silver, or custom combos" },
  { icon: GripVertical, title: "Drag & Drop Ordering", desc: "Custom dealer arrangement that persists across sessions" },
  { icon: Calculator, title: "Built-in Calculator", desc: "Arithmetic on live rates, margins, totals, conversions" },
  { icon: Newspaper, title: "Live Bullion News", desc: "Curated India + global market news alongside rates" },
  { icon: Bell, title: "Price Alerts", desc: "Custom notifications when rates hit your target" },
  { icon: RefreshCw, title: "Auto-Reconnect", desc: "Seamless reconnection with session persistence" },
  { icon: Shield, title: "Secure Authentication", desc: "Encrypted sessions with secure access management" },
  { icon: Smartphone, title: "Mobile-First Design", desc: "Touch-optimized with haptic feedback and swipe gestures" },
];

/* ── Cell renderer for feature table ─────────────────── */
function StatusCell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <div className="flex items-center justify-center">
        <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        </div>
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex items-center justify-center">
        <div className="w-6 h-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <X className="w-3.5 h-3.5 text-red-400/60" />
        </div>
      </div>
    );
  }
  return <span className="text-xs text-white/30 text-center block">{value}</span>;
}

export default function ComparePage() {
  const stats = useStats();

  const featureComparison_ = featureComparison.map((row) => {
    if (row.feature === "100+ dealers tracked")
      return { ...row, feature: `${stats.dealers}+ dealers tracked` };
    if (row.feature === "17+ cities covered")
      return { ...row, feature: `${stats.cities}+ cities covered` };
    return row;
  });

  const allFeatures_ = allFeatures.map((f) => {
    if (f.title === "100+ Dealers")
      return { ...f, title: `${stats.dealers}+ Dealers` };
    if (f.title === "17+ Cities")
      return { ...f, title: `${stats.cities}+ Cities` };
    return f;
  });

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-32 lg:pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gold-500/[0.04] rounded-full blur-[150px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-4"
          >
            Why SpotCompare
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
          >
            Stop Overpaying for{" "}
            <ShinyText speed={4}>Outdated Platforms</ShinyText>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/40 max-w-2xl mx-auto mb-10"
          >
            Traditional bullion rate platforms charge ₹50,000+ upfront plus yearly maintenance fees —
            and still deliver fewer features. SpotCompare gives you more coverage, more tools, and
            real-time performance at a fraction of the cost.
          </motion.p>

          {/* Quick cost comparison highlight */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mb-6"
          >
            <div className="glass rounded-2xl px-8 py-5 text-center">
              <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Traditional Platforms</p>
              <p className="text-2xl font-bold text-red-400/80 font-mono line-through decoration-red-400/40">₹50,000+</p>
              <p className="text-[10px] text-white/20 mt-1">upfront + yearly fees</p>
            </div>
            <div className="text-white/20 text-2xl font-light hidden sm:block">vs</div>
            <div className="glass-gold rounded-2xl px-8 py-5 text-center glow-gold">
              <p className="text-xs text-gold-400/60 uppercase tracking-wider mb-1">SpotCompare</p>
              <p className="text-2xl font-bold text-gold-400 font-mono">₹983/mo</p>
              <p className="text-[10px] text-white/30 mt-1">everything included</p>
            </div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-xs text-white/20"
          >
            That&apos;s up to <span className="text-emerald-400 font-semibold">95% less</span> in your first year.
          </motion.p>
        </div>
      </section>

      {/* ── Feature-by-Feature Comparison Table ───────── */}
      <section className="py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.7 }}
            className="text-center mb-12"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-3">
              Feature Comparison
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              More Features, <ShinyText speed={4}>Less Cost</ShinyText>
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">
              Every feature listed below is included in your SpotCompare subscription.
              No add-ons. No hidden fees.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="glass rounded-2xl overflow-hidden"
          >
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_120px_120px] sm:grid-cols-[1fr_160px_160px] gap-2 px-5 sm:px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="text-xs uppercase tracking-wider text-white/30 font-semibold">Feature</div>
              <div className="text-xs uppercase tracking-wider text-gold-400 font-semibold text-center">SpotCompare</div>
              <div className="text-xs uppercase tracking-wider text-white/30 font-semibold text-center">Traditional</div>
            </div>

            {/* Table Rows */}
            {featureComparison_.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-[1fr_120px_120px] sm:grid-cols-[1fr_160px_160px] gap-2 px-5 sm:px-6 py-3.5 border-b border-white/[0.03] ${
                  i % 2 === 0 ? "" : "bg-white/[0.01]"
                }`}
              >
                <div className="text-sm text-white/60">{row.feature}</div>
                <StatusCell value={row.spotcompare} />
                <StatusCell value={row.traditional} />
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Cost Breakdown Table ──────────────────────── */}
      <section className="relative py-20 lg:py-28">
        <div className="absolute inset-0 bg-gradient-to-b from-obsidian via-surface to-obsidian pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.7 }}
            className="text-center mb-12"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-3">
              Cost Breakdown
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              The <ShinyText speed={4}>Real Cost</ShinyText> of Comparison
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">
              Traditional platforms lock you into hefty upfront payments and annual renewals.
              SpotCompare keeps it simple.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="glass rounded-2xl overflow-hidden"
          >
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-5 sm:px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="text-xs uppercase tracking-wider text-white/30 font-semibold">Cost Item</div>
              <div className="text-xs uppercase tracking-wider text-gold-400 font-semibold text-center">SpotCompare</div>
              <div className="text-xs uppercase tracking-wider text-white/30 font-semibold text-center">Traditional</div>
            </div>

            {/* Table Rows */}
            {costComparison.map((row, i) => {
              const isTotal = row.item.startsWith("Total");
              return (
                <div
                  key={row.item}
                  className={`grid grid-cols-[1fr_1fr_1fr] gap-2 px-5 sm:px-6 py-3.5 border-b border-white/[0.03] ${
                    isTotal ? "bg-gold-500/[0.03]" : i % 2 === 0 ? "" : "bg-white/[0.01]"
                  }`}
                >
                  <div className={`text-sm ${isTotal ? "text-white font-semibold" : "text-white/60"}`}>
                    {row.item}
                  </div>
                  <div className={`text-sm text-center ${
                    isTotal ? "text-gold-400 font-bold" : "text-emerald-400/80 font-medium"
                  }`}>
                    {row.spotcompare}
                  </div>
                  <div className={`text-sm text-center ${
                    isTotal ? "text-red-400/80 font-bold" : "text-white/30"
                  }`}>
                    {row.traditional}
                  </div>
                </div>
              );
            })}
          </motion.div>

          {/* Savings callout */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mt-8 glass-gold rounded-2xl p-6 sm:p-8 text-center"
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <TrendingDown className="w-5 h-5 text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Your Savings</p>
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-white mb-2 font-mono">
              Save ₹60,000 – ₹3,90,000+
            </p>
            <p className="text-sm text-white/40">
              in your first year alone by switching to SpotCompare
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── All Features Grid ────────────────────────── */}
      <section className="py-20 lg:py-28">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.7 }}
            className="text-center mb-14"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-3">
              Everything Included
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              All of This for <ShinyText speed={4}>₹983/month</ShinyText>
            </h2>
            <p className="text-white/40 max-w-xl mx-auto">
              No setup fees. No add-ons. No surprises. Every feature below ships with
              every SpotCompare subscription.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allFeatures_.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ delay: 0.05 * i, duration: 0.5 }}
                  className="glass rounded-xl p-5 flex items-start gap-4 group hover:border-gold-500/20 hover:bg-gold-500/[0.02] transition-all duration-300"
                >
                  <div className="w-9 h-9 shrink-0 rounded-lg bg-gold-500/10 border border-gold-500/20 flex items-center justify-center group-hover:bg-gold-500/15 transition-colors">
                    <Icon className="w-4 h-4 text-gold-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
                    <p className="text-xs text-white/35 leading-relaxed">{f.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Why Switch Summary ────────────────────────── */}
      <section className="py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <div className="grid sm:grid-cols-3 gap-6 mb-16">
            {[
              { icon: IndianRupee, title: "Save Up to 95%", desc: "No upfront fees. No annual maintenance. Just one simple monthly subscription." },
              { icon: Zap, title: "10x More Features", desc: "News, calculator, price alerts, multiple watchlists, drag & drop — all included." },
              { icon: Clock, title: "Start in 2 Minutes", desc: "Sign up, verify with OTP, and you're live. No installation, no waiting, no setup calls." },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.6 }}
                  className="text-center"
                >
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gold-500/15 to-gold-600/5 border border-gold-500/20 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-gold-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{item.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────── */}
      <section className="py-20 lg:py-28 relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gold-500/[0.06] rounded-full blur-[150px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative z-10 max-w-2xl mx-auto px-6 lg:px-8 text-center"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
            Switch to SpotCompare.{" "}
            <ShinyText speed={3}>Save Lakhs.</ShinyText>
          </h2>
          <p className="text-lg text-white/40 max-w-lg mx-auto mb-10 leading-relaxed">
            Join hundreds of traders and dealers who&apos;ve already made the switch.
            Sign up in 2 minutes with OTP verification — no setup fees, no commitments.
          </p>
          <Link
            href="https://app.spotcompare.com"
            className="inline-flex items-center gap-2 px-10 py-4.5 text-base font-semibold rounded-xl btn-gold"
          >
            Sign Up with OTP
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-xs text-white/20 mt-5">
            ₹983/mo annual or ₹1,179/mo monthly (incl. GST). Cancel anytime.
          </p>
        </motion.div>
      </section>
    </div>
  );
}
