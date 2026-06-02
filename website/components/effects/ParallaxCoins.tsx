"use client";

import { motion, useScroll, useTransform } from "framer-motion";

/* Gold coin SVG */
function GoldCoin({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <radialGradient id={`coinGrad-${size}`} cx="35%" cy="35%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="40%" stopColor="#fbbf24" />
          <stop offset="80%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill={`url(#coinGrad-${size})`} />
      <circle
        cx="20"
        cy="20"
        r="14"
        fill="none"
        stroke="rgba(254, 243, 199, 0.3)"
        strokeWidth="0.8"
      />
      {/* Shine highlight */}
      <ellipse
        cx="15"
        cy="14"
        rx="6"
        ry="4"
        fill="rgba(255, 255, 255, 0.15)"
        transform="rotate(-20 15 14)"
      />
    </svg>
  );
}

/* Gold bar/ingot SVG */
function GoldBar({ size = 50 }: { size?: number }) {
  const h = size * 0.6;
  return (
    <svg width={size} height={h} viewBox="0 0 50 30" fill="none">
      <defs>
        <linearGradient id={`barGrad-${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="30%" stopColor="#fbbf24" />
          <stop offset="70%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      {/* Top face */}
      <polygon
        points="10,5 40,5 45,12 5,12"
        fill={`url(#barGrad-${size})`}
      />
      {/* Front face */}
      <polygon points="5,12 45,12 42,27 8,27" fill="#b45309" />
      {/* Shine */}
      <polygon
        points="10,5 25,5 30,12 5,12"
        fill="rgba(254, 243, 199, 0.2)"
      />
    </svg>
  );
}

const coins = [
  { x: "8%", startY: -100, speed: 0.15, size: 32, rotation: 15, type: "coin" as const },
  { x: "85%", startY: -200, speed: 0.1, size: 24, rotation: -20, type: "coin" as const },
  { x: "92%", startY: -400, speed: 0.18, size: 36, rotation: 10, type: "coin" as const },
  { x: "15%", startY: -600, speed: 0.12, size: 28, rotation: -15, type: "bar" as const },
  { x: "78%", startY: -800, speed: 0.08, size: 20, rotation: 25, type: "coin" as const },
  { x: "5%", startY: -1000, speed: 0.14, size: 44, rotation: -10, type: "bar" as const },
  { x: "88%", startY: -1200, speed: 0.16, size: 30, rotation: 5, type: "coin" as const },
];

export function ParallaxCoins() {
  const { scrollY } = useScroll();

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {coins.map((coin, i) => (
        <ParallaxCoin key={i} {...coin} scrollY={scrollY} />
      ))}
    </div>
  );
}

function ParallaxCoin({
  x,
  startY,
  speed,
  size,
  rotation,
  type,
  scrollY,
}: (typeof coins)[0] & { scrollY: ReturnType<typeof useScroll>["scrollY"] }) {
  const y = useTransform(scrollY, [0, 5000], [startY, startY + 5000 * speed]);
  const rotate = useTransform(scrollY, [0, 5000], [rotation, rotation + 360 * speed]);
  const opacity = useTransform(scrollY, [0, 1000, 4000, 5000], [0.12, 0.2, 0.2, 0.05]);

  return (
    <motion.div
      className="absolute"
      style={{ left: x, y, rotate, opacity }}
    >
      {type === "coin" ? <GoldCoin size={size} /> : <GoldBar size={size} />}
    </motion.div>
  );
}
