import type { Metadata } from "next";
import { FAQPageJsonLd } from "@/components/seo/JsonLd";
import { faqs } from "./faq-data";

export const metadata: Metadata = {
  title: "FAQ — SpotCompare",
  description:
    "Frequently asked questions about SpotCompare. Learn about dealers, rate updates, pricing, security, and more.",
  alternates: { canonical: "https://spotcompare.com/faq" },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FAQPageJsonLd faqs={faqs} />
      {children}
    </>
  );
}
