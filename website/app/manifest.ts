import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SpotCompare — Real-Time Bullion Rate Intelligence",
    short_name: "SpotCompare",
    description:
      "Track 100+ bullion dealers in real-time. Compare gold and silver rates across India with sub-second updates.",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
