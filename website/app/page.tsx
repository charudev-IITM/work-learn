import { Hero } from "@/components/home/Hero";
import { LiveDemo } from "@/components/home/LiveDemo";
import { Stats } from "@/components/home/Stats";
import { Testimonials } from "@/components/home/Testimonials";
import { CTASection } from "@/components/home/CTASection";
import { ParallaxCoins } from "@/components/effects/ParallaxCoins";

export default function Home() {
  return (
    <>
      <ParallaxCoins />
      <Hero />
      <div className="section-divider" />
      <LiveDemo />
      <div className="section-divider" />
      <Stats />
      <div className="section-divider" />
      <Testimonials />
      <div className="section-divider" />
      <CTASection />
    </>
  );
}
