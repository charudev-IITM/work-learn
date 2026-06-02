import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it Works — SpotCompare",
  description:
    "From signup to finding the best rate in minutes. Learn how SpotCompare helps you compare bullion rates across 100+ dealers in 17+ cities in real time.",
  alternates: { canonical: "https://spotcompare.com/how-it-works" },
};

export default function HowItWorksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
