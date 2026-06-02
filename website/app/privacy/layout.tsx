import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — SpotCompare",
  description:
    "SpotCompare's privacy policy. Learn how we collect, use, and protect your data.",
  alternates: { canonical: "https://spotcompare.com/privacy" },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
