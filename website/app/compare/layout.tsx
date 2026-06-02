import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Why SpotCompare — Compare vs Traditional Platforms",
  description:
    "See how SpotCompare stacks up against traditional bullion rate platforms. 100+ dealers, 17+ cities, real-time updates — at a fraction of the cost.",
  alternates: { canonical: "https://spotcompare.com/compare" },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
