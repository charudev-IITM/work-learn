"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { ConfettiBurst } from "@/components/effects/ConfettiBurst";
import { ShinyText } from "@/components/effects/ShinyText";
import { useStats } from "@/lib/useStats";

/* ── Rotating words ──────────────────────────────────── */
const rotatingWords = ["Every Dealer.", "Every Rate.", "Every Second."];

function RotatingWord() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % rotatingWords.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="inline-block relative h-[1.15em] overflow-hidden align-bottom">
      <AnimatePresence mode="wait">
        <motion.span
          key={rotatingWords[index]}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="shiny-text-gold inline-block"
          style={{ "--shiny-speed": "3s" } as React.CSSProperties}
        >
          {rotatingWords[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ── Animated Dot Grid Background ────────────────────── */
function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const spacing = 40;
    const cols = Math.ceil(width / spacing);
    const rows = Math.ceil(height / spacing);
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const time = Date.now() * 0.001;

    ctx.clearRect(0, 0, width, height);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * spacing + spacing / 2;
        const y = row * spacing + spacing / 2;

        // Distance from mouse
        const dx = x - mx;
        const dy = y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const mouseInfluence = Math.max(0, 1 - dist / 200);

        // Distance from center for radial pulse
        const cx = x - width / 2;
        const cy = y - height / 2;
        const centerDist = Math.sqrt(cx * cx + cy * cy);
        const wave = Math.sin(centerDist * 0.008 - time * 1.5) * 0.5 + 0.5;

        // Base opacity
        const baseAlpha = 0.08 + wave * 0.07;
        const alpha = baseAlpha + mouseInfluence * 0.4;

        // Base radius
        const baseR = 1;
        const r = baseR + mouseInfluence * 2 + wave * 0.5;

        // Gold color with varying intensity
        const goldIntensity = mouseInfluence > 0.1 ? mouseInfluence : wave * 0.3;
        const red = Math.floor(251 * goldIntensity + 255 * (1 - goldIntensity));
        const green = Math.floor(191 * goldIntensity + 255 * (1 - goldIntensity));
        const blue = Math.floor(36 * goldIntensity + 255 * (1 - goldIntensity));

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        ctx.fill();
      }
    }

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouse);

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouse);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

