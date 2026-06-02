"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket } from "lucide-react";

const LAUNCH_START = new Date("2026-03-13T00:00:00");
const LAUNCH_END = new Date("2026-03-20T23:59:59");
const STORAGE_KEY = "spotcompare-launch-seen";

function isLaunchWeek(): boolean {
  const now = new Date();
  return now >= LAUNCH_START && now <= LAUNCH_END;
}

/* ── Fullscreen confetti rain ──────────────────────── */
function ConfettiRain({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = [
      "#fbbf24", "#f59e0b", "#d97706", "#fde68a", "#fcd34d",
      "#b45309", "#ffffff", "#fef3c7", "#92400e",
    ];

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      w: number;
      h: number;
      color: string;
      rotation: number;
      rotSpeed: number;
      life: number;
    }

    const particles: Particle[] = [];
    const count = 150;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 4,
        w: 4 + Math.random() * 8,
        h: Math.random() > 0.5 ? 4 + Math.random() * 4 : 4 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.15,
        life: 1,
      });
    }

    let frame: number;
    const startTime = Date.now();
    const duration = 4000;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.vx *= 0.995;
        p.rotation += p.rotSpeed;

        if (progress > 0.6) {
          p.life = Math.max(0, 1 - (progress - 0.6) / 0.4);
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        onDone();
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [onDone]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[100] pointer-events-none"
    />
  );
}

/* ── Launch banner ─────────────────────────────────── */
function LaunchBanner({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[101] pointer-events-none"
        >
          <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-gold-500/20 via-gold-400/30 to-gold-500/20 border border-gold-500/30 backdrop-blur-md shadow-lg shadow-gold-500/10">
            <Rocket className="w-5 h-5 text-gold-400 animate-bounce" />
            <span className="text-sm sm:text-base font-semibold text-gold-300 whitespace-nowrap">
              Launching SpotCompare!
            </span>
            <Rocket className="w-5 h-5 text-gold-400 animate-bounce" style={{ animationDelay: "0.2s" }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Main export ───────────────────────────────────── */
export function LaunchCelebration() {
  const [active, setActive] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (!isLaunchWeek()) return;

    // Add shimmer class to all CTA buttons for the whole day
    document.body.classList.add("launch-day");

    const seen = sessionStorage.getItem(STORAGE_KEY);
    if (seen) {
      setActive(false);
      return;
    }

    setActive(true);
    setShowConfetti(true);
    setShowBanner(true);
    sessionStorage.setItem(STORAGE_KEY, "1");

    // Hide banner after 5 seconds
    const timer = setTimeout(() => setShowBanner(false), 5000);
    return () => {
      clearTimeout(timer);
      document.body.classList.remove("launch-day");
    };
  }, []);

  if (!active) return null;

  return (
    <>
      {showConfetti && <ConfettiRain onDone={() => setShowConfetti(false)} />}
      <LaunchBanner visible={showBanner} />
    </>
  );
}
