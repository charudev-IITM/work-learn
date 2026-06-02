"use client";

import { useCallback, useRef, ReactNode } from "react";

interface ConfettiParticle {
  el: HTMLDivElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  life: number;
}

export function ConfettiBurst({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);

  const burst = useCallback((e: React.MouseEvent) => {
    if (activeRef.current || !containerRef.current) return;
    activeRef.current = true;

    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const particles: ConfettiParticle[] = [];
    const count = 20;

    const goldColors = [
      "#fbbf24",
      "#f59e0b",
      "#d97706",
      "#fde68a",
      "#fcd34d",
      "#b45309",
    ];

    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      const size = 3 + Math.random() * 5;
      const isRect = Math.random() > 0.5;

      el.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${isRect ? size * 0.5 : size}px;
        background: ${goldColors[Math.floor(Math.random() * goldColors.length)]};
        border-radius: ${isRect ? "1px" : "50%"};
        pointer-events: none;
        z-index: 50;
        left: ${cx}px;
        top: ${cy}px;
      `;

      containerRef.current.appendChild(el);

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 3 + Math.random() * 5;

      particles.push({
        el,
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        life: 1,
      });
    }

    const animate = () => {
      let alive = false;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.vx *= 0.98; // drag
        p.rotation += p.rotationSpeed;
        p.life -= 0.018;

        if (p.life <= 0) {
          if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
          continue;
        }

        alive = true;
        p.el.style.transform = `translate(${p.x - parseFloat(p.el.style.left)}px, ${p.y - parseFloat(p.el.style.top)}px) rotate(${p.rotation}deg)`;
        p.el.style.opacity = `${p.life}`;
      }

      if (alive) {
        requestAnimationFrame(animate);
      } else {
        activeRef.current = false;
      }
    };

    requestAnimationFrame(animate);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-visible ${className}`}
      onClick={burst}
      style={{ position: "relative" }}
    >
      {children}
    </div>
  );
}
