"use client";

import Link from "next/link";
import { MessageCircle, Globe } from "lucide-react";
import { useState } from "react";
import GetStartedModal from "@/components/GetStartedModal";

export default function MobileBottomBar() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {/* Sticky Bottom Bar for Mobile Only (hidden on md+ desktop) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 p-3 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 shadow-2xl flex items-center gap-2.5">
        <Link
          href="https://t.me/payiitbot"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform"
        >
          <MessageCircle size={16} />
          Start in Telegram
        </Link>

        <button
          onClick={() => setShowModal(true)}
          className="flex-1 py-3 px-4 rounded-2xl bg-slate-800 border border-slate-700 text-slate-100 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <Globe size={16} className="text-emerald-400" />
          Launch Web App
        </button>
      </div>

      <GetStartedModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
