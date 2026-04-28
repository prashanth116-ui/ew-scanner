import Link from "next/link";
import type { Metadata } from "next";
import { Activity, TrendingUp, Zap, BarChart3, Search, Shield, Clock, Database, Mail } from "lucide-react";

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
      "Algorithmic Elliott Wave counting across curated stock universes (S&P 500, Nasdaq, Biotech, Energy, and more). Fibonacci analysis, multi-timeframe confirmation, and AI-powered deep analysis.",
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
      "Screen 1,300+ stocks for short squeeze setups. Short interest, days to cover, float analysis, and Elliott Wave alignment scoring.",
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
      "Multi-bagger stock screener with 11 algorithmic scoring criteria across 680+ stocks in 13 GICS sectors. Identify beaten-down stocks with structural catalysts before they run.",
    icon: TrendingUp,
    features: [
      "3-gate qualification + 11-criteria scoring (0-24 scale)",
      "AI narrative catalyst scoring",
      "13 GICS sectors: Semis, Software, Biotech, Energy, and more",
      "TradingView webhook integration for price alerts",
    ],
    color: "#10b981",
  },
  {
    href: "/sectors",
    title: "Sector Rotation",
    description:
      "Multi-factor sector analysis tracking 900+ stocks across 13 GICS sectors. RRG quadrant mapping, momentum scoring, and cross-sector pair ratios to identify where institutional money is flowing.",
    icon: BarChart3,
    features: [
      "Relative Rotation Graphs (RRG) with 4-quadrant classification",
      "Composite scoring: momentum, relative strength, breadth",
      "Cross-sector pairs: XLY/XLP, XLK/XLU ratios",
      "Historical snapshots with trend comparison",
    ],
    color: "#8b5cf6",
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
            Get Started
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border border-[#2a2a2a] px-6 py-3 text-sm font-semibold text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
          >
            View Pricing
          </Link>
        </div>
      </section>

      {/* Scanner cards */}
      <section>
        <h2 className="mb-8 text-center text-2xl font-bold text-white">
          Four Scanners, One Platform
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Data Freshness */}
      <section>
        <div className="flex items-center justify-center gap-3 mb-8">
          <Database className="h-6 w-6 text-[#5ba3e6]" />
          <h2 className="text-2xl font-bold text-white">Data Freshness</h2>
        </div>
        <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a]">
                <th className="px-4 py-3 text-left font-semibold text-white">Scanner</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Data Source</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Freshness</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Cache</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Refresh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a]">
              <tr className="bg-[#141414]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-[#5ba3e6]" />
                    <span className="font-medium text-white">EW Scanner</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#a0a0a0]">Yahoo Finance weekly bars</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs text-amber-400">Weekly</span>
                </td>
                <td className="px-4 py-3 text-[#a0a0a0]">None</td>
                <td className="px-4 py-3 text-[#a0a0a0]">Manual + cron</td>
              </tr>
              <tr className="bg-[#141414]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[#10b981]" />
                    <span className="font-medium text-white">Pre-Run Scanner</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#a0a0a0]">Yahoo + Finnhub + SEC EDGAR</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-xs text-green-400">EOD</span>
                </td>
                <td className="px-4 py-3 text-[#a0a0a0]">Manual save only</td>
                <td className="px-4 py-3 text-[#a0a0a0]">Manual + nightly cron</td>
              </tr>
              <tr className="bg-[#141414]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[#f59e0b]" />
                    <span className="font-medium text-white">Squeeze Screener</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#a0a0a0]">Yahoo Finance quoteSummary</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-xs text-green-400">Near real-time</span>
                </td>
                <td className="px-4 py-3 text-[#a0a0a0]">None</td>
                <td className="px-4 py-3 text-[#a0a0a0]">Every lookup</td>
              </tr>
              <tr className="bg-[#141414]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[#8b5cf6]" />
                    <span className="font-medium text-white">Sector Rotation</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#a0a0a0]">Yahoo Finance daily bars (15 ETFs)</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-xs text-green-400">EOD</span>
                </td>
                <td className="px-4 py-3 text-[#a0a0a0]">4h client + 15min server</td>
                <td className="px-4 py-3 text-[#a0a0a0]">Auto every 10 min</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-[#5ba3e6]" />
              <span className="text-xs font-semibold text-white">EW Scanner</span>
            </div>
            <p className="text-xs text-[#777]">Uses weekly bars for swing/position timeframes. Data updates each Friday close. Best for multi-week setups, not intraday.</p>
          </div>
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-[#10b981]" />
              <span className="text-xs font-semibold text-white">Pre-Run</span>
            </div>
            <p className="text-xs text-[#777]">Prices are EOD (1-2 days). SEC revenue filings can lag 30-90 days (quarterly). Insider data updates daily via Finnhub.</p>
          </div>
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-[#f59e0b]" />
              <span className="text-xs font-semibold text-white">Squeeze</span>
            </div>
            <p className="text-xs text-[#777]">Freshest data. No caching. Price and volume are near real-time. Short interest updates EOD after market close.</p>
          </div>
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-[#8b5cf6]" />
              <span className="text-xs font-semibold text-white">Sectors</span>
            </div>
            <p className="text-xs text-[#777]">Auto-refreshes every 10 minutes while viewing. Client cache (4h) + server cache (15min). Manual refresh bypasses cache.</p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Mail className="h-6 w-6 text-[#5ba3e6]" />
          <h2 className="text-2xl font-bold text-white">Contact</h2>
        </div>
        <p className="text-sm text-[#a0a0a0]">
          Questions, feedback, or bug reports? Reach us at{" "}
          <a href="mailto:support@ewscanner.com" className="text-[#5ba3e6] hover:underline">
            support@ewscanner.com
          </a>
        </p>
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
