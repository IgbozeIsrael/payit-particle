"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/* Each partner: src, alt, bg colour of their logo card, height to render */
const partners = [
  {
    name: "Nuvion",
    src: "/logo-nuvion.png",
    bg: "#FFF5F3",        // warm blush — matches their brand
    height: 36,
    width: 140,
  },
  {
    name: "Magic Labs",
    src: "/logo-magiclabs.png",
    bg: "#1a1a1a",        // dark — their logo is white-on-black
    height: 36,
    width: 160,
  },
  {
    name: "Particle Network",
    src: "/logo-particle-network.png",
    bg: "#111111",        // dark — their logo is white-on-black
    height: 36,
    width: 200,
  },
  {
    name: "Arbitrum",
    src: "/logo-arbitrum.png",
    bg: "#FFFFFF",        // white — their logo has colour on white
    height: 36,
    width: 160,
  },
];

// Triplicate for seamless infinite scroll
const allPartners = [...partners, ...partners, ...partners];

export default function TrustedInfrastructure() {
  const [visible, setVisible] = useState(false);
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
    <section
      id="infrastructure"
      ref={ref}
      className="py-20 border-y border-gray-100 bg-[#F8FAFC]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`text-center mb-12 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-2">
            Built on
          </p>
          <h2
            className="text-2xl sm:text-3xl font-bold text-[#101828]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Trusted infrastructure &amp; partners
          </h2>
        </div>

        {/* Infinite scrolling strip */}
        <div className="relative overflow-hidden">
          <div
            className={`transition-all duration-700 delay-200 ${
              visible ? "opacity-100" : "opacity-0"
            }`}
          >
            <div
              className="flex animate-scroll-left items-center gap-8"
              style={{ width: "max-content" }}
            >
              {allPartners.map((partner, i) => (
                <div
                  key={`${partner.name}-${i}`}
                  className="flex-shrink-0 flex items-center justify-center rounded-2xl px-6 py-3 hover:scale-105 transition-transform duration-200"
                  style={{
                    background: partner.bg,
                    boxShadow:
                      partner.bg === "#FFFFFF" || partner.bg === "#FFF5F3"
                        ? "0 1px 8px rgba(0,0,0,0.08)"
                        : "0 1px 8px rgba(0,0,0,0.25)",
                    minWidth: partner.width + 48,
                    height: 64,
                  }}
                >
                  <Image
                    src={partner.src}
                    alt={partner.name}
                    width={partner.width}
                    height={partner.height}
                    className="object-contain"
                    style={{ maxHeight: partner.height }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Fade masks */}
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#F8FAFC] to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#F8FAFC] to-transparent pointer-events-none" />
        </div>
      </div>
    </section>
  );
}
