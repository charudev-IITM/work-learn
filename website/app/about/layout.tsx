import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — SpotCompare",
  description:
    "The story behind SpotCompare. Built to bring transparency and speed to India's bullion market, one rate at a time.",
  alternates: { canonical: "https://spotcompare.com/about" },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
