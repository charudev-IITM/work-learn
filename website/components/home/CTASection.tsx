"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { ConfettiBurst } from "@/components/effects/ConfettiBurst";
import { ShinyText } from "@/components/effects/ShinyText";

export function CTASection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="relative py-28 lg:py-40 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 gradient-mesh" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gold-500/[0.06] rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-tight mb-6">
            Ready to Find the{" "}
            <ShinyText speed={3}>Best Rate?</ShinyText>
          </h2>

          <p className="text-lg text-white/40 max-w-xl mx-auto mb-10 leading-relaxed">
            Join traders and dealers who use SpotCompare to stay ahead of the market.
            Start comparing rates in seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <ConfettiBurst>
              <Link
                href="https://app.spotcompare.com"
                className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold rounded-xl btn-gold"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
            </ConfettiBurst>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-8 py-4 text-sm rounded-xl btn-ghost"
            >
              View Pricing
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
