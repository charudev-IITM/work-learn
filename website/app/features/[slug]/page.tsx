"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, ChevronRight } from "lucide-react";
import { getFeatureBySlug, getFeatureDetails } from "../feature-data";
import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { useStats } from "@/lib/useStats";

export default function FeatureDetailPage() {
  const params = useParams();
  const stats = useStats();
  const dynamicFeatures = getFeatureDetails(stats);
  const feature = dynamicFeatures.find((f) => f.slug === params.slug);

  if (!feature) {
    notFound();
  }

  const Icon = feature.icon;
  const relatedFeatures = feature.relatedSlugs
    .map((s) => dynamicFeatures.find((f) => f.slug === s))
    .filter(Boolean);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-32 lg:pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gold-500/[0.04] rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8">
          {/* Breadcrumb */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-xs text-white/30 mb-8"
          >
            <Link href="/features" className="hover:text-gold-400 transition-colors">
              Features
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white/50">{feature.title}</span>
          </motion.div>

          <div className="text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center"
            >
              <Icon className="w-7 h-7 text-gold-400" />
            </motion.div>

            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-block text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500 bg-gold-500/10 px-3 py-1 rounded-full mb-5"
            >
              {feature.tag}
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
            >
              {feature.headline.split(" ").map((word, i, arr) => {
                // Make last two words gold
                if (i >= arr.length - 2) {
                  return (
                    <span key={i} className="text-gradient-gold">
                      {word}{i < arr.length - 1 ? " " : ""}
                    </span>
                  );
                }
                return word + " ";
              })}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="text-lg text-white/40 max-w-2xl mx-auto"
            >
              {feature.subheadline}
            </motion.p>
          </div>
        </div>
      </section>

      {/* Overview */}
      <section className="py-16 lg:py-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6 }}
            className="text-base sm:text-lg text-white/50 leading-relaxed"
          >
            {feature.description}
          </motion.p>
        </div>
      </section>

      {/* Key Benefits */}
      <section className="py-16 lg:py-24">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-3">
              Key Benefits
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Why It <span className="text-gradient-gold">Matters</span>
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-5">
            {feature.benefits.map((benefit, i) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="glass rounded-2xl p-6 group hover:border-gold-500/20 hover:bg-gold-500/[0.02] transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mt-0.5 group-hover:bg-gold-500/15 transition-colors">
                    <span className="text-sm font-bold text-gold-400">{i + 1}</span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">
                      {benefit.title}
                    </h3>
                    <p className="text-sm text-white/40 leading-relaxed">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative py-16 lg:py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-obsidian via-surface to-obsidian pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-3">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Step by <span className="text-gradient-gold">Step</span>
            </h2>
          </motion.div>

          <div className="space-y-4">
            {feature.howItWorks.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="flex items-start gap-5 glass rounded-xl px-6 py-4"
              >
                <div className="w-7 h-7 shrink-0 rounded-full bg-gold-500/15 border border-gold-500/25 flex items-center justify-center mt-0.5">
                  <span className="text-xs font-bold text-gold-400">{i + 1}</span>
                </div>
                <p className="text-sm text-white/50 leading-relaxed pt-0.5">{step}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Related Features */}
      {relatedFeatures.length > 0 && (
        <section className="py-16 lg:py-24">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-3">
                Related Features
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Works Great <span className="text-gradient-gold">With</span>
              </h2>
            </motion.div>

            <div className="grid sm:grid-cols-3 gap-5">
              {relatedFeatures.map((related, i) => {
                if (!related) return null;
                const RelIcon = related.icon;
                return (
                  <motion.div
                    key={related.slug}
                    initial={{ opacity: 0, y: 25 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                  >
                    <Link
                      href={`/features/${related.slug}`}
                      className="block glass rounded-2xl p-6 h-full group hover:border-gold-500/20 hover:bg-gold-500/[0.02] transition-all duration-300"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mb-4 group-hover:bg-gold-500/15 transition-colors">
                        <RelIcon className="w-4.5 h-4.5 text-gold-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-1.5 group-hover:text-gold-400 transition-colors">
                        {related.title}
                      </h3>
                      <p className="text-xs text-white/30 leading-relaxed line-clamp-2">
                        {related.subheadline}
                      </p>
                      <div className="flex items-center gap-1 mt-3 text-[10px] text-gold-500/50 font-medium uppercase tracking-wider group-hover:text-gold-400 transition-colors">
                        Learn more
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 lg:py-28 relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-gold-500/[0.05] rounded-full blur-[130px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative z-10 max-w-2xl mx-auto px-6 lg:px-8 text-center"
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
            Experience{" "}
            <span className="text-gradient-gold">{feature.title}</span>
          </h2>
          <p className="text-lg text-white/40 max-w-lg mx-auto mb-10 leading-relaxed">
            Try SpotCompare and see why traders across India rely on it every day.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="https://app.spotcompare.com"
              className="inline-flex items-center gap-2 px-8 py-4 text-sm font-semibold rounded-xl btn-gold"
            >
              Start Comparing
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center gap-2 px-8 py-4 text-sm font-medium rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              All Features
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
