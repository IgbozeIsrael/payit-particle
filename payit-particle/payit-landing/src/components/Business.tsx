"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ArrowRight,
  Globe2,
  Users,
  FileText,
  CreditCard,
  Link2,
  TrendingUp,
} from "lucide-react";

const businessFeatures = [
  { icon: Globe2, label: "Multi-currency accounts" },
  { icon: Users, label: "Payroll management" },
  { icon: FileText, label: "Invoicing & billing" },
  { icon: CreditCard, label: "Team payments" },
  { icon: Link2, label: "Payment links" },
];

/* ── Business Phone Mockup ──────────────────────────────── */
function BusinessPhoneMockup() {
  return (
    <div
      className="relative mx-auto"
      style={{
        width: 300,
        height: 620,
        background: "linear-gradient(160deg, #1a1a1a, #0d0d0d)",
        borderRadius: 44,
        boxShadow:
          "0 0 0 2px #2a2a2a, 0 0 0 4px #111, 0 50px 100px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Dynamic Island */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          width: 120,
          height: 34,
          background: "#000",
          borderRadius: 20,
          zIndex: 10,
        }}
      />

      {/* Status bar */}
      <div
        className="flex items-center justify-between px-5 pt-14 pb-1"
        style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 600 }}
      >
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <svg width="15" height="10" viewBox="0 0 16 10" fill="white">
            <rect x="0" y="3" width="3" height="7" rx="1" opacity="0.4" />
            <rect x="4" y="2" width="3" height="8" rx="1" opacity="0.6" />
            <rect x="8" y="0.5" width="3" height="9.5" rx="1" opacity="0.8" />
            <rect x="12" y="0" width="3" height="10" rx="1" />
          </svg>
          <svg width="16" height="10" viewBox="0 0 24 12" fill="white">
            <rect x="0" y="2" width="22" height="9" rx="2.5" stroke="white" strokeWidth="1.5" fill="none" opacity="0.5" />
            <rect x="22.5" y="4" width="1.5" height="4" rx="0.75" fill="white" opacity="0.5" />
            <rect x="1.5" y="3.5" width="15" height="6" rx="1.5" fill="white" />
          </svg>
        </div>
      </div>

      {/* App screen content */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0a1628 0%, #071020 100%)",
        }}
      >
        {/* Screen header */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between">
          <div>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 600, letterSpacing: "0.04em" }}>
              BUSINESS
            </p>
            <p style={{ fontSize: 16, color: "#fff", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif" }}>
              Acme Tech Ltd
            </p>
          </div>
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ width: 34, height: 34, background: "rgba(32,193,106,0.15)", border: "1px solid rgba(32,193,106,0.3)" }}
          >
            <TrendingUp size={16} color="#20C16A" />
          </div>
        </div>

        {/* Balance card */}
        <div className="mx-4 rounded-2xl p-4 mb-4"
          style={{
            background: "linear-gradient(135deg, #112240 0%, #0d1b33 100%)",
            border: "1px solid rgba(32,193,106,0.18)",
          }}
        >
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Business Balance</p>
          <p style={{ fontSize: 24, fontWeight: 900, color: "#fff", fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>
            ₦12,450,000
          </p>
          <p style={{ fontSize: 11, color: "#4ade80", marginTop: 2 }}>$8,231.00 USD</p>

          <div className="flex justify-between mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {[
              { label: "Team", value: "12 members" },
              { label: "Invoices", value: "24 sent" },
              { label: "Payroll", value: "Next Friday" },
            ].map((item) => (
              <div key={item.label}>
                <p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>{item.label}</p>
                <p style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {["Pay Team", "Send Invoice", "Add Funds"].map((btn) => (
              <div
                key={btn}
                className="rounded-xl py-2 flex items-center justify-center"
                style={{
                  background: "rgba(32,193,106,0.1)",
                  border: "1px solid rgba(32,193,106,0.35)",
                }}
              >
                <p style={{ fontSize: 9, fontWeight: 700, color: "#4ade80" }}>{btn}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity list */}
        <div className="px-4 flex-1">
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 8, fontWeight: 600, letterSpacing: "0.04em" }}>
            RECENT ACTIVITY
          </p>
          {[
            { name: "Payroll — Dev Team", amount: "-₦2,400,000", time: "Today, 09:00", positive: false },
            { name: "Client Invoice #42", amount: "+$4,500", time: "Yesterday", positive: true },
            { name: "Add Funds — GTB", amount: "+₦5,000,000", time: "Jul 28", positive: true },
          ].map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between py-2.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="rounded-lg flex items-center justify-center"
                  style={{
                    width: 28, height: 28,
                    background: item.positive ? "rgba(32,193,106,0.12)" : "rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: item.positive ? "#20C16A" : "rgba(255,255,255,0.3)",
                    }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>{item.name}</p>
                  <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{item.time}</p>
                </div>
              </div>
              <p style={{ fontSize: 10, fontWeight: 700, color: item.positive ? "#4ade80" : "rgba(255,255,255,0.7)" }}>
                {item.amount}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <div
        className="flex items-center justify-around py-3"
        style={{ background: "#070f1e", borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        {["🏠", "💼", "📊", "⚙️"].map((icon, i) => (
          <span key={i} style={{ fontSize: i === 1 ? 18 : 16, opacity: i === 1 ? 1 : 0.35 }}>
            {icon}
          </span>
        ))}
      </div>

      {/* Home indicator */}
      <div className="flex justify-center py-2" style={{ background: "#070f1e" }}>
        <div style={{ width: 100, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
      </div>
    </div>
  );
}

/* ── Section ─────────────────────────────────────────────── */
export default function Business() {
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
    <section id="business" ref={ref} className="section-padding bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* ── Left: Copy ─────────────────────────────── */}
          <div
            className={`transition-all duration-700 ${
              visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
            }`}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 mb-4">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-green-700">
                Corporate Infrastructure
              </span>
            </div>
            <h2
              className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight mb-5"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Built for modern
              <br />
              growing businesses.
            </h2>
            <p className="text-lg text-slate-700 mb-8 leading-relaxed font-normal">
              Whether you&apos;re paying a remote team across Africa or collecting payments from international clients, PayIT gives your business the financial infrastructure it deserves.
            </p>

            <ul className="space-y-4 mb-10">
              {businessFeatures.map((feat) => {
                const Icon = feat.icon;
                return (
                  <li key={feat.label} className="flex items-center gap-4 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center flex-shrink-0">
                      <Icon size={18} className="text-green-600" />
                    </div>
                    <span className="text-base font-bold text-slate-900">{feat.label}</span>
                    <Check size={18} className="text-green-600 ml-auto" />
                  </li>
                );
              })}
            </ul>

            <Link
              id="business-open-account"
              href="https://t.me/payiitbot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full text-white font-bold text-base shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl"
              style={{ background: "linear-gradient(135deg, #20C16A, #16A34A)" }}
            >
              Open a Business Account
              <ArrowRight size={16} />
            </Link>
          </div>

          {/* ── Right: Phone frame with dashboard ──────── */}
          <div
            className={`relative flex justify-center items-center transition-all duration-700 delay-200 ${
              visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            }`}
          >
            {/* Ambient glow behind phone */}
            <div
              className="absolute w-80 h-80 rounded-full pointer-events-none"
              style={{
                background: "radial-gradient(circle, rgba(32,193,106,0.20) 0%, transparent 70%)",
                filter: "blur(50px)",
              }}
            />

            {/* Phone with gentle float */}
            <div style={{ animation: "float 7s ease-in-out infinite", position: "relative", zIndex: 1 }}>
              <BusinessPhoneMockup />
            </div>

            {/* Floating stat — top right */}
            <div
              className="absolute top-6 -right-2 lg:right-0 rounded-2xl px-4 py-3 shadow-xl z-20"
              style={{
                background: "rgba(255,255,255,0.92)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(0,0,0,0.07)",
                animation: "float 6s ease-in-out infinite 1s",
              }}
            >
              <p className="text-xs text-gray-500">Active invoices</p>
              <p
                className="text-2xl font-extrabold text-[#101828]"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                47
              </p>
            </div>

            {/* Floating stat — bottom left */}
            <div
              className="absolute bottom-8 -left-2 lg:left-0 rounded-2xl px-4 py-3 shadow-xl z-20"
              style={{
                background: "rgba(255,255,255,0.92)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(0,0,0,0.07)",
                animation: "float 5s ease-in-out infinite 0.5s",
              }}
            >
              <p className="text-xs text-gray-500">This month</p>
              <p
                className="text-lg font-extrabold text-green-600"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                +₦24.5M
              </p>
              <p className="text-xs text-gray-500">revenue collected</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
