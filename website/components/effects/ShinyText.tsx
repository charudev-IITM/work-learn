"use client";

/**
 * Shiny Text — Animated gold shimmer that sweeps across text.
 * The shine highlight travels from left to right continuously.
 */
export function ShinyText({
  children,
  className = "",
  as: Tag = "span",
  speed = 3,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "span" | "h1" | "h2" | "h3" | "p" | "div";
  speed?: number;
}) {
  return (
    <Tag
      className={`shiny-text-gold ${className}`}
      style={{ "--shiny-speed": `${speed}s` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
