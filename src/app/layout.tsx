import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EW Scanner",
  description:
    "Elliott Wave Scanner — Algorithmic wave counting, Fibonacci analysis, and AI-powered deep analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="border-b border-[#2a2a2a] bg-[#0f0f0f]">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight text-white">
              EW Scanner
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link
                href="/"
                className="text-[#a0a0a0] transition-colors hover:text-white"
              >
                Scanner
              </Link>
              <Link
                href="/guide"
                className="text-[#a0a0a0] transition-colors hover:text-white"
              >
                Guide
              </Link>
              <Link
                href="/learn"
                className="text-[#a0a0a0] transition-colors hover:text-white"
              >
                Learn EW
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
