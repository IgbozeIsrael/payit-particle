"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";

const POST_URL =
  "https://www.linkedin.com/feed/update/urn:li:activity:7464973263723581440";

export default function Blog() {
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
      id="blog"
      ref={ref}
      className="section-padding bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div
          className={`flex items-end justify-between mb-12 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-green-600 mb-2">
              Stories
            </p>
            <h2
              className="text-3xl sm:text-4xl font-extrabold text-[#101828]"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Why it matters
            </h2>
          </div>
          <Link
            href={POST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-green-600 hover:text-green-700 transition-colors"
          >
            View on LinkedIn <ArrowRight size={14} />
          </Link>
        </div>

        {/* Story card */}
        <div
          className={`transition-all duration-700 delay-200 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <Link
            href={POST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <div
              className="relative overflow-hidden rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              style={{
                background:
                  "linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 50%, #F0FDF4 100%)",
              }}
            >
              {/* Top accent bar */}
              <div
                className="h-1 w-full"
                style={{
                  background: "linear-gradient(90deg, #20C16A, #16A34A, #A7F3D0)",
                }}
              />

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">

                {/* Left — story text (3 cols) */}
                <div className="lg:col-span-3 p-8 lg:p-12">

                  {/* Source badge */}
                  <div className="flex items-center gap-2 mb-6">
                    <div
                      className="flex items-center justify-center rounded-lg"
                      style={{ width: 32, height: 32, background: "#0A66C2" }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700">LinkedIn · PayIT</p>
                      <p className="text-xs text-gray-400">Featured story</p>
                    </div>
                  </div>

                  {/* Story headline */}
                  <h3
                    className="text-2xl sm:text-3xl font-extrabold text-[#101828] mb-4 leading-tight"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    Tunde worked until midnight.
                    <br />
                    <span
                      style={{
                        background: "linear-gradient(135deg, #20C16A, #16A34A)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      Then the real stress started.
                    </span>
                  </h3>

                  {/* Story body */}
                  <div className="space-y-3 text-gray-600 text-base leading-relaxed">
                    <p>
                      Tunde finished the Figma project at 11:47&nbsp;pm. Three weeks of work.
                      Endless revisions. By morning, the client in Toronto had paid him{" "}
                      <strong className="text-gray-800">$800 in USDT</strong>.
                    </p>
                    <p>
                      Then he opened Bybit P2P. Posted his rate. Waited. Negotiated with
                      strangers. Got cancelled on. Stayed awake past 1&nbsp;am just trying to
                      convert <em>his own money</em> into Naira.
                    </p>
                    <p>
                      This is the invisible tax many African freelancers pay. Not because
                      they&apos;re bad with money — but because{" "}
                      <strong className="text-gray-800">
                        moving money across borders is still unnecessarily hard.
                      </strong>
                    </p>
                  </div>

                  {/* Divider + resolution */}
                  <div
                    className="my-6 h-px w-full"
                    style={{ background: "linear-gradient(90deg, #20C16A33, transparent)" }}
                  />

                  <p className="text-gray-600 text-base leading-relaxed">
                    A friend introduced him to PayIT. Now Tunde gets paid in stable dollars,
                    keeps his savings protected, and sends Naira instantly —{" "}
                    <strong className="text-gray-800">inside Telegram</strong>. No P2P boards.
                    No midnight negotiations. No extra app downloads.
                  </p>

                  {/* CTA row */}
                  <div className="mt-8 flex items-center gap-3">
                    <span
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-bold group-hover:shadow-lg transition-all duration-200"
                      style={{ background: "linear-gradient(135deg, #20C16A, #16A34A)" }}
                    >
                      Read the full story
                      <ExternalLink size={13} />
                    </span>
                  </div>
                </div>

                {/* Right — pull quote panel (2 cols) */}
                <div
                  className="lg:col-span-2 flex items-center justify-center p-8 lg:p-10"
                  style={{
                    background: "linear-gradient(160deg, #071A2D 0%, #0D2D4A 100%)",
                    borderRadius: "0 0 24px 0",
                  }}
                >
                  <div className="text-center">
                    {/* Large quote mark */}
                    <div
                      className="text-7xl font-serif leading-none mb-4"
                      style={{ color: "rgba(32,193,106,0.3)" }}
                    >
                      &ldquo;
                    </div>
                    <blockquote
                      className="text-xl font-bold text-white leading-snug mb-6"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      He simply holds the mic and says:{" "}
                      <span
                        style={{
                          background: "linear-gradient(135deg, #20C16A, #A7F3D0)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }}
                      >
                        &ldquo;Send 150k to my landlord.&rdquo;
                      </span>
                      <br />
                      Done.
                    </blockquote>

                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">Tunde, Freelancer</p>
                      <p className="text-xs text-gray-500">Lagos, Nigeria</p>
                    </div>

                    {/* Metrics */}
                    <div className="mt-8 grid grid-cols-2 gap-4">
                      {[
                        { value: "11:47 pm", label: "Delivered the work" },
                        { value: "<2 min", label: "Transfer to Naira" },
                      ].map((m) => (
                        <div
                          key={m.label}
                          className="rounded-xl p-3"
                          style={{
                            background: "rgba(32,193,106,0.08)",
                            border: "1px solid rgba(32,193,106,0.2)",
                          }}
                        >
                          <p
                            className="text-lg font-extrabold text-white"
                            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                          >
                            {m.value}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          {/* Mobile LinkedIn link */}
          <div className="mt-4 flex sm:hidden justify-end">
            <Link
              href={POST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-green-600 hover:text-green-700 transition-colors"
            >
              View on LinkedIn <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
