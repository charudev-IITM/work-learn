import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — SpotCompare",
  description:
    "Simple, transparent pricing. ₹999/month or save 50% with annual billing. All features included — 100+ dealers, 17+ cities, real-time updates, news, calculator, and more.",
  alternates: { canonical: "https://spotcompare.com/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
