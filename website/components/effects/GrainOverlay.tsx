"use client";

/**
 * Film grain overlay using SVG feTurbulence.
 * Inspired by iertqa.com — fractalNoise at high frequency
 * converted to alpha, rendered as a fixed full-screen overlay.
 */
export function GrainOverlay() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 z-50 h-full w-full isolate"
      aria-hidden="true"
      style={{ opacity: 0.09 }}
    >
      <filter id="grain" colorInterpolationFilters="sRGB">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.65"
          numOctaves="3"
          stitchTiles="stitch"
          seed="42"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
}
