"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

/* ── Telegram chat messages ─────────────────────────────── */
const messages = [
  { type: "bot", text: "👋 Welcome to PayIT! I'm your payment assistant.\n\nWhat would you like to do today?" },
  { type: "user", text: "Send $250 to Chidi" },
  {
    type: "bot",
    text: null,
    card: {
      label: "Transfer Preview",
      amount: "$250.00",
      recipient: "Chidi Okafor",
      rate: "1 USD = ₦1,620",
      fee: "Network fee: $0.50",
      cta: "Confirm Transfer ✓",
    },
  },
  { type: "user", text: "Confirm" },
  {
    type: "bot",
    text: "✅ Done! $250.00 sent to Chidi.\n\nNew balance: $1,840.00",
    status: "sent",
  },
];

/* ── Phone Frame + Chat UI ───────────────────────────────── */
function PhoneMockup() {
  return (
    /* Phone shell */
    <div
      className="relative mx-auto"
      style={{
        width: 300,
        height: 620,
        background: "linear-gradient(160deg, #1a1a1a, #0d0d0d)",
        borderRadius: 44,
        boxShadow:
          "0 0 0 2px #333, 0 0 0 4px #111, 0 40px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
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
        className="flex items-center justify-between px-6 pt-14 pb-0"
        style={{ color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: 600 }}
      >
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <svg width="16" height="10" viewBox="0 0 16 10" fill="white">
            <rect x="0" y="3" width="3" height="7" rx="1" opacity="0.4"/>
            <rect x="4" y="2" width="3" height="8" rx="1" opacity="0.6"/>
            <rect x="8" y="0.5" width="3" height="9.5" rx="1" opacity="0.8"/>
            <rect x="12" y="0" width="3" height="10" rx="1"/>
          </svg>
          <svg width="16" height="10" viewBox="0 0 24 12" fill="white">
            <rect x="0" y="2" width="22" height="9" rx="2.5" stroke="white" strokeWidth="1.5" fill="none" opacity="0.5"/>
            <rect x="22.5" y="4" width="1.5" height="4" rx="0.75" fill="white" opacity="0.5"/>
            <rect x="1.5" y="3.5" width="14" height="6" rx="1.5" fill="white"/>
          </svg>
        </div>
      </div>

      {/* Telegram chat header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: "#1c2b33", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Avatar */}
        <div
          className="flex items-center justify-center rounded-full font-bold text-white text-sm flex-shrink-0"
          style={{ width: 38, height: 38, background: "linear-gradient(135deg, #20C16A, #047857)", fontSize: 13 }}
        >
          P
        </div>
        <div>
          <p className="font-semibold text-white" style={{ fontSize: 14, lineHeight: "1.2" }}>
            PayIT Bot
          </p>
          <p style={{ fontSize: 11, color: "#4ade80" }}>● online</p>
        </div>
      </div>

      {/* Chat messages */}
      <div
        className="flex-1 overflow-hidden px-3 py-3 flex flex-col gap-3"
        style={{ background: "#0e1621" }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.card ? (
              /* Rich card message */
              <div
                className="w-full rounded-2xl overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #1a2e24, #0f2018)",
                  border: "1px solid rgba(32,193,106,0.3)",
                  maxWidth: "90%",
                }}
              >
                <div className="px-3 py-2" style={{ borderBottom: "1px solid rgba(32,193,106,0.2)" }}>
                  <p style={{ fontSize: 10, color: "#4ade80", fontWeight: 700, letterSpacing: "0.05em" }}>
                    {msg.card.label}
                  </p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>
                    {msg.card.amount}
                  </p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>→ {msg.card.recipient}</p>
                </div>
                <div className="px-3 py-1.5">
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{msg.card.rate}</p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{msg.card.fee}</p>
                  <div
                    className="mt-2 rounded-xl py-1.5 flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #20C16A, #16a34a)" }}
                  >
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{msg.card.cta}</p>
                  </div>
                </div>
              </div>
            ) : (
              /* Text bubble */
              <div
                className="rounded-2xl px-3 py-2"
                style={{
                  maxWidth: "82%",
                  background: msg.type === "user"
                    ? "linear-gradient(135deg, #20C16A, #16a34a)"
                    : "#182533",
                  color: "#fff",
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: "pre-line",
                  borderRadius: msg.type === "user"
                    ? "18px 18px 4px 18px"
                    : "18px 18px 18px 4px",
                }}
              >
                {msg.text}
                {msg.status === "sent" && (
                  <span className="ml-1 inline-flex items-center gap-0.5 opacity-70">
                    <Check size={9} />
                    <Check size={9} style={{ marginLeft: -4 }} />
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div
        className="flex items-center gap-2 px-3 py-3"
        style={{ background: "#17212b", borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div
          className="flex-1 rounded-full px-4 py-2"
          style={{ background: "#0e1621", color: "rgba(255,255,255,0.3)", fontSize: 12 }}
        >
          Message…
        </div>
        <div
          className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{ width: 34, height: 34, background: "linear-gradient(135deg, #20C16A, #16a34a)" }}
        >
          <ArrowRight size={14} color="#fff" />
        </div>
      </div>

      {/* Home indicator */}
      <div className="flex justify-center pb-2 pt-0.5" style={{ background: "#17212b" }}>
        <div style={{ width: 100, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
      </div>
    </div>
  );
}

/* ── Feature pills ───────────────────────────────────────── */
const features = [
  "No new app needed — works inside Telegram",
  "Send money in any currency with one message",
  "Instant confirmation, real-time balance",
  "Continue on mobile or web anytime",
];

export default function TelegramHero() {
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
      id="telegram"
      ref={ref}
      className="relative overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #071A2D 0%, #0D2D4A 100%)",
      }}
    >
      {/* Glow blobs */}
      <div
        className="absolute top-0 right-0 w-[500px] h-[500px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(32,193,106,0.15) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(32,193,106,0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

        {/* ── Left: Copy ─────────────────────────────────── */}
        <div
          className={`transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* PayIT icon + label */}
          <div className="flex items-center gap-3 mb-5">
            <Image
              src="/payit-icon.jpg"
              alt="PayIT"
              width={44}
              height={44}
              className="rounded-xl"
            />
            <p className="text-sm font-semibold uppercase tracking-widest text-green-400">
              Where it all starts
            </p>
          </div>

          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight max-w-xl mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Start in Telegram.
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #20C16A, #A7F3D0)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Continue anywhere.
            </span>
          </h2>

          <p className="text-lg text-slate-200 max-w-lg mb-6 leading-relaxed font-normal">
            No new apps required. Manage your money, convert currencies, and pay anyone across borders right inside Telegram — the app you already open every day.
          </p>

          {/* Quick command examples pill bar */}
          <div className="mb-8 p-4 rounded-2xl bg-slate-900/60 border border-slate-700/60 backdrop-blur-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-green-400 mb-2.5">
              Just type or voice command:
            </p>
            <div className="flex flex-wrap gap-2">
              {['"Send $250 to Chidi"', '"Pay ₦150k to landlord"', '"Convert $500 to GBP"'].map((cmd) => (
                <span
                  key={cmd}
                  className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-medium"
                >
                  {cmd}
                </span>
              ))}
            </div>
          </div>

          {/* Feature list */}
          <ul className="space-y-3 mb-10">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                  style={{ background: "rgba(32,193,106,0.2)", border: "1px solid rgba(32,193,106,0.4)" }}
                >
                  <Check size={12} className="text-green-400" />
                </div>
                <span className="text-slate-100 text-sm font-medium leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>

          <Link
            id="telegram-cta"
            href="https://t.me/payiitbot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-7 py-4 rounded-full font-bold text-white text-base transition-all duration-200 hover:scale-105 hover:shadow-2xl"
            style={{ background: "linear-gradient(135deg, #20C16A, #16A34A)" }}
          >
            Open PayIT in Telegram
            <ArrowRight size={16} />
          </Link>
        </div>

        {/* ── Right: Phone Frame with Telegram chat ───────── */}
        <div
          className={`flex justify-center items-center transition-all duration-700 delay-200 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
          }`}
        >
          <div style={{ animation: "float 7s ease-in-out infinite" }}>
            <PhoneMockup />
          </div>
        </div>

      </div>
    </section>
  );
}
