"use client";

import { motion } from "framer-motion";

export default function TermsPage() {
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
            Terms of <span className="text-gradient-gold">Service</span>
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
              <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                By accessing or using SpotCompare (&quot;the Service&quot;), operated by Zettatech, you agree
                to be bound by these Terms of Service. If you do not agree to these terms, please do
                not use the Service.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">2. Description of Service</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                SpotCompare is a real-time bullion rate comparison platform that aggregates buy and
                sell rates from multiple dealers across India. The Service includes watchlist
                management, rate comparison tools, price alerts, a calculator, news aggregation, and
                an AI assistant. The Service is available via web browser on desktop and mobile devices.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">3. Account Registration</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                To use the Service, you must create an account by providing a valid phone number and
                verifying it via OTP. You are responsible for maintaining the confidentiality of your
                account credentials and for all activities that occur under your account.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">4. Subscription & Payments</h2>
              <ul className="list-disc list-inside space-y-2 text-sm text-white/50">
                <li>Access to the Service requires a paid subscription (monthly or annual plans).</li>
                <li>Payments are processed securely through Razorpay. All prices are in Indian Rupees (INR) and exclude applicable taxes.</li>
                <li>Subscriptions auto-renew unless cancelled before the end of the billing period.</li>
                <li>You may cancel your subscription at any time. Access continues until the end of the current billing period.</li>
                <li>Refunds are handled on a case-by-case basis. Contact us within 7 days of payment for refund requests.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">5. Acceptable Use</h2>
              <p className="text-sm text-white/50 leading-relaxed mb-3">
                You agree not to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-sm text-white/50">
                <li>Extract or collect data from the Service by automated means without written permission.</li>
                <li>Redistribute, resell, or commercially exploit rate data obtained from the Service.</li>
                <li>Attempt to gain unauthorized access to the Service or its related systems.</li>
                <li>Use the Service for any unlawful purpose or in violation of applicable regulations.</li>
                <li>Interfere with or disrupt the integrity or performance of the Service.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">6. Rate Data Disclaimer</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                Rate data displayed on SpotCompare is aggregated from third-party dealer sources and
                is provided for informational purposes only. While we strive for accuracy and
                timeliness, we do not guarantee that rates are error-free or reflect the exact
                prices at which transactions can be executed. SpotCompare is not a trading platform
                and does not facilitate buy or sell transactions. Always verify rates directly with
                the dealer before making trading decisions.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">7. AI Assistant (SONA)</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                The SONA AI assistant provides information based on live platform data and is
                intended as a convenience tool. AI-generated responses may occasionally contain
                inaccuracies. SONA&apos;s responses should not be considered financial advice. Actions
                initiated through SONA (such as setting alerts or modifying watchlists) require your
                explicit confirmation before execution.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">8. Intellectual Property</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                The Service, including its design, code, features, and branding, is the intellectual
                property of Zettatech. You may not copy, modify, distribute, or create derivative
                works based on the Service without prior written consent.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">9. Service Availability</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                We aim for 99.9% uptime but do not guarantee uninterrupted access. The Service may
                be temporarily unavailable for maintenance, updates, or circumstances beyond our
                control. We are not liable for any losses arising from service interruptions.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">10. Limitation of Liability</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                To the maximum extent permitted by law, SpotCompare and Zettatech shall not be
                liable for any indirect, incidental, special, consequential, or punitive damages
                arising from your use of the Service. Our total liability shall not exceed the
                amount you paid for the Service in the 12 months preceding the claim.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">11. Termination</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                We reserve the right to suspend or terminate your account if you violate these
                Terms. You may terminate your account at any time by contacting us. Upon
                termination, your right to use the Service ceases immediately, though data deletion
                requests will be honoured per our Privacy Policy.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">12. Governing Law</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of India.
                Any disputes arising under these Terms shall be subject to the exclusive jurisdiction
                of the courts in India.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">13. Changes to Terms</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                We may update these Terms from time to time. Material changes will be communicated
                via the Service or email. Continued use of the Service after changes constitutes
                acceptance of the revised Terms.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white mb-3">14. Contact Us</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                For any questions regarding these Terms, please contact us at{" "}
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
