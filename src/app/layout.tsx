import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { ErrorBoundary } from "@/components/error-boundary";
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
  title: {
    default: "EW Scanner",
    template: "%s | EW Scanner",
  },
  description:
    "Elliott Wave Scanner — Algorithmic wave counting, Fibonacci analysis, and AI-powered deep analysis.",
  openGraph: {
    title: "EW Scanner",
    description:
      "Elliott Wave Scanner — Algorithmic wave counting, Fibonacci analysis, and AI-powered deep analysis.",
    siteName: "EW Scanner",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "EW Scanner",
    description:
      "Elliott Wave Scanner — Algorithmic wave counting, Fibonacci analysis, and AI-powered deep analysis.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <Nav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <footer className="border-t border-[#2a2a2a] bg-[#0f0f0f]">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 text-xs text-[#555]">
            <span>Elliott Wave Scanner</span>
            <span>&copy; 2026</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
