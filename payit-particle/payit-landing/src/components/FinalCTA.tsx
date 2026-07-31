"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";

import GetStartedModal from "@/components/GetStartedModal";

export default function FinalCTA() {
  const [visible, setVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <section id="cta" ref={ref} className="py-24 relative overflow-hidden">
        {/* Gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #071A2D 0%, #0D3D22 50%, #16A34A 100%)",
          }}
        />

        {/* Decorative mesh */}
        <div
          className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, rgba(32,193,106,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(32,193,106,0.3) 0%, transparent 40%)",
          }}
        />

        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div
            className={`transition-all duration-1000 ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
            }`}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-8">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-semibold text-white">
                Available on Telegram &amp; Web
              </span>
            </div>

            <h2
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-6"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Ready to move money
              <br />
              without limits?
            </h2>

            <p className="text-xl text-slate-100 font-medium mb-10 max-w-xl mx-auto leading-relaxed">
              Join thousands of freelancers, businesses, and creators moving money across borders effortlessly — starting right in Telegram.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                id="final-cta-get-started"
                onClick={() => setShowModal(true)}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full font-bold text-base text-[#071A2D] bg-white shadow-xl hover:shadow-2xl transition-all duration-200 hover:scale-105 cursor-pointer"
              >
                <MessageCircle size={18} />
                Get Started — It&apos;s Free
                <ArrowRight size={16} />
              </button>
            </div>

            {/* Micro copy */}
            <p className="mt-6 text-sm font-semibold text-slate-100/90 tracking-wide">
              ✓ Zero signup fee &nbsp;·&nbsp; ✓ Zero minimum deposit &nbsp;·&nbsp; ✓ Ready in 60 seconds
            </p>
          </div>
        </div>
      </section>

      <GetStartedModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
