"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

/* SVG path that resembles a gold price chart */
const chartPath =
  "M 0 80 L 20 75 L 40 78 L 60 65 L 80 70 L 100 55 L 120 60 L 140 45 L 160 50 L 180 35 L 200 40 L 220 28 L 240 32 L 260 20 L 280 25 L 300 15 L 320 22 L 340 10 L 360 18 L 380 8 L 400 12";

const areaPath = chartPath + " L 400 100 L 0 100 Z";

export function GoldChart({ className = "" }: { className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <div ref={ref} className={`relative ${className}`}>
      <svg
        viewBox="0 0 400 100"
        fill="none"
        className="w-full h-auto"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(251, 191, 36, 0.15)" />
            <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d97706" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <motion.path
          d={areaPath}
          fill="url(#chartGradient)"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 1.2, duration: 1 }}
        />

        {/* Chart line */}
        <motion.path
          d={chartPath}
          stroke="url(#lineGradient)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={isInView ? { pathLength: 1, opacity: 1 } : {}}
          transition={{ duration: 2, ease: "easeInOut" }}
        />

        {/* Glow dot at the end */}
        <motion.circle
          cx="400"
          cy="12"
          r="3"
          fill="#fbbf24"
          initial={{ opacity: 0, scale: 0 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: 2, duration: 0.4 }}
        />
        <motion.circle
          cx="400"
          cy="12"
          r="8"
          fill="rgba(251, 191, 36, 0.2)"
          initial={{ opacity: 0, scale: 0 }}
          animate={
            isInView
              ? { opacity: [0, 0.4, 0], scale: [0.5, 1.5, 2] }
              : {}
          }
          transition={{ delay: 2, duration: 2, repeat: Infinity }}
        />
      </svg>
    </div>
  );
}
