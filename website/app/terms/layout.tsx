import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — SpotCompare",
  description:
    "SpotCompare's terms of service. Understand the rules and guidelines for using our platform.",
  alternates: { canonical: "https://spotcompare.com/terms" },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
