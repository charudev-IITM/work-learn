export interface FAQ {
  question: string;
  answer: string;
}

export function getFaqs(stats: { dealers: number; cities: number }): FAQ[] {
  return [
    {
      question: "What is SpotCompare?",
      answer: `SpotCompare is a real-time bullion rate comparison platform that tracks live buy and sell rates from ${stats.dealers}+ dealers across ${stats.cities}+ cities in India. It allows you to compare gold and silver prices on a single screen with sub-second updates, plus built-in news and a calculator.`,
    },
    {
      question: "Which dealers do you track?",
      answer: `We currently track ${stats.dealers}+ dealers across ${stats.cities}+ cities including Mumbai, Delhi, Jaipur, Chennai, Bengaluru, and more. Dealers include KJ Bullion, Arihant Spot, DP Gold, SLN Bullion, AMS Bullion, RSBL, and many others. We regularly add new dealers and cities.`,
    },
    ...faqs.slice(2),
  ];
}

export const faqs: FAQ[] = [
  {
    question: "What is SpotCompare?",
    answer:
      "SpotCompare is a real-time bullion rate comparison platform that tracks live buy and sell rates from 100+ dealers across 17+ cities in India. It allows you to compare gold and silver prices on a single screen with sub-second updates, plus built-in news and a calculator.",
  },
  {
    question: "Which dealers do you track?",
    answer:
      "We currently track 100+ dealers across 17+ cities including Mumbai, Delhi, Jaipur, Chennai, Bengaluru, and more. Dealers include KJ Bullion, Arihant Spot, DP Gold, SLN Bullion, AMS Bullion, RSBL, and many others. We regularly add new dealers and cities.",
  },
  {
    question: "How often do rates update?",
    answer:
      "Rates update every second via our real-time infrastructure. This gives you near-instant visibility into price movements across all tracked dealers. Stale data is automatically flagged with visual indicators.",
  },
  {
    question: "Can I use SpotCompare on my phone?",
    answer:
      "Absolutely. SpotCompare is designed mobile-first — 99% of our users access it on their phones. The interface is optimized for touch with swipe gestures, haptic feedback, and responsive layouts for every screen size.",
  },
  {
    question: "What is Differences mode?",
    answer:
      "Differences mode lets you select a reference dealer and see how every other dealer's rates compare. Positive and negative differences are color-coded, making it instant to spot which dealer offers the best rate relative to your benchmark.",
  },
  {
    question: "What are rate multipliers?",
    answer:
      "Multipliers let you convert rates to different units. For example, if a dealer shows rates per gram, you can apply a 10x multiplier to see the equivalent per-10-gram rate. Presets range from 0.1x to 100x, or you can enter a custom value.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes. SpotCompare uses secure, encrypted authentication. Your watchlists and settings are stored per-user on our secure servers. All connections are authenticated and encrypted end-to-end.",
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer:
      "Yes. You can cancel your subscription at any time. If you're on an annual plan, you'll retain access until the end of your billing period. No hidden fees, no lock-in.",
  },
  {
    question: "I'm a bullion dealer. How do I get listed?",
    answer:
      "We'd love to have you on the platform! Email us at onboarding@spotcompare.com and we'll work with you to get your live rates listed on SpotCompare.",
  },
  {
    question: "Can I integrate SpotCompare data into my own system?",
    answer:
      "Yes. If you'd like to integrate live bullion rates into your own applications or trading systems, email api@spotcompare.com for documentation and pricing details.",
  },
  {
    question: "Do you have price alerts?",
    answer:
      "Yes. You can set custom price alerts on any dealer or script. When rates hit your target, you'll be notified instantly — so you never miss a buying or selling opportunity.",
  },
  {
    question: "How do I get support?",
    answer:
      "You can reach us through the Contact page, or email us directly. We typically respond within a few hours during business hours.",
  },
];
