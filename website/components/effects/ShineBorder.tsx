"use client";

import { useRef, useEffect } from "react";

/**
 * Shine Border — A gold light that sweeps around the border of a card.
 * Inspired by Magic UI's shine-border component.
 */
export function ShineBorder({
  children,
  className = "",
  borderRadius = 16,
  duration = 3,
  color = "rgba(251, 191, 36, 0.6)",
}: {
  children: React.ReactNode;
  className?: string;
  borderRadius?: number;
  duration?: number;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--shine-duration", `${duration}s`);
    el.style.setProperty("--shine-color", color);
    el.style.setProperty("--shine-radius", `${borderRadius}px`);
  }, [duration, color, borderRadius]);

  return (
    <div
      ref={ref}
      className={`shine-border-wrapper ${className}`}
      style={{ borderRadius }}
    >
      {children}
    </div>
  );
}
