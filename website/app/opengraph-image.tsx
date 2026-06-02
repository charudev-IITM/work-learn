import { ImageResponse } from "next/og";
import { fetchStats } from "@/lib/stats";

export const runtime = "edge";
export const alt = "SpotCompare — Real-Time Bullion Rate Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const stats = await fetchStats();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #050505 0%, #0a0a0a 50%, #111 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Gold accent glow */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 600,
            height: 400,
            background: "radial-gradient(ellipse, rgba(251,191,36,0.08) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Top border accent */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "linear-gradient(90deg, transparent, #f59e0b, #fbbf24, #f59e0b, transparent)",
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(135deg, #fbbf24, #d97706)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 900,
              color: "#050505",
            }}
          >
            SC
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#fff" }}>
            Spot
            <span style={{ color: "#fbbf24" }}>Compare</span>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: "#fff",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: 800,
            marginBottom: 20,
          }}
        >
          Real-Time Bullion Rates.
          <br />
          <span style={{ color: "#fbbf24" }}>Every Dealer. One Screen.</span>
        </div>

        {/* Subtext */}
        <div
          style={{
            fontSize: 20,
            color: "rgba(255,255,255,0.5)",
            textAlign: "center",
            maxWidth: 600,
            marginBottom: 40,
          }}
        >
          Track {stats.dealers}+ dealers across {stats.cities}+ cities in India with sub-second updates
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 40 }}>
          {[
            { value: `${stats.dealers}+`, label: "Dealers" },
            { value: `${stats.cities}+`, label: "Cities" },
            { value: "<1s", label: "Updates" },
            { value: "99.9%", label: "Uptime" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "12px 24px",
                borderRadius: 12,
                border: "1px solid rgba(251,191,36,0.2)",
                background: "rgba(251,191,36,0.05)",
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 800, color: "#fbbf24" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: 30,
            fontSize: 14,
            color: "rgba(255,255,255,0.25)",
            letterSpacing: 2,
          }}
        >
          spotcompare.com
        </div>
      </div>
    ),
    { ...size }
  );
}
