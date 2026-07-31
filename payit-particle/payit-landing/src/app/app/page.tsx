"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Smartphone,
  MessageCircle,
  ArrowRight,
  QrCode,
  ArrowLeft,
  Bell,
  Eye,
  EyeOff,
  Plus,
  Send,
  Download,
  CreditCard,
  Building2,
  User,
  CheckCircle2,
  Copy,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Sparkles,
} from "lucide-react";

export default function WebAppPage() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "cards" | "business" | "profile">("home");
  const [currency, setCurrency] = useState<"NGN" | "USD" | "EUR" | "GBP">("NGN");
  const [hideBalance, setHideBalance] = useState(false);
  const [copied, setCopied] = useState(false);

  // Send Money Modal State
  const [showSendModal, setShowSendModal] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);

  // Check window size on mount & resize
  useEffect(() => {
    setMounted(true);
    const checkViewport = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  if (!mounted) return null;

  // ─────────────────────────────────────────────────────────────
  // 💻 DESKTOP SCREEN: Ask user to switch to mobile device
  // ─────────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #071A2D 0%, #0D2D4A 50%, #07101C 100%)",
          color: "#fff",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {/* Decorative ambient glows */}
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(32,193,106,0.18) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />

        <div className="relative z-10 max-w-lg mx-auto bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-8 lg:p-12 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center items-center gap-3 mb-8">
            <Image
              src="/payit-icon.jpg"
              alt="PayIT"
              width={48}
              height={48}
              className="rounded-2xl shadow-md"
            />
            <Image
              src="/payit-wordmark.png"
              alt="PayIT"
              width={140}
              height={44}
              className="h-10 w-auto brightness-0 invert"
            />
          </div>

          {/* Smartphone icon badge */}
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-6">
            <Smartphone size={32} />
          </div>

          {/* Heading */}
          <h1
            className="text-3xl font-extrabold text-white mb-3 leading-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Switch to a Mobile Device
          </h1>

          <p className="text-base text-slate-300 mb-8 leading-relaxed">
            The PayIT Web App is designed exclusively for smartphone browsers. Please open{" "}
            <strong className="text-white">payitng.xyz/app</strong> on your mobile phone or scan the QR code below.
          </p>

          {/* Simulated QR Code box */}
          <div className="bg-white p-5 rounded-2xl inline-block mb-8 shadow-lg border border-slate-200">
            <div className="w-36 h-36 bg-slate-900 rounded-xl flex flex-col items-center justify-center p-3 text-center">
              <QrCode size={80} className="text-emerald-400 mb-1" />
              <p className="text-[10px] font-mono text-slate-400">SCAN TO OPEN APP</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <Link
              href="https://t.me/payiitbot"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 rounded-full font-bold text-white text-base shadow-lg transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #20C16A, #16A34A)" }}
            >
              <MessageCircle size={18} />
              Open PayIT Bot on Telegram
            </Link>
            <Link
              href="/"
              className="w-full py-3.5 rounded-full font-semibold text-slate-300 text-sm border border-white/10 hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} />
              Back to Home Website
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs text-slate-400">
          PayIT — Money without limits · Start in Telegram. Continue anywhere.
        </p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 📱 MOBILE APP SCREEN: Interactive Web App Dashboard
  // ─────────────────────────────────────────────────────────────
  const copyAccountNo = () => {
    navigator.clipboard.writeText("0123456789");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !sendAmount) return;
    setSendSuccess(true);
    setTimeout(() => {
      setSendSuccess(false);
      setShowSendModal(false);
      setRecipient("");
      setSendAmount("");
    }, 2000);
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-white flex flex-col justify-between"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── Top Header Bar ───────────────────────────────── */}
      <header className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Image
            src="/payit-icon.jpg"
            alt="PayIT"
            width={34}
            height={34}
            className="rounded-xl shadow-sm"
          />
          <div>
            <p className="text-xs text-slate-400 font-medium leading-none mb-1">Welcome back</p>
            <h2 className="text-sm font-bold text-white leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              David Okafor 👋
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white relative">
            <Bell size={18} />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500" />
          </button>
        </div>
      </header>

      {/* ── Main Tab Content ─────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-4 py-5 space-y-6 pb-24">

        {/* Currency Switcher Chips */}
        <div className="flex items-center justify-between bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
          {(["NGN", "USD", "EUR", "GBP"] as const).map((curr) => (
            <button
              key={curr}
              onClick={() => setCurrency(curr)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                currency === curr
                  ? "bg-emerald-500 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {curr}
            </button>
          ))}
        </div>

        {/* Balance Card */}
        <div
          className="relative rounded-3xl p-6 overflow-hidden shadow-2xl border border-emerald-500/20"
          style={{
            background: "linear-gradient(135deg, #047857 0%, #064E3B 50%, #022C22 100%)",
          }}
        >
          {/* Subtle background glow */}
          <div
            className="absolute top-0 right-0 w-48 h-48 rounded-full pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(94,234,176,0.2) 0%, transparent 70%)",
              filter: "blur(20px)",
            }}
          />

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">
              {currency} Equity Balance
            </span>
            <button
              onClick={() => setHideBalance(!hideBalance)}
              className="text-emerald-200/80 hover:text-white transition-colors"
            >
              {hideBalance ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Amount */}
          <div className="mb-6">
            <h1
              className="text-3xl font-extrabold text-white tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {hideBalance ? (
                "••••••••"
              ) : currency === "NGN" ? (
                "₦2,450,000.00"
              ) : currency === "USD" ? (
                "$1,512.30"
              ) : currency === "EUR" ? (
                "€1,390.50"
              ) : (
                "£1,210.00"
              )}
            </h1>
            <p className="text-xs text-emerald-200/70 mt-1 font-medium">
              Equivalent to $1,512.30 USD · 0% FX Markup
            </p>
          </div>

          {/* Account Number Strip */}
          <div className="flex items-center justify-between bg-black/25 backdrop-blur-md rounded-xl px-3.5 py-2.5 border border-white/10">
            <div>
              <p className="text-[10px] text-emerald-200/70 font-semibold uppercase">PayIT NGN Virtual Account</p>
              <p className="text-xs font-mono font-bold text-white">Wema Bank · 0123456789</p>
            </div>
            <button
              onClick={copyAccountNo}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors"
            >
              <Copy size={12} />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Quick Action Grid */}
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={() => setShowSendModal(true)}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Send size={18} />
            </div>
            <span className="text-xs font-semibold text-slate-200">Send</span>
          </button>

          <button
            onClick={copyAccountNo}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Plus size={18} />
            </div>
            <span className="text-xs font-semibold text-slate-200">Add Money</span>
          </button>

          <button
            onClick={copyAccountNo}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-purple-500 text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Download size={18} />
            </div>
            <span className="text-xs font-semibold text-slate-200">Receive</span>
          </button>

          <Link
            href="https://t.me/payiitbot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-400/50 transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-slate-800 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <MessageCircle size={18} />
            </div>
            <span className="text-xs font-semibold text-slate-200">Telegram</span>
          </Link>
        </div>

        {/* Telegram Sync Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-500/20">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Synced with Telegram</p>
              <p className="text-[11px] text-slate-400">@payiitbot active on this account</p>
            </div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {/* Recent Transactions Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-sm font-bold text-white uppercase tracking-wider"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Recent Activity
            </h3>
            <span className="text-xs font-semibold text-emerald-400">See All</span>
          </div>

          <div className="space-y-2.5">
            {[
              { title: "Uber Ride", date: "May 15, 14:30", amount: "-₦15,000.00", icon: ArrowUpRight, color: "text-rose-400", bg: "bg-rose-500/10" },
              { title: "Client Payout — Toronto", date: "May 12, 09:15", amount: "+$1,250.00", icon: ArrowDownLeft, color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { title: "DStv Subscription", date: "May 10, 16:22", amount: "-₦21,500.00", icon: ArrowUpRight, color: "text-rose-400", bg: "bg-rose-500/10" },
              { title: "Spar Supermarket", date: "May 09, 11:45", amount: "-₦55,000.00", icon: ArrowUpRight, color: "text-rose-400", bg: "bg-rose-500/10" },
            ].map((tx, idx) => {
              const TxIcon = tx.icon;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${tx.bg} ${tx.color} flex items-center justify-center`}>
                      <TxIcon size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{tx.title}</p>
                      <p className="text-[10px] text-slate-400">{tx.date}</p>
                    </div>
                  </div>
                  <p className={`text-xs font-extrabold ${tx.color}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {tx.amount}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

      </main>

      {/* ── Bottom Navigation Bar ─────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-6 py-2.5 flex items-center justify-around z-30">
        {[
          { id: "home", label: "Home", icon: Smartphone },
          { id: "cards", label: "Cards", icon: CreditCard },
          { id: "business", label: "Business", icon: Building2 },
          { id: "profile", label: "Profile", icon: User },
        ].map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-center gap-1 transition-all ${
                isActive ? "text-emerald-400 font-bold scale-105" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <TabIcon size={20} />
              <span className="text-[10px]">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Send Money Modal Overlay ────────────────────── */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            {sendSuccess ? (
              <div className="text-center py-6">
                <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-3 animate-bounce" />
                <h3 className="text-xl font-bold text-white mb-1">Transfer Successful!</h3>
                <p className="text-xs text-slate-400">Funds sent instantly to {recipient}</p>
              </div>
            ) : (
              <form onSubmit={handleSend} className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold text-white">Send Money</h3>
                  <button
                    type="button"
                    onClick={() => setShowSendModal(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Recipient (Name or Telegram handle)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chidi Okafor or @chidi"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Amount ({currency})</label>
                  <input
                    type="number"
                    required
                    placeholder="0.00"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-full font-bold text-white text-xs bg-emerald-500 hover:bg-emerald-600 shadow-lg transition-colors mt-4"
                >
                  Confirm Transfer
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
