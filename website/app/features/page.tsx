"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  Zap,
  BarChart3,
  ArrowLeftRight,
  GripVertical,
  Bell,
  Shield,
  Smartphone,
  RefreshCw,
  ArrowRight,
  Eye,
  Calculator,
  Layers,
  Newspaper,
  MapPin,
  Bot,
} from "lucide-react";
import { useStats } from "@/lib/useStats";

const staticFeatures = [
  {
    slug: "real-time-updates",
    icon: Zap,
    title: "Sub-Second Updates",
    description:
      "Rates refresh every second from live dealer feeds. Never trade on stale data again. Our real-time infrastructure delivers instant price changes to your screen.",
    tag: "Performance",
  },
  {
    slug: "dealer-coverage",
    icon: BarChart3,
    title: "100+ Dealers, 17+ Cities",
    description:
      "Compare rates from over 100 bullion dealers across 17+ cities in India — all on a single screen. New dealers and cities added regularly.",
    tag: "Coverage",
  },
  {
    slug: "view-modes",
    icon: Eye,
    title: "Buy / Sell / Differences Mode",
    description:
      "Switch between Buy and Sell views, or use Differences mode to compare every dealer against a reference. Instantly spot who's offering the best price.",
    tag: "Analysis",
  },
  {
    slug: "smart-comparison",
    icon: ArrowLeftRight,
    title: "Smart Rate Comparison",
    description:
      "Automatic 'BEST' badge highlights the highest buy and lowest sell rates. Color-coded differences show exactly how each dealer stacks up.",
    tag: "Intelligence",
  },
  {
    slug: "watchlists",
    icon: Layers,
    title: "Multiple Watchlists",
    description:
      "Create separate watchlists for gold, silver, or custom combinations. Swipe between them on mobile. Each watchlist is independently configured.",
    tag: "Organization",
  },
  {
    slug: "drag-and-drop",
    icon: GripVertical,
    title: "Drag & Drop Ordering",
    description:
      "Arrange dealers in the order that matters to you. Drag cards to reposition them. Your custom order persists across sessions.",
    tag: "Customization",
  },
  {
    slug: "calculator",
    icon: Calculator,
    title: "Built-in Calculator",
    description:
      "Perform arithmetic operations directly on live rates. Add margins, calculate totals, and do quick conversions without leaving the app. Rate multipliers from x0.1 to x100 included.",
    tag: "Productivity",
  },
  {
    slug: "sona-ai",
    icon: Bot,
    title: "SONA AI Agent",
    description:
      "Ask SONA anything about the bullion market — best rates, dealer comparisons, spreads, news — and get instant, data-driven answers. Set alerts and manage your watchlist through natural conversation.",
    tag: "AI",
  },
  {
    slug: "news",
    icon: Newspaper,
    title: "Live Bullion News",
    description:
      "Stay informed with curated news from top bullion sources — covering India and global markets. Get market-moving updates alongside your live rates.",
    tag: "News",
  },
  {
    slug: "cities",
    icon: MapPin,
    title: "17+ Cities Covered",
    description:
      "From Mumbai and Delhi to Jaipur, Chennai, and beyond. Track dealers across India's major bullion hubs with city-wise rate comparisons.",
    tag: "Geography",
  },
  {
    slug: "auto-reconnect",
    icon: RefreshCw,
    title: "Auto-Reconnect",
    description:
      "Lost connection? SpotCompare automatically reconnects and resumes real-time updates. Seamless session refresh keeps you logged in.",
    tag: "Reliability",
  },
  {
    slug: "security",
    icon: Shield,
    title: "Secure Authentication",
    description:
      "Safe and secure authentication with encrypted session storage. Only verified users access the platform.",
    tag: "Security",
  },
  {
    slug: "mobile",
    icon: Smartphone,
    title: "Mobile-First Design",
    description:
      "Built for traders on the go. Touch-optimized interface with haptic feedback, swipe gestures, and responsive layouts for every screen size.",
    tag: "Mobile",
  },
  {
    slug: "price-alerts",
    icon: Bell,
    title: "Price Alerts",
    description:
      "Set custom price alerts on any dealer or script. Get notified instantly when rates hit your target — so you never miss a buying or selling opportunity.",
    tag: "Alerts",
  },
  {
    slug: "spread-analysis",
    icon: BarChart3,
    title: "Spread Analysis",
    description:
      "See buy-sell spreads for every dealer at a glance. Expand any card to view detailed spread calculations with applied multipliers.",
    tag: "Depth",
  },
];

function FeatureCard({
  feature,
  index,
  inView,
}: {
  feature: (typeof staticFeatures)[0];
  index: number;
  inView: boolean;
}) {
  const Icon = feature.icon;
  return (
    <Link href={`/features/${feature.slug}`}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.05 * index, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="group relative glass rounded-2xl p-7 transition-all duration-300 hover:border-gold-500/20 hover:bg-gold-500/[0.02] cursor-pointer h-full"
      >
        <div className="flex items-start gap-5">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center group-hover:bg-gold-500/15 transition-colors duration-300">
            <Icon className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-base font-semibold text-white group-hover:text-gold-400 transition-colors">{feature.title}</h3>
              <span className="text-[10px] font-medium uppercase tracking-wider text-gold-500/60 bg-gold-500/10 px-2 py-0.5 rounded-full">
                {feature.tag}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-white/40">{feature.description}</p>
            <span className="inline-flex items-center gap-1 mt-3 text-[10px] font-medium uppercase tracking-wider text-gold-500/40 group-hover:text-gold-400 transition-colors">
              Learn more <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-br from-gold-500/[0.03] to-transparent" />
      </motion.div>
    </Link>
  );
}

export default function FeaturesPage() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const stats = useStats();

  const features = staticFeatures.map((f) => {
    if (f.slug === "dealer-coverage") {
      return {
        ...f,
        title: `${stats.dealers}+ Dealers, ${stats.cities}+ Cities`,
        description: `Compare rates from over ${stats.dealers} bullion dealers across ${stats.cities}+ cities in India — all on a single screen. New dealers and cities added regularly.`,
      };
    }
    if (f.slug === "cities") {
      return {
        ...f,
        title: `${stats.cities}+ Cities Covered`,
      };
    }
    return f;
  });

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-32 lg:pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gold-500/[0.04] rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-4"
          >
            Features
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
          >
            Everything You Need to{" "}
            <span className="text-gradient-gold">Trade Smarter</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/40 max-w-2xl mx-auto"
          >
            SpotCompare packs powerful features into a simple, intuitive interface.
            Here&apos;s what makes it the go-to tool for bullion market professionals.
          </motion.p>
        </div>
      </section>

      {/* Features Grid */}
      <section ref={ref} className="py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-5">
            {features.map((feature, i) => (
              <FeatureCard key={feature.title} feature={feature} index={i} inView={isInView} />
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 lg:py-28">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
            Ready to Experience It?
          </h2>
          <p className="text-white/40 mb-8 max-w-lg mx-auto">
            Try SpotCompare and see why traders across India are making it their daily tool.
          </p>
          <Link
            href="https://app.spotcompare.com"
            className="inline-flex items-center gap-2 px-8 py-4 text-sm font-semibold rounded-xl btn-gold"
          >
            Start Comparing
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
