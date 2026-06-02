// JSON-LD structured data components for SEO
// All schema data is static/hardcoded — no user input is rendered.

function JsonLdScript({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Safe: all data is hardcoded static content, never from user input
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function OrganizationJsonLd() {
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "SpotCompare",
        url: "https://spotcompare.com",
        logo: "https://spotcompare.com/opengraph-image",
        description:
          "Real-time bullion rate comparison platform tracking 100+ dealers across 17+ cities in India.",
        founder: { "@type": "Person", name: "Kamal Patwa" },
        contactPoint: {
          "@type": "ContactPoint",
          email: "support@spotcompare.com",
          contactType: "customer support",
        },
      }}
    />
  );
}

export function WebsiteJsonLd() {
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "SpotCompare",
        url: "https://spotcompare.com",
        description:
          "Track 100+ bullion dealers in real-time. Compare gold and silver rates across India with sub-second updates.",
      }}
    />
  );
}

export function FAQPageJsonLd({
  faqs,
}: {
  faqs: { question: string; answer: string }[];
}) {
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      }}
    />
  );
}

export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; url: string }[];
}) {
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          item: item.url,
        })),
      }}
    />
  );
}

export function SoftwareApplicationJsonLd() {
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "SpotCompare",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: "https://spotcompare.com",
        description:
          "Real-time bullion rate comparison platform for India's gold and silver markets.",
        offers: {
          "@type": "AggregateOffer",
          lowPrice: "500",
          highPrice: "999",
          priceCurrency: "INR",
          offerCount: 2,
        },
        featureList:
          "Real-time rates, 100+ dealers, 17+ cities, Price alerts, Built-in calculator, Live news, Multiple watchlists, Drag and drop, Spread analysis",
      }}
    />
  );
}
