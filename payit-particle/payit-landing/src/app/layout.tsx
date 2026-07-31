import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayIT — Money without limits",
  description:
    "PayIT helps people and businesses send, receive, save, and manage money across borders through Telegram and mobile. Start in Telegram. Continue anywhere.",
  keywords: [
    "PayIT",
    "send money",
    "receive payments",
    "multi-currency",
    "Nigeria",
    "Africa",
    "international transfers",
    "Telegram payments",
    "fintech",
    "borderless payments",
  ],
  openGraph: {
    title: "PayIT — Money without limits",
    description:
      "Send, receive, save, and manage your money across borders from one secure account. Start in Telegram. Continue anywhere.",
    type: "website",
    locale: "en_NG",
    siteName: "PayIT",
  },
  twitter: {
    card: "summary_large_image",
    title: "PayIT — Money without limits",
    description:
      "Send, receive, save, and manage your money across borders from one secure account.",
  },
  icons: {
    icon: "/payit-icon.jpg",
    apple: "/payit-icon.jpg",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
