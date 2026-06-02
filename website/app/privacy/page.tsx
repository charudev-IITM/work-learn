"use client";

import { motion } from "framer-motion";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-32 lg:pt-40 pb-16 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-5xl font-bold tracking-tight mb-4"
          >
            Privacy <span className="text-gradient-gold">Policy</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-sm text-white/30"
          >
            Last updated: March 13, 2026
          </motion.p>
        </div>
      </section>

      {/* Content */}
      <section className="py-10 lg:py-16">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="prose-policy space-y-10"
          >
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                SpotCompare (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is operated by Zettatech. This Privacy Policy
                explains how we collect, use, disclose, and safeguard your information when you use
                our real-time bullion rate comparison platform and related services (the &quot;Service&quot;).
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>
              <p className="text-sm text-white/50 leading-relaxed mb-3">
                We collect information you provide directly to us:
              </p>
              <ul className="list-disc list-inside space-y-2 text-sm text-white/50">
                <li><strong className="text-white/70">Account Information:</strong> Phone number and name when you create an account.</li>
                <li><strong className="text-white/70">Subscription Data:</strong> Payment information processed securely through Razorpay. We do not store your card details.</li>
                <li><strong className="text-white/70">Usage Data:</strong> Watchlist configurations, preferences, and interaction patterns to improve the Service.</li>
                <li><strong className="text-white/70">Device Information:</strong> Browser type, device type, and IP address for security and analytics.</li>
                <li><strong className="text-white/70">Communications:</strong> Messages you send us through the contact form or email.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc list-inside space-y-2 text-sm text-white/50">
                <li>Provide, maintain, and improve the Service.</li>
                <li>Process subscriptions and payments.</li>
                <li>Send price alerts and notifications you have configured.</li>
                <li>Respond to your inquiries and provide customer support.</li>
                <li>Detect, prevent, and address technical issues and security threats.</li>
                <li>Analyze usage patterns to improve performance and user experience.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">4. Data Storage & Security</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                Your data is stored on secure servers. We use encryption for data in transit and at
                rest, secure authentication mechanisms, and regular security audits. While no method
                of transmission over the Internet is 100% secure, we strive to use commercially
                acceptable means to protect your personal information.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">5. Third-Party Services</h2>
              <p className="text-sm text-white/50 leading-relaxed mb-3">
                We use the following third-party services:
              </p>
              <ul className="list-disc list-inside space-y-2 text-sm text-white/50">
                <li><strong className="text-white/70">Razorpay:</strong> Payment processing. Subject to Razorpay&apos;s privacy policy.</li>
                <li><strong className="text-white/70">MSG91:</strong> OTP delivery for authentication.</li>
                <li><strong className="text-white/70">Analytics:</strong> We may use analytics services to understand usage patterns.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">6. Data Sharing</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                We do not sell, trade, or rent your personal information to third parties. We may
                share information only in the following circumstances: with your consent, to comply
                with legal obligations, to protect our rights and safety, or with service providers
                who assist in operating the platform (under strict confidentiality agreements).
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">7. Data Retention</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                We retain your personal information for as long as your account is active or as
                needed to provide the Service. You may request deletion of your account and
                associated data at any time by contacting us.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">8. Your Rights</h2>
              <ul className="list-disc list-inside space-y-2 text-sm text-white/50">
                <li>Access, update, or delete your personal information.</li>
                <li>Cancel your subscription at any time.</li>
                <li>Request a copy of your data.</li>
                <li>Opt out of non-essential communications.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">9. Cookies</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                We use essential cookies and local storage to maintain your session, remember your
                preferences, and keep you logged in. We do not use third-party tracking cookies for
                advertising purposes.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">10. Changes to This Policy</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any
                material changes by posting the updated policy on this page with a revised date.
                Your continued use of the Service after changes constitutes acceptance of the
                updated policy.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">11. Contact Us</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                If you have any questions about this Privacy Policy, please contact us at{" "}
                <a href="mailto:hello@spotcompare.com" className="text-gold-400 hover:text-gold-300 transition-colors">
                  hello@spotcompare.com
                </a>.
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
