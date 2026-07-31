"use client";

import { useEffect, useRef, useState } from "react";
import { UserPlus, Wallet, Zap, Check } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Launch in Telegram or App",
    description:
      "Open PayIT directly in Telegram via @payiitbot or download the mobile app. No tedious paperwork or branch visits — your multi-currency account is live in under 60 seconds.",
    chip: "Ready in <60 Seconds",
    highlights: ["No physical paperwork", "Instant automated verification"],
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
  },
  {
    number: "02",
    icon: Wallet,
    title: "Fund in Your Local Currency",
    description:
      "Add funds via bank transfer, local debit card, or supported payment rails. Zero minimum deposit requirements — start with any amount you choose.",
    chip: "Zero Deposit Minimums",
    highlights: ["Instant bank transfer funding", "Hold NGN, USD, EUR or GBP"],
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    number: "03",
    icon: Zap,
    title: "Transfer, Convert & Pay Instantly",
    description:
      "Send money to bank accounts globally, pay freelancers, settle invoices, or exchange currencies instantly with transparent, 0% hidden FX rates.",
    chip: "Instant Settlement",
    highlights: ["Under 2-second payout speed", "Transparent 0% hidden fees"],
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
  },
];

export default function HowItWorks() {
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
    <section
      id="how-it-works"
      ref={ref}
      className="section-padding bg-[#F8FAFC]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`max-w-2xl mb-16 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-green-700">
              Simple 3-Step Process
            </span>
          </div>

          <h2
            className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Up and running in minutes.
          </h2>
          <p className="text-lg text-slate-700 font-medium">
            No complex setup required. Start sending and receiving money right away.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connector line (desktop) */}
          <div className="hidden lg:block absolute top-12 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-300 to-transparent" />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.number}
                  className={`bg-white border border-slate-200/90 rounded-3xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between ${
                    visible
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-12"
                  }`}
                  style={{ transitionDelay: `${i * 150}ms` }}
                >
                  <div>
                    {/* Step number + icon + chip */}
                    <div className="flex items-center justify-between gap-4 mb-6">
                      <div
                        className={`relative w-16 h-16 rounded-2xl ${step.bg} border ${step.border} flex items-center justify-center`}
                      >
                        <Icon size={26} className={step.color} />
                        <span
                          className="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shadow-md"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          {i + 1}
                        </span>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">
                        {step.chip}
                      </span>
                    </div>

                    <h3
                      className="text-xl font-bold text-slate-900 mb-3"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      {step.title}
                    </h3>
                    <p className="text-base text-slate-700 leading-relaxed font-normal mb-6">
                      {step.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-100 space-y-2">
                    {step.highlights.map((h) => (
                      <div key={h} className="flex items-center gap-2">
                        <Check size={14} className="text-green-600 flex-shrink-0" />
                        <span className="text-xs font-semibold text-slate-800">{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
