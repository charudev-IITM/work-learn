import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features — SpotCompare",
  description:
    "Sub-second updates, 100+ dealers across 17+ cities, live news, built-in calculator, and more. Discover everything SpotCompare offers for bullion market professionals.",
  alternates: { canonical: "https://spotcompare.com/features" },
};

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
