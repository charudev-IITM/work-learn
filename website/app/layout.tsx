import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CursorTrail } from "@/components/effects/CursorTrail";
import { GrainOverlay } from "@/components/effects/GrainOverlay";
import { LaunchCelebration } from "@/components/effects/LaunchCelebration";
import {
  OrganizationJsonLd,
  WebsiteJsonLd,
  SoftwareApplicationJsonLd,
} from "@/components/seo/JsonLd";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = "https://spotcompare.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "SpotCompare — Real-Time Bullion Rate Intelligence",
    template: "%s | SpotCompare",
  },
  description:
    "Track 147+ bullion dealers in real-time. Compare gold and silver rates across India's top dealers with sub-second updates. Never miss the best rate again.",
  keywords: [
    "bullion rates",
    "gold price comparison",
    "silver rates India",
    "bullion dealers",
    "real-time gold rates",
    "spot compare",
    "gold rate today",
    "silver rate today",
    "bullion rate comparison",
    "gold dealers India",
    "bullion trading platform",
    "live gold price India",
  ],
  authors: [{ name: "Kamal Patwa" }],
  creator: "SpotCompare",
  publisher: "SpotCompare",
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    title: "SpotCompare — Real-Time Bullion Rate Intelligence",
    description:
      "Track 147+ bullion dealers in real-time. Compare gold and silver rates across India with sub-second updates.",
    type: "website",
    url: BASE_URL,
    siteName: "SpotCompare",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "SpotCompare — Real-Time Bullion Rate Intelligence",
    description:
      "Track 147+ bullion dealers in real-time. Compare gold and silver rates across India with sub-second updates.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "theme-color": "#050505",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Microsoft Clarity */}
        <Script id="clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "vv3pd8k3jx");`}
        </Script>

        {/* Google Analytics (GA4) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-VVXD2L078W"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-VVXD2L078W');`}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-obsidian text-white`}
      >
        <OrganizationJsonLd />
        <WebsiteJsonLd />
        <SoftwareApplicationJsonLd />
        <GrainOverlay />
        <CursorTrail />
        <LaunchCelebration />
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
