"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { ChevronDown, ArrowRight } from "lucide-react";
import { faqs, getFaqs } from "./faq-data";
import { useStats } from "@/lib/useStats";

function FAQItem({
  faq,
  index,
  isOpen,
  onToggle,
  inView,
}: {
  faq: (typeof faqs)[0];
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  inView: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: 0.03 * index, duration: 0.4 }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left glass rounded-xl px-6 py-5 transition-all duration-200 hover:border-gold-500/20 hover:bg-gold-500/[0.02] group"
      >
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-medium text-white group-hover:text-gold-400 transition-colors">
            {faq.question}
          </h3>
          <ChevronDown
            className={`w-4 h-4 text-white/30 shrink-0 transition-transform duration-300 ${
              isOpen ? "rotate-180 text-gold-400" : ""
            }`}
          />
        </div>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <p className="text-sm text-white/40 leading-relaxed mt-4 pr-8">
                {faq.answer}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    </motion.div>
  );
}

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const stats = useStats();
  const dynamicFaqs = getFaqs(stats);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-32 lg:pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-[0.2em] text-gold-500 font-semibold mb-4"
          >
            FAQ
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
          >
            Frequently Asked{" "}
            <span className="text-gradient-gold">Questions</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/40 max-w-xl mx-auto"
          >
            Everything you need to know about SpotCompare.
          </motion.p>
        </div>
      </section>

      {/* FAQ List */}
      <section ref={ref} className="py-10 lg:py-16">
        <div className="max-w-2xl mx-auto px-6 lg:px-8 space-y-3">
          {dynamicFaqs.map((faq, i) => (
            <FAQItem
              key={i}
              faq={faq}
              index={i}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              inView={isInView}
            />
          ))}
        </div>
      </section>

      {/* Still have questions? */}
      <section className="py-20 text-center">
        <p className="text-white/40 text-sm mb-6">
          Still have questions?
        </p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 px-7 py-3.5 text-sm font-semibold rounded-xl btn-gold"
        >
          Contact Us
          <ArrowRight className="w-4 h-4" />
        </Link>
      </section>
    </div>
  );
}
