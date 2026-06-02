"use client";

import { useEffect, useRef, useCallback } from "react";

interface MetaBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export function LiquidGold({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const ballsRef = useRef<MetaBall[]>([]);

  const init = useCallback(() => {
    ballsRef.current = [
      { x: 0.3, y: 0.3, vx: 0.002, vy: 0.001, r: 0.15 },
      { x: 0.7, y: 0.5, vx: -0.001, vy: 0.002, r: 0.12 },
      { x: 0.5, y: 0.7, vx: 0.0015, vy: -0.001, r: 0.18 },
      { x: 0.2, y: 0.6, vx: -0.002, vy: -0.0015, r: 0.1 },
      { x: 0.8, y: 0.3, vx: 0.001, vy: 0.002, r: 0.13 },
    ];
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    init();

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    canvas.addEventListener("mousemove", handleMouse);

    const draw = () => {
      const { width, height } = canvas;
      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;

      // Update ball positions
      const balls = ballsRef.current;
      for (const ball of balls) {
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Bounce off edges
        if (ball.x < 0 || ball.x > 1) ball.vx *= -1;
        if (ball.y < 0 || ball.y > 1) ball.vy *= -1;

        // Slight attraction to mouse
        const dx = mouseRef.current.x - ball.x;
        const dy = mouseRef.current.y - ball.y;
        ball.vx += dx * 0.00003;
        ball.vy += dy * 0.00003;

        // Speed limit
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (speed > 0.003) {
          ball.vx = (ball.vx / speed) * 0.003;
          ball.vy = (ball.vy / speed) * 0.003;
        }
      }

      // Sample at reduced resolution for performance
      const step = 2;
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const nx = x / width;
          const ny = y / height;

          // Sum of metaball fields
          let sum = 0;
          for (const ball of balls) {
            const dx = nx - ball.x;
            const dy = ny - ball.y;
            const dist = dx * dx + dy * dy;
            sum += (ball.r * ball.r) / dist;
          }

          // Threshold for liquid effect
          if (sum > 8) {
            // Gold gradient based on field strength
            const intensity = Math.min((sum - 8) / 12, 1);
            const r = Math.floor(251 * 0.8 + 253 * 0.2 * intensity);
            const g = Math.floor(191 * 0.6 + 230 * 0.4 * intensity);
            const b = Math.floor(36 + 100 * intensity * 0.3);
            const a = Math.floor(intensity * 80 + 20);

            // Fill the step x step block
            for (let sy = 0; sy < step && y + sy < height; sy++) {
              for (let sx = 0; sx < step && x + sx < width; sx++) {
                const idx = ((y + sy) * width + (x + sx)) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = a;
              }
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouse);
    };
  }, [init]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ mixBlendMode: "screen" }}
    />
  );
}
