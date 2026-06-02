import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — SpotCompare",
  description:
    "Get in touch with the SpotCompare team. Questions, feedback, or access requests — we'd love to hear from you.",
  alternates: { canonical: "https://spotcompare.com/contact" },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
