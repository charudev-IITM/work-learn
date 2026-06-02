"use client";

import dynamic from "next/dynamic";

const DotLottieReact = dynamic(
  () =>
    import("@lottiefiles/dotlottie-react").then((mod) => mod.DotLottieReact),
  { ssr: false }
);

/**
 * Lottie Gold Coin — Spinning gold coin animation.
 * Uses the downloaded .lottie file from LottieFiles (free, Lottie Simple License).
 */
export function LottieGoldCoin({
  className = "",
  size = 120,
  speed = 1,
}: {
  className?: string;
  size?: number;
  speed?: number;
}) {
  return (
    <div
      className={`pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    >
      <DotLottieReact
        src="/animations/gold-coin.lottie"
        autoplay
        loop
        speed={speed}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
