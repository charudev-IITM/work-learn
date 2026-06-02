import Link from "next/link";
import { TrendingUp, Heart } from "lucide-react";

const footerLinks = {
  Product: [
    { href: "/features", label: "Features" },
    { href: "/how-it-works", label: "How it Works" },
    { href: "/pricing", label: "Pricing" },
    { href: "https://app.spotcompare.com", label: "Launch App" },
  ],
  Company: [
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
    { href: "/faq", label: "FAQ" },
  ],
  Legal: [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Service" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-obsidian">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-16 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 lg:gap-16">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-obsidian" strokeWidth={2.5} />
              </div>
              <span className="text-base font-semibold tracking-tight">
                Spot<span className="text-gradient-gold">Compare</span>
              </span>
            </Link>
            <p className="text-sm text-white/40 leading-relaxed max-w-xs">
              Real-time bullion rate intelligence for India&apos;s gold and silver markets.
            </p>
          </div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-white/30 mb-4">
                {category}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/50 hover:text-gold-400 transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="section-divider mt-14 mb-6" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30 text-center mb-2">Disclaimer</p>
        <p className="text-[11px] text-white/20 leading-relaxed max-w-4xl mx-auto text-center mb-6">
          SpotCompare provides gold &amp; silver prices obtained from various sources believed to be reliable,
          but we do not guarantee their accuracy. Our gold, silver and other price data are provided without
          warranty or claim of reliability. It is accepted by the site visitor on the condition that errors or
          omissions shall not be made the basis for any claim, demand or cause for action.
        </p>

        {/* Divider */}
        <div className="section-divider mb-8" />

        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} SpotCompare. All rights reserved.
          </p>
          <p className="text-xs text-white/30 flex items-center gap-1.5 flex-wrap justify-center sm:justify-end">
            Made with <Heart className="w-3 h-3 text-gold-500 fill-gold-500" /> by{" "}
            <a
              href="https://zettatech.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-400 hover:text-gold-300 transition-colors"
            >
              Zettatech
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
