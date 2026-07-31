"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, ShieldCheck, Cpu, KeyRound, Check } from "lucide-react";

const securityCards = [
  {
    icon: Lock,
    title: "Bank-Grade Encryption",
    description:
      "All financial data and API payloads are encrypted end-to-end at rest and in transit using AES-256 and TLS 1.3 standards.",
    specs: ["AES-256 Bit Cipher", "TLS 1.3 Encrypted Transit"],
    color: "text-green-600",
    bg: "from-green-50 to-emerald-50",
    border: "border-green-200/80",
  },
  {
    icon: ShieldCheck,
    title: "Multi-Layer Auth & Biometrics",
    description:
      "Multi-factor authentication (MFA) and biometric device verification safeguard every sign-in and outgoing transfer.",
    specs: ["Device Fingerprinting", "2FA & Biometric Verification"],
    color: "text-blue-600",
    bg: "from-blue-50 to-cyan-50",
    border: "border-blue-200/80",
  },
  {
    icon: Cpu,
    title: "Real-Time Threat Detection",
    description:
      "Automated security engines analyze transactions 24/7 to flag suspicious activity instantly before funds leave your account.",
    specs: ["24/7 Instant Fraud Blocking", "Real-Time Anomaly Alerts"],
    color: "text-orange-600",
    bg: "from-orange-50 to-amber-50",
    border: "border-orange-200/80",
  },
  {
    icon: KeyRound,
    title: "Guaranteed Account Recovery",
    description:
      "Lost device access? Recover your account quickly and safely through verified backup credentials without risking funds.",
    specs: ["Encrypted Emergency Keys", "Self-Custodial Recovery"],
    color: "text-purple-600",
    bg: "from-purple-50 to-violet-50",
    border: "border-purple-200/80",
  },
];

export default function Security() {
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
    <section id="security" ref={ref} className="section-padding bg-[#F8FAFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`max-w-3xl mx-auto text-center mb-16 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 mb-4">
            <Lock size={14} className="text-green-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-green-700">
              Institutional-Grade Security Standards
            </span>
          </div>

          <h2
            className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Built like a fortress.
          </h2>
          <p className="text-lg text-slate-700 font-medium max-w-xl mx-auto">
            Your money and account data are protected by the same security infrastructure used by top tier global banks.
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {securityCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className={`bg-white border ${card.border} rounded-3xl p-7 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between ${
                  visible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-10"
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div>
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${card.bg} border border-slate-100 flex items-center justify-center mb-5`}>
                    <Icon size={22} className={card.color} />
                  </div>

                  <h3
                    className="text-lg font-bold text-slate-900 mb-3"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {card.title}
                  </h3>

                  <p className="text-base text-slate-700 leading-relaxed font-normal mb-6">
                    {card.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-2">
                  {card.specs.map((spec) => (
                    <div key={spec} className="flex items-center gap-2">
                      <Check size={14} className="text-green-600 flex-shrink-0" />
                      <span className="text-xs font-semibold text-slate-800">{spec}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Trust metrics bar */}
        <div
          className={`mt-14 flex justify-center transition-all duration-700 delay-500 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="inline-flex flex-wrap items-center justify-center gap-6 px-8 py-4 rounded-3xl bg-white border border-slate-200 shadow-sm text-slate-800 text-sm font-bold">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>100% Encrypted Storage</span>
            </div>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-green-600" />
              <span>24/7 Automated Threat Engine</span>
            </div>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <div className="flex items-center gap-2">
              <span>99.99% System Availability</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
