"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Download,
  Globe,
  Briefcase,
  FileText,
  ShieldCheck,
  Check,
} from "lucide-react";

const features = [
  {
    icon: Send,
    title: "Instant Borderless Transfers",
    description:
      "Send money to bank accounts and wallets globally in under 2 seconds. Zero waiting times, zero hidden FX surcharges.",
    badge: "Under 2 Seconds",
    color: "from-green-500 to-emerald-600",
    bg: "bg-green-50",
    highlights: ["Direct to bank accounts", "Real-time payment tracking"],
  },
  {
    icon: Download,
    title: "Global Payment Collection",
    description:
      "Receive payments from international clients and platforms directly into your account with local settlement details.",
    badge: "Global Rails",
    color: "from-blue-500 to-cyan-600",
    bg: "bg-blue-50",
    highlights: ["USD, EUR & NGN collection", "Automatic conversion"],
  },
  {
    icon: Globe,
    title: "Multi-Currency Vault",
    description:
      "Hold and exchange multi-currency balances from one unified account with institutional-grade exchange rates.",
    badge: "NGN · USD · EUR · GBP",
    color: "from-purple-500 to-violet-600",
    bg: "bg-purple-50",
    highlights: ["Real-time FX rates", "Zero balance maintenance fees"],
  },
  {
    icon: Briefcase,
    title: "Automated Team Payroll",
    description:
      "Pay distributed teams, contractors, and local staff across Africa in their preferred currencies with a single click.",
    badge: "1-Click Payouts",
    color: "from-orange-500 to-amber-600",
    bg: "bg-orange-50",
    highlights: ["Bulk payout processing", "Detailed payout history"],
  },
  {
    icon: FileText,
    title: "Smart Invoicing",
    description:
      "Generate clean, professional multi-currency invoices. Send directly via Telegram or email and get notified instantly upon payment.",
    badge: "Instant Notifications",
    color: "from-pink-500 to-rose-600",
    bg: "bg-pink-50",
    highlights: ["PDF download & share", "Automatic status updates"],
  },
  {
    icon: ShieldCheck,
    title: "Institutional Infrastructure",
    description:
      "Protected by bank-grade security protocols, end-to-end encryption, and 24/7 automated monitoring.",
    badge: "AES-256 Encrypted",
    color: "from-teal-500 to-emerald-600",
    bg: "bg-teal-50",
    highlights: ["Bank-grade authentication", "Zero-trust architecture"],
  },
];

export default function Features() {
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
    <section id="features" ref={ref} className="section-padding bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`max-w-3xl mb-16 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-green-700">
              Core Capabilities · Full Transparency
            </span>
          </div>

          <h2
            className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Built for total control over
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #20C16A, #16A34A)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              your money across borders.
            </span>
          </h2>
          <p className="text-lg text-slate-700 font-medium max-w-2xl">
            Every tool you need to send, receive, store, and manage funds — without fine print or hidden fees.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <FeatureCard
              key={feature.title}
              feature={feature}
              delay={i * 80}
              visible={visible}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
  delay,
  visible,
}: {
  feature: (typeof features)[0];
  delay: number;
  visible: boolean;
}) {
  const Icon = feature.icon;

  return (
    <div
      className={`group relative bg-white border border-slate-200/90 rounded-3xl p-7 shadow-sm hover:shadow-xl hover:border-green-200 transition-all duration-300 flex flex-col justify-between ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div>
        {/* Top row with icon & badge */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div
            className={`w-12 h-12 rounded-2xl ${feature.bg} flex items-center justify-center`}
          >
            <div
              className={`w-7 h-7 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center`}
            >
              <Icon size={16} className="text-white" />
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">
            {feature.badge}
          </span>
        </div>

        {/* Title */}
        <h3
          className="text-xl font-bold text-slate-900 mb-3"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {feature.title}
        </h3>

        {/* Description */}
        <p className="text-base text-slate-700 leading-relaxed font-normal mb-6">
          {feature.description}
        </p>
      </div>

      {/* Highlights list */}
      <div className="pt-4 border-t border-slate-100 space-y-2">
        {feature.highlights.map((h) => (
          <div key={h} className="flex items-center gap-2">
            <Check size={14} className="text-green-600 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-800">{h}</span>
          </div>
        ))}
      </div>

      {/* Bottom border accent on hover */}
      <div className="absolute bottom-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
    </div>
  );
}
