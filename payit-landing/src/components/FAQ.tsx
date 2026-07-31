"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, HelpCircle } from "lucide-react";

const faqs = [
  {
    question: "Can I receive international payments in Nigeria/Africa?",
    answer:
      "Yes. PayIT lets you receive payments from clients and companies in the US, UK, Canada, Europe, and across Africa directly into your multi-currency account. Funds settle in seconds with zero hidden fees.",
    tag: "Payments",
  },
  {
    question: "Can businesses use PayIT for team payroll & invoices?",
    answer:
      "Absolutely. PayIT offers dedicated business accounts equipped with multi-currency management, automated team payroll, professional PDF invoicing, and single-click payment links.",
    tag: "Business",
  },
  {
    question: "Do I need any cryptocurrency or blockchain knowledge?",
    answer:
      "No. PayIT is a modern financial platform built for real-world money. Technology stays in the background — you deal in standard fiat currencies like NGN, USD, EUR, and GBP effortlessly.",
    tag: "Simplicity",
  },
  {
    question: "Is PayIT safe and secure?",
    answer:
      "Yes. Your funds and personal data are protected with bank-grade AES-256 encryption, multi-layer authentication, continuous fraud monitoring, and automated account recovery.",
    tag: "Security",
  },
  {
    question: "How do I get started right now?",
    answer:
      "You can start in under 60 seconds inside Telegram by launching @payiitbot. No mandatory app download is required to send, receive, convert, or withdraw money instantly.",
    tag: "Getting Started",
  },
  {
    question: "What currencies can I hold and convert?",
    answer:
      "You can hold, send, receive, and instantly exchange NGN, USD, EUR, GBP, and more from a single unified account balance with zero exchange rate markup.",
    tag: "Currencies",
  },
];

export default function FAQ() {
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
    <section id="faq" ref={ref} className="section-padding bg-[#F8FAFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`max-w-3xl mx-auto text-center mb-14 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 mb-4">
            <HelpCircle size={15} className="text-green-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-green-700">
              Clear Answers · No Hidden Fine Print
            </span>
          </div>

          <h2
            className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Everything you need to know.
          </h2>
          <p className="text-lg text-slate-700 font-medium max-w-xl mx-auto">
            Full transparency on how PayIT works for individuals, freelancers, and growing businesses.
          </p>
        </div>

        {/* 2-Column Grid of Fully Visible Q&A Cards (Nuvion Style — No hidden accordions!) */}
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-700 delay-200 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="bg-white border border-slate-200/80 rounded-3xl p-7 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider">
                    {faq.tag}
                  </span>
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
                </div>

                <h3
                  className="text-lg font-bold text-slate-900 mb-3 leading-snug"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {faq.question}
                </h3>

                <p className="text-base text-slate-700 leading-relaxed font-normal">
                  {faq.answer}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
