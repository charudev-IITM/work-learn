"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Star, Quote } from "lucide-react";
import { ShinyText } from "@/components/effects/ShinyText";

const testimonials = [
  {
    quote:
      "SpotCompare changed how I trade. I used to call 5 dealers every morning. Now I see all rates on one screen in real time. My margins have improved noticeably.",
    name: "Rajesh Mehta",
    role: "Bullion Trader, Mumbai",
    rating: 5,
  },
  {
    quote:
      "The differences mode is brilliant. I peg one dealer as reference and instantly see who's offering better rates. Saves me hours every single day.",
    name: "Priya Sharma",
    role: "Jewellery Wholesaler, Chennai",
    rating: 5,
  },
  {
    quote:
      "Sub-second updates with 100+ dealers across 17 cities — I didn't think it was possible. SpotCompare is now an essential tool for my business. Couldn't go back.",
    name: "Vikram Joshi",
    role: "Gold Investor, Bengaluru",
    rating: 5,
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${
            i < rating ? "text-gold-400 fill-gold-400" : "text-white/10"
          }`}
        />
      ))}
    </div>
  );
}

export function Testimonials() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="relative py-28 lg:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-obsidian via-surface to-obsidian" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-3">
            Testimonials
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Trusted by <ShinyText speed={4}>Traders Across India</ShinyText>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.15 + i * 0.15, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="glass-gold glass-shimmer rounded-2xl p-7 h-full flex flex-col transition-all duration-300 hover:border-gold-500/30 hover:bg-gold-500/[0.04]">
                {/* Quote icon */}
                <Quote className="w-8 h-8 text-gold-500/30 mb-4" />

                {/* Quote text */}
                <p className="text-sm leading-relaxed text-white/60 mb-6 flex-1">
                  &ldquo;{t.quote}&rdquo;
                </p>

                {/* Author */}
                <div className="flex items-center justify-between pt-5 border-t border-white/[0.06]">
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-white/30">{t.role}</p>
                  </div>
                  <StarRating rating={t.rating} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
