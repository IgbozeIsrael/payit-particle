"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import GetStartedModal from "@/components/GetStartedModal";

const stats = [
  { display: "50+", label: "Currencies" },
  { display: "99.9%", label: "Uptime" },
  { display: "10k+", label: "Users" },
  { display: "<2s", label: "Transfer speed" },
];

export default function Hero() {
  const [visible, setVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <section
        id="hero"
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 70% 40%, rgba(32,193,106,0.09) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 15% 70%, rgba(32,193,106,0.05) 0%, transparent 60%), #FFFFFF",
        }}
      >
        {/* Soft ambient glow */}
        <div
          className="absolute top-10 right-0 w-[700px] h-[700px] pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(32,193,106,0.12) 0%, transparent 65%)",
            filter: "blur(90px)",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center min-h-screen">

          {/* ── Left: Copy ─────────────────────────────────── */}
          <div
            className={`transition-all duration-1000 ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-100 mb-7">
              <Image
                src="/payit-icon.jpg"
                alt="PayIT"
                width={20}
                height={20}
                className="rounded-md"
              />
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-green-700">
                Now live on Telegram &amp; Mobile
              </span>
            </div>

            {/* Headline */}
            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight text-[#101828] mb-6"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Money{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #20C16A, #16A34A)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                without
              </span>
              <br />
              limits.
            </h1>

            {/* Sub */}
            <p
              className="text-lg sm:text-xl text-slate-700 max-w-lg mb-8 leading-relaxed font-normal"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Send, receive, save, and manage your money across borders from one
              secure account.{" "}
              <strong className="text-slate-900 font-bold">
                Start in Telegram. Continue anywhere.
              </strong>
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <button
                id="hero-get-started"
                onClick={() => setShowModal(true)}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full text-white font-bold text-base shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl cursor-pointer"
                style={{ background: "linear-gradient(135deg, #20C16A, #16A34A)" }}
              >
                <MessageCircle size={18} />
                Get Started
                <ArrowRight size={16} />
              </button>
              <Link
                id="hero-how-it-works"
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full text-slate-800 font-bold text-base border border-slate-200 bg-white hover:bg-slate-50 transition-all duration-200"
              >
                See how it works
              </Link>
            </div>

          {/* Explicit Guarantee Badges — Nuvion Style (Nothing hidden!) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-10 text-xs font-bold text-slate-800">
            {["✓ 0% Hidden Fees", "✓ Zero Crypto Jargon", "✓ 2-Second Transfers", "✓ NGN · USD · EUR · GBP"].map((g) => (
              <span key={g} className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-800">
                {g}
              </span>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-4 border-t border-slate-100">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p
                  className="text-2xl font-extrabold text-slate-900"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {stat.display}
                </p>
                <p className="text-xs font-semibold text-slate-600 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Free-floating phone — NO box wrapper ── */}
        <div
          className={`relative flex justify-center items-center transition-all duration-1000 delay-200 ${
            visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-10 scale-95"
          }`}
        >
          {/* The image itself already contains the phone + floating UI cards */}
          <Image
            src="/payit-app-mockup.png"
            alt="PayIT app showing balance ₦2,450,000 with recent transactions"
            width={560}
            height={560}
            priority
            className="w-full max-w-[520px] lg:max-w-[580px] h-auto object-contain drop-shadow-2xl"
            style={{ animation: "float 7s ease-in-out infinite" }}
          />
        </div>

      </div>
    </section>

    <GetStartedModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
