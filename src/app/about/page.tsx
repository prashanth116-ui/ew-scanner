import Link from "next/link";
import type { Metadata } from "next";
import { Activity, TrendingUp, Zap, BarChart3, Search, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "EW Scanner — Free algorithmic Elliott Wave scanning, short squeeze screening, and multi-bagger stock detection with AI-powered analysis.",
};

const scanners = [
  {
    href: "/",
    title: "EW Scanner",
    description:
      "Algorithmic Elliott Wave counting across 600+ stocks. Fibonacci analysis, multi-timeframe confirmation, and AI-powered deep analysis for every candidate.",
    icon: Activity,
    features: [
      "4 scanner modes: W2 Bottom, W4 Pullback, W5 Exhaust, Breakout",
      "Automated wave counting with rule validation",
      "AI deep analysis powered by Claude",
      "Sparkline charts with wave position overlays",
    ],
    color: "#5ba3e6",
  },
  {
    href: "/squeeze",
    title: "Squeeze Screener",
    description:
      "Screen 700+ stocks for short squeeze setups. Real-time short interest, days to cover, float analysis, and Elliott Wave alignment scoring.",
    icon: Zap,
    features: [
      "5 preset strategies: GME-Style, Vol Ignition, Micro Float, Near Lows, Wide Net",
      "Short interest, float, and volume analysis",
      "Elliott Wave alignment overlay",
      "Watchlists with score change tracking",
    ],
    color: "#f59e0b",
  },
  {
    href: "/prerun",
    title: "Pre-Run Scanner",
    description:
      "Multi-bagger stock screener with 7 algorithmic scoring criteria across 11 sector buckets. Identify beaten-down stocks with structural catalysts before they run.",
    icon: TrendingUp,
    features: [
      "3-gate qualification + 7-criteria scoring (0-14 scale)",
      "AI narrative catalyst scoring",
      "11 sector buckets: EV, Nuclear, Rare Earth, Semis, and more",
      "TradingView webhook integration for price alerts",
    ],
    color: "#10b981",
  },
];

const features = [
  {
    icon: Search,
    title: "Algorithmic Scanning",
    desc: "No manual chart reading. Algorithms identify wave positions, Fibonacci zones, and momentum signatures automatically.",
  },
  {
    icon: BarChart3,
    title: "Data-Driven Scoring",
    desc: "Every candidate gets a mechanical score based on decline depth, duration, recovery, Fibonacci zone, volume, and structure.",
  },
  {
    icon: Shield,
    title: "Risk-Aware",
    desc: "Confidence tiers (High / Probable / Speculative) help you size positions appropriately. Invalidation levels included.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center">
        <div className="mx-auto flex items-center justify-center gap-3 mb-6">
          <Activity className="h-10 w-10 text-[#5ba3e6]" />
          <h1 className="text-4xl font-bold text-white sm:text-5xl">
            EW Scanner
          </h1>
        </div>
        <p className="mx-auto max-w-2xl text-lg text-[#a0a0a0]">
          Free algorithmic stock scanning powered by Elliott Wave theory, short
          squeeze mechanics, and multi-bagger pattern detection — with AI
          analysis built in.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-md bg-[#185FA5] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1a6dba]"
          >
            Open Scanner
          </Link>
          <Link
            href="/guide"
            className="rounded-md border border-[#2a2a2a] px-6 py-3 text-sm font-semibold text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
          >
            Read the Guide
          </Link>
          <Link
            href="/learn"
            className="rounded-md border border-[#2a2a2a] px-6 py-3 text-sm font-semibold text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
          >
            Learn Elliott Wave
          </Link>
        </div>
      </section>

      {/* Scanner cards */}
      <section>
        <h2 className="mb-8 text-center text-2xl font-bold text-white">
          Three Scanners, One Platform
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {scanners.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6 transition-colors hover:border-[#3a3a3a]"
            >
              <div className="mb-4 flex items-center gap-3">
                <s.icon
                  className="h-6 w-6"
                  style={{ color: s.color }}
                />
                <h3 className="text-lg font-bold text-white">{s.title}</h3>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-[#a0a0a0]">
                {s.description}
              </p>
              <ul className="space-y-1.5">
                {s.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-xs text-[#777]"
                  >
                    <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-[#555]" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 text-xs font-medium text-[#5ba3e6] opacity-0 transition-opacity group-hover:opacity-100">
                Open scanner &rarr;
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="mb-8 text-center text-2xl font-bold text-white">
          How It Works
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="text-center">
              <f.icon className="mx-auto mb-3 h-8 w-8 text-[#5ba3e6]" />
              <h3 className="mb-2 text-sm font-bold text-white">{f.title}</h3>
              <p className="text-xs leading-relaxed text-[#a0a0a0]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6 text-center text-xs text-[#555]">
        <p>
          <strong className="text-[#777]">Disclaimer:</strong> EW Scanner is an
          educational and analytical tool. It does not constitute financial
          advice. All trading involves risk. Past performance does not guarantee
          future results. Always do your own research before making investment
          decisions.
        </p>
      </section>
    </div>
  );
}
