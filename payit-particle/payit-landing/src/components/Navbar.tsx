"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

import GetStartedModal from "@/components/GetStartedModal";

const navLinks = [
  { label: "Product", href: "#features" },
  { label: "Features", href: "#features" },
  { label: "Business", href: "#business" },
  { label: "About", href: "#about" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          scrolled
            ? "bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-100"
            : "bg-transparent"
        }`}
      >
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 md:h-20">
          {/* Logo: icon + wordmark */}
          <Link href="/" aria-label="PayIT home" className="flex items-center gap-2.5">
            {/* App icon */}
            <Image
              src="/payit-icon.jpg"
              alt=""
              width={36}
              height={36}
              className="rounded-xl flex-shrink-0"
              priority
            />
            {/* Wordmark */}
            <Image
              src="/payit-wordmark.png"
              alt="PayIT — Money without limits"
              width={140}
              height={46}
              className="h-11 w-auto object-contain"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <ul className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={() => setShowModal(true)}
              className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
            >
              Sign in
            </button>
            <button
              id="navbar-get-started"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all duration-200 hover:scale-105 hover:shadow-lg"
              style={{ background: "linear-gradient(135deg, #20C16A, #16A34A)" }}
            >
              Get Started
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-6 flex flex-col gap-4">
            <div className="flex items-center gap-2.5 mb-2">
              <Image
                src="/payit-icon.jpg"
                alt=""
                width={30}
                height={30}
                className="rounded-xl flex-shrink-0"
              />
              <Image
                src="/payit-wordmark.png"
                alt="PayIT"
                width={110}
                height={36}
                className="h-9 w-auto object-contain"
              />
            </div>
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-base font-medium text-gray-700 hover:text-gray-900 py-1"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <button
              className="mt-2 inline-flex items-center justify-center px-6 py-3 rounded-full text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #20C16A, #16A34A)" }}
              onClick={() => {
                setOpen(false);
                setShowModal(true);
              }}
            >
              Get Started
            </button>
          </div>
        )}
      </header>

      <GetStartedModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
