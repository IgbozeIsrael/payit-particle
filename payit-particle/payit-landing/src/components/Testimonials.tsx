"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Chidi Okafor",
    role: "Freelance Designer, Lagos",
    initials: "CO",
    color: "bg-green-500",
    stars: 5,
    quote:
      "PayIT completely changed how I receive payments from international clients. I used to wait days for wire transfers — now it's instant. My Telegram is all I need.",
    detail: "Receives $2,000+ monthly from US clients",
  },
  {
    name: "Amara Diallo",
    role: "Founder, Accra",
    initials: "AD",
    color: "bg-blue-500",
    stars: 5,
    quote:
      "Running a remote team across three countries used to be a financial nightmare. With PayIT, I process payroll in minutes. It's the cleanest tool I've found for African businesses.",
    detail: "Pays team across Ghana, Nigeria & Kenya",
  },
  {
    name: "Fatima Bello",
    role: "Remote Developer, Abuja",
    initials: "FB",
    color: "bg-purple-500",
    stars: 5,
    quote:
      "The multi-currency account is a game changer. I hold USD from my remote job and convert to Naira whenever the rate is right. The Telegram bot makes it insanely simple.",
    detail: "Manages NGN + USD from one account",
  },
];

export default function Testimonials() {
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
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="testimonials" ref={ref} className="section-padding bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`max-w-xl mx-auto text-center mb-16 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <p className="text-sm font-semibold uppercase tracking-widest text-green-600 mb-3">
            Stories
          </p>
          <h2
            className="text-4xl sm:text-5xl font-extrabold text-[#101828] leading-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Loved across Africa.
          </h2>
        </div>

        {/* Testimonial cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className={`relative bg-[#F8FAFC] border border-gray-100 rounded-3xl p-8 card-hover transition-all duration-700 ${
                visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-10"
              }`}
              style={{ transitionDelay: `${i * 120}ms` }}
            >
              {/* Stars */}
              <div className="flex gap-1 mb-5">
                {Array.from({ length: t.stars }).map((_, j) => (
                  <Star
                    key={j}
                    size={14}
                    className="text-yellow-400 fill-yellow-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <blockquote className="text-slate-800 text-base font-medium leading-relaxed mb-6">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              {/* Detail chip */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-800 border border-green-200 text-xs font-bold mb-6">
                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
                {t.detail}
              </div>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full ${t.color} flex items-center justify-center text-white text-sm font-bold`}
                >
                  {t.initials}
                </div>
                <div>
                  <p
                    className="text-sm font-bold text-slate-900"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {t.name}
                  </p>
                  <p className="text-xs font-semibold text-slate-600">{t.role}</p>
                </div>
              </div>

              {/* Green quote mark decoration */}
              <div
                className="absolute top-6 right-7 text-5xl text-green-100 font-serif leading-none pointer-events-none select-none"
                aria-hidden
              >
                &ldquo;
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
