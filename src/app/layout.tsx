import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { Footer } from "@/components/footer";
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
    "Free algorithmic stock scanning — Elliott Wave analysis, short squeeze screening, multi-bagger detection, and sector rotation tracking with AI-powered insights.",
  openGraph: {
    title: "EW Scanner",
    description:
      "Free algorithmic stock scanning — Elliott Wave analysis, short squeeze screening, multi-bagger detection, and sector rotation tracking with AI-powered insights.",
    siteName: "EW Scanner",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "EW Scanner",
    description:
      "Free algorithmic stock scanning — Elliott Wave analysis, short squeeze screening, multi-bagger detection, and sector rotation tracking with AI-powered insights.",
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
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <Nav />
        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <Footer />
      </body>
    </html>
  );
}
