import type { Metadata } from "next";
import { featureDetails } from "../feature-data";

export function generateStaticParams() {
  return featureDetails.map((f) => ({ slug: f.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const feature = featureDetails.find((f) => f.slug === params.slug);

  if (!feature) {
    return { title: "Feature — SpotCompare" };
  }

  return {
    title: `${feature.title} — SpotCompare`,
    description: feature.subheadline,
  };
}

export default function FeatureSlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
