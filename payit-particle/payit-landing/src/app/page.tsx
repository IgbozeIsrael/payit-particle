import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import TrustedInfrastructure from "@/components/TrustedInfrastructure";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import TelegramHero from "@/components/TelegramHero";
import Business from "@/components/Business";
import Security from "@/components/Security";
import Testimonials from "@/components/Testimonials";
import Blog from "@/components/Blog";
import FAQ from "@/components/FAQ";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import MobileBottomBar from "@/components/MobileBottomBar";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="pb-16 md:pb-0">
        <Hero />
        <TrustedInfrastructure />
        <Features />
        <HowItWorks />
        <TelegramHero />
        <Business />
        <Security />
        <Testimonials />
        <Blog />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <MobileBottomBar />
    </>
  );
}