/* ── Radial Pulse Ring Visualization ─────────────────── */
function PulseVisualization({ dealers = 100 }: { dealers?: number }) {
  return (
    <div className="relative w-full max-w-[560px] aspect-square mx-auto pointer-events-none">
      {/* Concentric rings */}
      {[1, 2, 3, 4].map((ring) => (
        <motion.div
          key={ring}
          className="absolute inset-0 rounded-full border border-gold-500/[0.08]"
          style={{
            inset: `${ring * 14}%`,
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 + ring * 0.15, duration: 0.8 }}
        />
      ))}

      {/* Animated pulse rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`pulse-${i}`}
          className="absolute inset-[20%] rounded-full border border-gold-400/20"
          animate={{
            scale: [1, 2.2],
            opacity: [0.3, 0],
          }}
          transition={{
            duration: 3,
            delay: i * 1,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Center glow (soft halo behind orb) */}
      <motion.div
        className="absolute inset-[36%] rounded-full bg-gradient-to-br from-gold-400/20 to-gold-600/10 blur-md"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Center core — Goldie siri orb */}
      <motion.div
        className="absolute inset-[38%] flex items-center justify-center"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
      >
        <div className="relative w-full h-full">
          <div
            className="siri-orb w-full h-full"
            style={{
              '--c1': '#fef3c7',
              '--c2': '#fcd34d',
              '--c3': '#f59e0b',
              '--bg': '#b45309',
              '--animation-duration': '4s',
              '--blur-amount': '4px',
              '--contrast-amount': '1.2',
              '--shadow-spread': '6px',
              '--dot-size': '1px',
              '--mask-radius': '0%',
            } as React.CSSProperties}
          />
          {/* Text overlay centered on orb */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-obsidian font-bold text-lg lg:text-xl drop-shadow-sm flex flex-col items-center leading-tight">{dealers}+ <span className="text-[10px] lg:text-xs font-semibold uppercase tracking-wider opacity-70">Dealers</span></span>
          </div>
        </div>
      </motion.div>

      {/* Orbiting dealer dots */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i * 360) / 8;
        const radius = 38;
        return (
          <motion.div
            key={`dot-${i}`}
            className="absolute w-2.5 h-2.5 rounded-full bg-gold-400/60"
            style={{
              left: `${50 + radius * Math.cos((angle * Math.PI) / 180)}%`,
              top: `${50 + radius * Math.sin((angle * Math.PI) / 180)}%`,
              transform: "translate(-50%, -50%)",
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0.3, 0.8, 0.3],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              delay: 1 + i * 0.12,
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}

      {/* Connection lines from dots to center */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * 360) / 8;
          const radius = 38;
          const x = 50 + radius * Math.cos((angle * Math.PI) / 180);
          const y = 50 + radius * Math.sin((angle * Math.PI) / 180);
          return (
            <motion.line
              key={`line-${i}`}
              x1="50"
              y1="50"
              x2={x}
              y2={y}
              stroke="rgba(251, 191, 36, 0.1)"
              strokeWidth="0.3"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 1 + i * 0.1, duration: 0.8 }}
            />
          );
        })}
      </svg>

      {/* Floating labels */}
      <motion.div
        className="absolute -left-4 top-[30%] px-3 py-1.5 rounded-lg glass-gold text-[10px] text-gold-400 font-mono"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.8, duration: 0.6 }}
      >
        Gold 999
      </motion.div>
      <motion.div
        className="absolute -right-4 top-[60%] px-3 py-1.5 rounded-lg glass-gold text-[10px] text-gold-400 font-mono"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 2, duration: 0.6 }}
      >
        Silver 999
      </motion.div>
      <motion.div
        className="absolute left-[15%] -bottom-2 px-3 py-1.5 rounded-lg glass-gold text-[10px] text-emerald-400 font-mono"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2, duration: 0.6 }}
      >
        &lt;1s latency
      </motion.div>
    </div>
  );
}

/* ── Hero Section ─────────────────────────────────────── */
export function Hero() {
  const { dealers, cities } = useStats();

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 gradient-mesh" />
      <DotGrid />

      {/* Radial spotlight */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gold-500/[0.03] rounded-full blur-[150px] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-8 pt-32 lg:pt-40 pb-20">
        {/* Centered layout */}
        <div className="text-center">
          {/* Live badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-gold text-xs font-medium text-gold-400 mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live — Tracking {dealers}+ dealers across {cities}+ cities
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.1] mb-6"
          >
            Real-Time Bullion Rates.
            <br />
            <RotatingWord />
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-lg lg:text-xl text-white/50 leading-relaxed max-w-2xl mx-auto mb-10"
          >
            Compare gold and silver rates across India&apos;s top bullion dealers
            with sub-second updates. Spot the best prices before anyone else.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-wrap justify-center gap-4 mb-8"
          >
            <ConfettiBurst>
              <Link
                href="https://app.spotcompare.com"
                className="inline-flex items-center gap-2 px-7 py-3.5 text-sm font-semibold rounded-xl btn-gold"
              >
                Start Comparing
                <ArrowRight className="w-4 h-4" />
              </Link>
            </ConfettiBurst>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 px-7 py-3.5 text-sm rounded-xl btn-ghost"
            >
              See How It Works
            </Link>
          </motion.div>

          {/* Pulse Visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.6, ease: [0.4, 0, 0.2, 1] }}
            className="block max-w-[280px] sm:max-w-none mx-auto"
          >
            <PulseVisualization dealers={dealers} />
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/20">
          Scroll
        </span>
        <ChevronDown className="w-4 h-4 text-white/20 animate-bounce" />
      </motion.div>
    </section>
  );
}
