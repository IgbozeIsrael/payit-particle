"use client";

import Image from "next/image";
import Link from "next/link";
import { X, MessageCircle, Smartphone, Globe, ArrowRight, Sparkles } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GetStartedModal({ isOpen, onClose }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      {/* Modal Card */}
      <div
        className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl transition-all duration-300"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {/* Brand header */}
        <div className="flex items-center gap-3 mb-6">
          <Image
            src="/payit-icon.jpg"
            alt="PayIT"
            width={40}
            height={40}
            className="rounded-xl shadow-sm"
          />
          <div>
            <h3
              className="text-xl font-bold text-slate-900 leading-none mb-1"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Get Started with PayIT
            </h3>
            <p className="text-xs text-slate-500 font-medium">Choose your preferred experience</p>
          </div>
        </div>

        {/* Options Stack */}
        <div className="space-y-3.5">

          {/* 1. Telegram Bot (Primary) */}
          <Link
            href="https://t.me/payiitbot"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="group block p-4 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50/60 border border-green-200/90 hover:border-green-400 hover:shadow-lg transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                <MessageCircle size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Start in Telegram
                  </p>
                  <span className="px-2 py-0.5 rounded-full bg-green-600 text-white text-[10px] font-bold">
                    RECOMMENDED
                  </span>
                </div>
                <p className="text-xs text-slate-600 truncate">
                  No app download needed · Send &amp; receive instantly
                </p>
              </div>
              <ArrowRight size={18} className="text-green-600 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* 2. Web App */}
          <Link
            href="/app"
            onClick={onClose}
            className="group block p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100/80 transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                <Globe size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    Launch Web App
                  </p>
                </div>
                <p className="text-xs text-slate-600 truncate">
                  Full multi-currency wallet &amp; dashboard on mobile
                </p>
              </div>
              <ArrowRight size={18} className="text-slate-400 group-hover:translate-x-1 group-hover:text-slate-700 transition-all" />
            </div>
          </Link>

          {/* 3. Mobile Apps (Coming Soon) */}
          <div className="p-4 rounded-2xl bg-slate-50/60 border border-slate-200/60 opacity-80">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center flex-shrink-0">
                <Smartphone size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-slate-700" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    iOS &amp; Android Apps
                  </p>
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                    COMING SOON
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">
                  Native app store builds launching soon
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer micro note */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-green-600" />
            <span>0% Hidden FX Fees</span>
          </div>
          <span>Bank-Grade Security</span>
        </div>
      </div>
    </div>
  );
}
