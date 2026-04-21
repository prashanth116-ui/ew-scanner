import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
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
          {children}
        </main>
        <footer className="border-t border-[#2a2a2a] bg-[#0f0f0f]">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 text-xs text-[#555]">
            <span>Elliott Wave Scanner</span>
            <a
              href="https://github.com/prashanth116-ui/ew-scanner"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[#a0a0a0]"
            >
              GitHub
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
