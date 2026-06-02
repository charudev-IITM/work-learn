"use client";

import { motion } from "framer-motion";

const blobs = [
  {
    size: "60%",
    color: "rgba(251, 191, 36, 0.06)",
    x: ["20%", "60%", "30%", "20%"],
    y: ["20%", "40%", "70%", "20%"],
    duration: 20,
  },
  {
    size: "50%",
    color: "rgba(217, 119, 6, 0.05)",
    x: ["70%", "30%", "60%", "70%"],
    y: ["60%", "20%", "50%", "60%"],
    duration: 25,
  },
  {
    size: "45%",
    color: "rgba(245, 158, 11, 0.04)",
    x: ["40%", "80%", "20%", "40%"],
    y: ["80%", "30%", "40%", "80%"],
    duration: 18,
  },
  {
    size: "55%",
    color: "rgba(251, 191, 36, 0.03)",
    x: ["60%", "20%", "70%", "60%"],
    y: ["30%", "60%", "20%", "30%"],
    duration: 22,
  },
];

export function GoldMeshBg({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {blobs.map((blob, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-[100px]"
          style={{
            width: blob.size,
            height: blob.size,
            background: `radial-gradient(circle, ${blob.color} 0%, transparent 70%)`,
          }}
          animate={{
            left: blob.x,
            top: blob.y,
          }}
          transition={{
            duration: blob.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
