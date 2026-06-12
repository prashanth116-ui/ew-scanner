"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  BookOpen,
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Layers,
  Eye,
  Scale,
  AlertTriangle,
  Users,
  Target,
} from "lucide-react";

const SECTIONS = [
  { id: "what-is-rotation", label: "What Is Rotation?" },
  { id: "dashboard-overview", label: "Dashboard" },
  { id: "rrg-chart", label: "RRG Chart" },
  { id: "composite-score", label: "Composite Score" },
  { id: "leading-indicators", label: "Leading Indicators" },
  { id: "cross-sector", label: "Cross-Sector Pairs" },
  { id: "what-is-tracker", label: "Rotation Tracker" },
  { id: "rotation-cards", label: "Rotation Cards" },
  { id: "stock-table", label: "Stock Table" },
  { id: "rs-acceleration", label: "Sector RS" },
  { id: "leading-lagging", label: "Leading vs Lagging" },
  { id: "four-phases", label: "4-Phase Lifecycle" },
  { id: "momentum-quality", label: "Momentum Quality" },
  { id: "turnaround", label: "Turnarounds" },
  { id: "reading-actions", label: "Reading Actions" },
  { id: "timeline", label: "Timeline & Stats" },
  { id: "trading-framework", label: "Trading Framework" },
  { id: "rotation-workflow", label: "Rotation Workflow" },
  { id: "workflow", label: "Top-Down Workflow" },
  { id: "quick-checklist", label: "Trade Checklist" },
  { id: "filter-recipes", label: "Filter Recipes" },
  { id: "limitations", label: "Limitations" },
];

function Section({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
        {icon}
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-[#c0c0c0]">
        {children}
      </div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4">
      <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
      <div className="space-y-2 text-xs leading-relaxed text-[#a0a0a0]">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#5ba3e6]/30 bg-[#5ba3e6]/5 p-3 text-xs text-[#a0c8f0]">
      {children}
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
      {children}
    </div>
  );
}

export default function SectorGuidePage() {
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sidebar TOC */}
      <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:h-fit lg:w-48">
        <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="shrink-0 rounded-full bg-[#262626] px-3 py-1.5 text-xs font-medium text-[#a0a0a0] transition-colors hover:text-white"
            >
              {s.label}
            </button>
          ))}
        </div>
        <nav className="hidden space-y-1 lg:block">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="block w-full rounded-md px-3 py-1.5 text-left text-xs font-medium text-[#a0a0a0] transition-colors hover:bg-[#1a1a1a] hover:text-white"
            >
              {s.label}
            </button>
          ))}
          <div className="mt-4 border-t border-[#2a2a2a] pt-3">
            <Link
              href="/sectors"
              className="block rounded-md px-3 py-1.5 text-xs font-medium text-[#5ba3e6] transition-colors hover:bg-[#1a1a1a]"
            >
              &larr; Back to Dashboard
            </Link>
          </div>
        </nav>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-8 pb-16">
        {/* Header */}
        <section>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-[#5ba3e6]" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  Sector Rotation Guide
                </h1>
                <p className="mt-1 text-[#a0a0a0]">
                  How to read the dashboards, interpret rotation signals, analyze individual stocks, and identify where institutional money is flowing.
                </p>
              </div>
            </div>
            <Link
              href="/sectors"
              className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444] shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            PART 1: SECTOR ROTATION CONCEPTS + DASHBOARD
           ═══════════════════════════════════════════════════════════════ */}

        {/* Section 1: What Is Sector Rotation? */}
        <Section
          id="what-is-rotation"
          title="What Is Sector Rotation?"
          icon={<TrendingUp className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            <strong className="text-white">Sector rotation</strong> is the movement of institutional capital from one
            market sector to another as economic conditions change. When money flows out of defensive sectors (utilities,
            staples) and into growth sectors (tech, semis), it signals increasing risk appetite. The reverse signals
            caution.
          </p>

          <SubSection title="Why It Matters for Trading">
            <p>
              Individual stocks are pulled by sector tides. Even a strong stock will struggle if its sector is in a
              downtrend, and a mediocre stock can outperform if its sector catches a rotation bid. Detecting rotation
              early lets you:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Focus your watchlist on sectors receiving inflows</li>
              <li>Avoid sectors that are weakening, even if individual charts look okay</li>
              <li>Time entries by catching rotation before it becomes consensus</li>
              <li>Identify &quot;stealth accumulation&quot; where smart money is building positions quietly</li>
            </ul>
          </SubSection>

          <SubSection title="The Rotation Cycle">
            <p>
              Sectors tend to rotate in a predictable cycle tied to the economic and market cycle:
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-green-500/10 border border-green-500/20 p-2">
                <div className="font-semibold text-green-400 text-[11px]">LEADING</div>
                <div className="text-[10px] text-green-400/70">Outperforming + gaining momentum</div>
              </div>
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2">
                <div className="font-semibold text-amber-400 text-[11px]">WEAKENING</div>
                <div className="text-[10px] text-amber-400/70">Still outperforming but losing steam</div>
              </div>
              <div className="rounded-md bg-cyan-500/10 border border-cyan-500/20 p-2">
                <div className="font-semibold text-cyan-400 text-[11px]">IMPROVING</div>
                <div className="text-[10px] text-cyan-400/70">Underperforming but gaining momentum</div>
              </div>
              <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2">
                <div className="font-semibold text-red-400 text-[11px]">LAGGING</div>
                <div className="text-[10px] text-red-400/70">Underperforming + losing momentum</div>
              </div>
            </div>
            <p className="mt-2">
              Sectors rotate clockwise: Improving &rarr; Leading &rarr; Weakening &rarr; Lagging &rarr; Improving.
              The best time to enter a sector is during the <strong className="text-cyan-400">Improving</strong> phase,
              before it reaches Leading (consensus).
            </p>
          </SubSection>

          <SubSection title="Tracked Sectors (14)">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Sector</th>
                    <th className="py-1.5 pr-3 text-left font-medium">ETF Proxy</th>
                    <th className="py-1.5 text-left font-medium">Coverage</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Semiconductors</td><td className="py-1.5 pr-3">SMH</td><td className="py-1.5">Chips, foundries, equipment, EDA</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Software &amp; Cloud</td><td className="py-1.5 pr-3">IGV</td><td className="py-1.5">Enterprise SaaS, cybersecurity, dev tools</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Biotech</td><td className="py-1.5 pr-3">XBI</td><td className="py-1.5">Drug discovery, genomics, mRNA</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Health Care</td><td className="py-1.5 pr-3">XLV</td><td className="py-1.5">Pharma, devices, managed care</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Financials</td><td className="py-1.5 pr-3">XLF</td><td className="py-1.5">Banks, insurance, payments, asset mgmt</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Consumer Discretionary</td><td className="py-1.5 pr-3">XLY</td><td className="py-1.5">Retail, autos, homebuilders, travel</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Communication Services</td><td className="py-1.5 pr-3">XLC</td><td className="py-1.5">Media, telecom, social, gaming</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Industrials</td><td className="py-1.5 pr-3">XLI</td><td className="py-1.5">Aerospace, defense, logistics, machinery</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Consumer Staples</td><td className="py-1.5 pr-3">XLP</td><td className="py-1.5">Food, beverages, household, tobacco</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Energy</td><td className="py-1.5 pr-3">XLE</td><td className="py-1.5">Oil, gas, pipelines, oilfield services</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Utilities</td><td className="py-1.5 pr-3">XLU</td><td className="py-1.5">Electric, gas, water, nuclear power</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Real Estate</td><td className="py-1.5 pr-3">XLRE</td><td className="py-1.5">REITs, real estate services</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 font-medium text-white">Materials</td><td className="py-1.5 pr-3">XLB</td><td className="py-1.5">Chemicals, metals, mining, packaging</td></tr>
                  <tr><td className="py-1.5 pr-3 font-medium text-white">Technology</td><td className="py-1.5 pr-3 text-[#5ba3e6]">XLK</td><td className="py-1.5">Broad tech: hardware, IT services, conglomerates</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-[#555]">
              ~1,400 stocks classified across 14 GICS sectors, plus 7 sub-sector ETFs (KRE, XHB, XRT, IYT, ITA, ARKX, UFO) and 5 cross-asset ETFs (GLD, TLT, HYG, EEM, UUP) &mdash; 26 ETFs total.
              Semiconductors and Biotech are split from Technology and Health Care respectively for finer granularity.
            </p>
          </SubSection>
        </Section>

        {/* Section 2: How The Dashboard Works */}
        <Section
          id="dashboard-overview"
          title="How The Dashboard Works"
          icon={<Layers className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>The dashboard has 10 panels, each serving a different purpose:</p>

          <SubSection title="Panel 1: Macro Regime">
            <p>
              Shows the current macro environment regime derived from cross-sector pair ratios and market breadth.
              Regimes include <span className="text-green-400">RISK ON</span>, <span className="text-red-400">RISK OFF</span>,{" "}
              <span className="text-amber-400">INFLATIONARY</span>, and <span className="text-[#888]">MIXED</span>.
              This context frames every other panel &mdash; a sector can be technically strong but fighting a macro headwind.
            </p>
          </SubSection>

          <SubSection title="Panel 2: Rotation Status">
            <p>
              Tells you at a glance whether rotation is active. Two metrics determine this:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-white">Dispersion Index</strong> &mdash; Standard deviation of all sector 20-day returns.
                High dispersion (&gt;4) means sectors are diverging sharply, confirming active rotation.
              </li>
              <li>
                <strong className="text-white">Sector Spread</strong> &mdash; Max minus min 20-day return across all sectors.
                Wide spread (&gt;8%) means extreme divergence between best and worst sectors.
              </li>
            </ul>
            <p className="mt-1">
              Rotation is flagged active when either: dispersion &gt; 4, or dispersion &gt; 2 AND spread &gt; 8%.
              This multi-signal approach avoids false triggers from a single metric.
            </p>
          </SubSection>

          <SubSection title="Panel 3: Sector Scores">
            <p>
              A grid of cards showing each sector&apos;s composite score (0&ndash;100), trend arrow, and RRG quadrant.
              Cards with a <span className="text-cyan-400">cyan border glow</span> have stealth accumulation signals.
              Scores are color-coded: <span className="text-green-400">green</span> &ge;67,{" "}
              <span className="text-amber-400">amber</span> 33&ndash;66, <span className="text-red-400">red</span> &lt;33.
            </p>
            <p className="mt-2">
              <strong className="text-white">Trend arrows</strong> reflect the 20-day price return of the sector ETF:{" "}
              <span className="text-green-400">&uarr;</span> &gt;3%,{" "}
              <span className="text-green-400">&nearr;</span> 1&ndash;3%,{" "}
              <span className="text-[#a0a0a0]">&rarr;</span> &minus;1% to +1%,{" "}
              <span className="text-red-400">&searr;</span> &minus;3% to &minus;1%,{" "}
              <span className="text-red-400">&darr;</span> &lt;&minus;3%.
              These show price <em>trend direction</em>, not acceleration.
            </p>
            <p className="mt-2">
              <strong className="text-white">Unusual Volume</strong> is flagged when a sector ETF&apos;s latest volume exceeds 1.5&times;
              its 20-day average &mdash; often an early signal of institutional rotation into or out of the sector.
            </p>
            <p className="mt-2">
              Sort modes let you rank by composite score, momentum, acceleration, or CMF. A historical comparison
              toolbar lets you compare scores to previous snapshots to spot improving or declining sectors.
            </p>
          </SubSection>

          <SubSection title="Panel 4: RRG &amp; Leading Indicators">
            <p>
              A two-column layout combining the interactive Relative Rotation Graph (see next section for details) with
              leading indicator signals. The RRG scatter plot shows all sectors relative to SPY &mdash; hover any
              dot to see the sector name and composite score.
            </p>
            <p className="mt-2">
              <strong className="text-white">Leading Indicators</strong> lists sectors with divergence signals that
              may predict upcoming rotation: flow/price divergence, breadth divergence, momentum inflection, and
              stealth accumulation (see Leading Indicators section below).
            </p>
          </SubSection>

          <SubSection title="Panel 5: Sub-Sector Leading Indicators">
            <p>
              Four sub-sector ETFs that act as early warning signals for their parent GICS sectors:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">KRE (Regional Banks)</strong> &mdash; Leads Financials (XLF). Regional banks are more rate-sensitive than large banks.</li>
              <li><strong className="text-white">XHB (Homebuilders)</strong> &mdash; Leads Consumer Discretionary (XLY). Housing is one of the most rate-sensitive sectors.</li>
              <li><strong className="text-white">XRT (Retail)</strong> &mdash; Leads Consumer Discretionary (XLY). Consumer spending trends show up here first.</li>
              <li><strong className="text-white">IYT (Transports)</strong> &mdash; Leads Industrials (XLI). Transport stocks often signal economic acceleration or deceleration before broad industrials.</li>
            </ul>
            <p className="mt-2">
              Each sub-sector shows the same composite score, quadrant, and trend arrow as the main sectors. When a sub-sector leads its parent
              into a new quadrant, it&apos;s an early signal that the broader sector may follow.
            </p>
          </SubSection>

          <SubSection title="Panel 6: Cross-Asset Money Flow">
            <p>
              Five non-equity ETFs that reveal whether money is leaving equities entirely &mdash; something the 14 equity sectors alone cannot detect:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">GLD (Gold)</strong> &mdash; Rising = flight to safety or inflation hedge. Especially significant when rising alongside falling equities.</li>
              <li><strong className="text-white">TLT (Treasuries 20Y+)</strong> &mdash; Rising = risk-off bid for safe haven bonds. Falling = rising yields / risk appetite.</li>
              <li><strong className="text-white">HYG (High Yield Corp Bonds)</strong> &mdash; Rising = credit markets healthy, risk appetite strong. Falling = credit stress, risk-off.</li>
              <li><strong className="text-white">EEM (Emerging Markets)</strong> &mdash; Rising = global risk-on, dollar weakening. Falling = capital fleeing to US safe havens.</li>
              <li><strong className="text-white">UUP (US Dollar)</strong> &mdash; Rising = dollar strengthening (headwind for commodities, EM, multinationals). Falling = weaker dollar supports risk assets.</li>
            </ul>
            <p className="mt-2">
              Cross-asset ETFs have no individual stocks &mdash; only ETF-level scoring is shown. Use them to confirm or contradict the regime signal
              and equity sector rotation.
            </p>
          </SubSection>

          <SubSection title="Panel 7: Data Staleness Warning">
            <p>
              An amber warning banner that appears when data is more than 20 minutes old. This panel is hidden when data is fresh.
              Stale data can lead to acting on outdated signals, especially during volatile sessions.
            </p>
          </SubSection>

          <SubSection title="Panel 8: Correlation Matrix">
            <p>
              A heatmap showing 20-day return correlations between all sector ETFs. High correlation clusters reveal
              sectors moving in lockstep (often macro-driven), while low or negative correlation pairs offer
              diversification opportunities. Useful for building balanced sector allocations.
            </p>
          </SubSection>

          <SubSection title="Panel 9: Cross-Sector Pairs">
            <p>Two ratio pairs that reveal the market&apos;s risk appetite (see Cross-Sector Pairs section below).</p>
          </SubSection>

          <SubSection title="Panel 10: Compare Sectors">
            <p>
              A side-by-side comparison tool that lets you select two sectors and compare their raw indicator values
              across all dimensions: momentum, acceleration, RS, CMF, breadth, smart money, and more.
              Useful for deciding between two sectors competing for portfolio allocation.
            </p>
          </SubSection>
        </Section>

        {/* Section 3: Reading The RRG Chart */}
        <Section
          id="rrg-chart"
          title="Reading The RRG Chart"
          icon={<BarChart3 className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            The <strong className="text-white">Relative Rotation Graph (RRG)</strong> was invented by Julius de Kempenaer
            and is used by Bloomberg, StockCharts, and institutional desks worldwide. It plots each sector on two axes
            relative to a benchmark (SPY):
          </p>

          <SubSection title="X-Axis: RS-Ratio">
            <p>
              Measures the <em>level</em> of relative strength. Calculated using the JdK methodology: the raw sector/SPY ratio
              is smoothed with an EMA(10), then normalized to a rolling Z-score, and centered at 100. A value above 100
              means the sector is outperforming SPY on a trend basis.
            </p>
          </SubSection>

          <SubSection title="Y-Axis: RS-Momentum">
            <p>
              Measures the <em>direction</em> of relative strength. It&apos;s the 10-period rate of change (ROC)
              of the RS-Ratio, normalized to a rolling Z-score and centered at 100. Values above 100 mean relative
              strength is accelerating; below 100 means it&apos;s decelerating.
            </p>
          </SubSection>

          <SubSection title="The Four Quadrants">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-green-500" />
                <div>
                  <strong className="text-green-400">Leading</strong> (top-right) &mdash; RS-Ratio &ge; 100, RS-Momentum &ge; 100.
                  Sector is outperforming and gaining momentum. This is the strongest position. Hold winners here.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-amber-500" />
                <div>
                  <strong className="text-amber-400">Weakening</strong> (bottom-right) &mdash; RS-Ratio &ge; 100, RS-Momentum &lt; 100.
                  Still outperforming but losing steam. Early warning to tighten stops or start trimming. The sector is
                  rolling over.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-red-500" />
                <div>
                  <strong className="text-red-400">Lagging</strong> (bottom-left) &mdash; RS-Ratio &lt; 100, RS-Momentum &lt; 100.
                  Underperforming and getting worse. Avoid new positions. Watch for inflection signals.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-cyan-500" />
                <div>
                  <strong className="text-cyan-400">Improving</strong> (top-left) &mdash; RS-Ratio &lt; 100, RS-Momentum &ge; 100.
                  Still underperforming but momentum has turned positive. <strong className="text-white">This is the best
                  entry zone</strong> &mdash; the sector is recovering before the crowd notices.
                </div>
              </div>
            </div>
          </SubSection>

          <Tip>
            Sectors rotate clockwise through the quadrants. The ideal trade: buy in Improving, hold through Leading,
            reduce in Weakening, avoid in Lagging. The rotation from Lagging &rarr; Improving is the highest-conviction
            entry signal.
          </Tip>
        </Section>

        {/* Section 4: Composite Score Breakdown */}
        <Section
          id="composite-score"
          title="Composite Score Breakdown"
          icon={<Scale className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Each sector receives a composite score from 0&ndash;100 blending 6 factors. Weights are dynamically
            redistributed when data is unavailable (e.g., no pre-run scan data for breadth or smart money).
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-[#666]">
                  <th className="py-1.5 pr-3 text-left font-medium">Factor</th>
                  <th className="py-1.5 pr-3 text-left font-medium">Weight</th>
                  <th className="py-1.5 pr-3 text-left font-medium">What It Measures</th>
                  <th className="py-1.5 text-left font-medium">How To Read It</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                <tr className="border-b border-[#2a2a2a]/50">
                  <td className="py-2 pr-3 font-medium text-white">Momentum Composite</td>
                  <td className="py-2 pr-3">25%</td>
                  <td className="py-2 pr-3">IBD-style multi-timeframe: 0.4&times;ROC(63) + 0.2&times;ROC(126) + 0.2&times;ROC(189) + 0.2&times;ROC(252)</td>
                  <td className="py-2">Percentile-ranked across all sectors. High = strong trend over 3&ndash;12 months.</td>
                </tr>
                <tr className="border-b border-[#2a2a2a]/50">
                  <td className="py-2 pr-3 font-medium text-white">Acceleration</td>
                  <td className="py-2 pr-3">15%</td>
                  <td className="py-2 pr-3">2nd derivative: ROC of ROC(20) over 5 bars</td>
                  <td className="py-2">Catches <em>inflection points</em> before the trend itself turns. Positive acceleration with negative price = potential reversal.</td>
                </tr>
                <tr className="border-b border-[#2a2a2a]/50">
                  <td className="py-2 pr-3 font-medium text-white">Mansfield RS</td>
                  <td className="py-2 pr-3">20%</td>
                  <td className="py-2 pr-3">100 &times; (Dorsey RS / SMA(200) &minus; 1), where Dorsey RS = sector/SPY</td>
                  <td className="py-2">Zero-line cross is a classic rotation signal. Above zero = outperforming SPY on a 200-day basis.</td>
                </tr>
                <tr className="border-b border-[#2a2a2a]/50">
                  <td className="py-2 pr-3 font-medium text-white">Chaikin Money Flow</td>
                  <td className="py-2 pr-3">15%</td>
                  <td className="py-2 pr-3">20-day CMF: measures buying/selling pressure using price position within the bar + volume</td>
                  <td className="py-2">Positive = accumulation (buying on upticks). Negative = distribution. Persistent positive CMF + flat price = stealth buying.</td>
                </tr>
                <tr className="border-b border-[#2a2a2a]/50">
                  <td className="py-2 pr-3 font-medium text-white">Breadth</td>
                  <td className="py-2 pr-3">15%</td>
                  <td className="py-2 pr-3">% of sector stocks above their 50-day SMA (batch quotes) or 20-day SMA (pre-run)</td>
                  <td className="py-2">Shows internal health. High breadth + declining ETF = bullish divergence. Uses batch Yahoo quotes for all ~1,400 stocks. Falls back to pre-run data or ETF proxy if quotes unavailable.</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-medium text-white">Smart Money</td>
                  <td className="py-2 pr-3">10%</td>
                  <td className="py-2 pr-3">Composite of insider buys, put/call ratio, unusual volume, earnings beat streaks</td>
                  <td className="py-2">Requires Pre-Run scan data. When unavailable, its weight is redistributed to the other 5 factors.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SubSection title="Data Quality Badge">
            <p>
              When a sector shows <span className="text-amber-400">&quot;75% data&quot;</span> it means only 75% of the
              composite factors have real data. This happens when Pre-Run scan results are unavailable (breadth and smart
              money can&apos;t be calculated). The missing weight is redistributed proportionally to the available factors.
              Scores are still meaningful but less complete.
            </p>
          </SubSection>

          <Tip>
            A sector with a high composite score AND a high data quality percentage is a higher-conviction signal than
            one with a high score but low data quality. Always check the data quality badge before acting on the score.
          </Tip>
        </Section>

        {/* Section 5: Leading Indicators & Stealth Accumulation */}
        <Section
          id="leading-indicators"
          title="Leading Indicators & Stealth Accumulation"
          icon={<Eye className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Three divergence signals can predict rotation <em>before</em> it shows up in price. When 2 or more fire
            simultaneously, the sector is tagged with a <span className="text-cyan-400 font-semibold">STEALTH</span> badge
            &mdash; meaning smart money may be quietly accumulating.
          </p>

          <SubSection title="1. Flow/Price Divergence">
            <p>
              <strong className="text-white">Signal:</strong> CMF positive for 15+ of the last 20 bars AND 20-day price return is negative.
            </p>
            <p>
              <strong className="text-white">What it means:</strong> Money is flowing IN (buying on upticks with volume)
              even though the price is flat or down. Institutions are accumulating before a move higher. This is the
              strongest single divergence signal.
            </p>
          </SubSection>

          <SubSection title="2. Breadth Divergence">
            <p>
              <strong className="text-white">Signal:</strong> More than 50% of sector stocks are above their 50-day SMA AND the sector ETF&apos;s 20-day return is negative.
            </p>
            <p>
              <strong className="text-white">What it means:</strong> The individual stocks are healthier than the ETF
              suggests. The ETF may be dragged down by a few large-cap names while the broader sector is improving.
              Watch for the ETF to catch up to its internals.
            </p>
          </SubSection>

          <SubSection title="3. Acceleration Inflection">
            <p>
              <strong className="text-white">Signal:</strong> Acceleration (2nd derivative of price) is positive AND 20-day return is below +2%.
            </p>
            <p>
              <strong className="text-white">What it means:</strong> The rate of decline is slowing &mdash; the sector is
              decelerating. While price hasn&apos;t turned yet, the physics of the move are changing. This often precedes
              a trend reversal by days or weeks.
            </p>
          </SubSection>

          <Tip>
            The <span className="text-cyan-400 font-semibold">STEALTH</span> badge is the most actionable signal on the
            dashboard. When a sector in the Improving or Lagging quadrant shows stealth accumulation, it&apos;s worth
            investigating the top stocks within that sector for potential entries.
          </Tip>
        </Section>

        {/* Section 6: Cross-Sector Pairs */}
        <Section
          id="cross-sector"
          title="Cross-Sector Pairs"
          icon={<TrendingUp className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Two ETF ratios reveal the market&apos;s overall risk appetite. These are macro signals that provide context
            for individual sector rotation.
          </p>

          <SubSection title="XLY / XLP (Risk Appetite)">
            <p>
              <strong className="text-white">Consumer Discretionary (XLY)</strong> vs{" "}
              <strong className="text-white">Consumer Staples (XLP)</strong>.
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <span className="text-green-400 font-medium">Rising</span> &mdash; Risk-on environment. Money flowing
                into cyclical/growth sectors. Favorable for aggressive positioning.
              </li>
              <li>
                <span className="text-red-400 font-medium">Falling</span> &mdash; Risk-off environment. Money flowing
                into defensive sectors. Reduce exposure, tighten stops.
              </li>
            </ul>
          </SubSection>

          <SubSection title="XLK / XLU (Growth vs Defense)">
            <p>
              <strong className="text-white">Technology (XLK)</strong> vs{" "}
              <strong className="text-white">Utilities (XLU)</strong>.
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <span className="text-green-400 font-medium">Rising</span> &mdash; Growth favored. Tech leadership
                signals confidence in economic expansion and earnings growth.
              </li>
              <li>
                <span className="text-red-400 font-medium">Falling</span> &mdash; Defensive favored. Utilities catching
                a bid signals investors are seeking safety and yield.
              </li>
            </ul>
          </SubSection>

          <Tip>
            When both pairs are rising, it&apos;s a strong risk-on signal &mdash; lean into the sectors in the Leading
            and Improving quadrants. When both are falling, prioritize capital preservation over new entries.
          </Tip>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════
            PART 2: ROTATION TRACKER + STOCK ANALYSIS
           ═══════════════════════════════════════════════════════════════ */}

        {/* Section 7: What Is The Rotation Tracker? */}
        <Section
          id="what-is-tracker"
          title="What Is The Rotation Tracker?"
          icon={<TrendingUp className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            The <strong className="text-white">Rotation Tracker</strong> detects when institutional money starts
            flowing into a sector and tracks how individual stocks within that sector are performing relative to
            the rotation. It answers three questions:
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Which sectors are in active rotation right now?</li>
            <li>Which stocks within those sectors are leading, catching up, or lagging?</li>
            <li>Which lagging stocks are showing early signs of reversal (turnaround candidates)?</li>
          </ul>

          <SubSection title="How Rotation Is Detected">
            <p>A rotation starts when 2 of 3 signals fire simultaneously after being dormant for 5+ days:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">RS Golden Cross</strong> &mdash; 10-day SMA of sector/SPY ratio crosses above 30-day SMA</li>
              <li><strong className="text-white">Volume Surge</strong> &mdash; Daily volume exceeds 1.5x the 20-day average</li>
              <li><strong className="text-white">Price Breakout</strong> &mdash; ETF close above its 50-day SMA</li>
            </ul>
            <p className="mt-2">
              A rotation ends when fewer than 2 signals are true for 3+ consecutive days.
            </p>
          </SubSection>

          <SubSection title="Dashboard Layout">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">Regime Banner</strong> &mdash; Macro environment (risk-on/off, VIX, yields, DXY)</li>
              <li><strong className="text-white">Pair Z-Scores</strong> &mdash; XLY/XLP and XLK/XLU risk appetite gauges</li>
              <li><strong className="text-white">Active Rotation Cards</strong> &mdash; Top 4 active rotations with action signals</li>
              <li><strong className="text-white">Stock Performance Table</strong> &mdash; Expand any card to see individual stocks</li>
              <li><strong className="text-white">Recently Ended</strong> &mdash; Rotations that ended in the last 10 trading days</li>
              <li><strong className="text-white">12-Month Timeline</strong> &mdash; Visual history of all rotation events</li>
              <li><strong className="text-white">Pattern Statistics</strong> &mdash; Historical averages per sector</li>
            </ul>
          </SubSection>
        </Section>

        {/* Section 8: Rotation Cards */}
        <Section
          id="rotation-cards"
          title="Reading The Rotation Cards"
          icon={<Layers className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>Each active rotation card shows multiple layers of information, from top to bottom:</p>

          <SubSection title="Action Signal Banner (Top)">
            <p>The colored banner at the top of each card gives a single actionable recommendation:</p>
            <div className="space-y-1.5 mt-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-400">ENTER</span>
                <span>Early rotation with high conviction &mdash; consider new positions</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-400">ADD ON PULLBACK</span>
                <span>Established trend &mdash; add on dips, don&apos;t chase</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">HOLD &mdash; TIGHTEN STOPS</span>
                <span>Extended or mixed signals &mdash; protect gains, no new entries</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-400">EXIT</span>
                <span>Rotation exhausting or conviction collapsed &mdash; reduce exposure</span>
              </div>
            </div>
          </SubSection>

          <SubSection title="Lifecycle Stage">
            <p>How far along the rotation is based on days active and health signals:</p>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Stage</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Days</th>
                    <th className="py-1.5 text-left font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 text-green-400 font-medium">EARLY</td><td className="py-1.5 pr-3">&le;5d</td><td className="py-1.5">New rotation &mdash; highest potential if conviction is strong</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 text-cyan-400 font-medium">MATURING</td><td className="py-1.5 pr-3">6&ndash;15d</td><td className="py-1.5">Established trend &mdash; add on pullbacks</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 text-amber-400 font-medium">LATE</td><td className="py-1.5 pr-3">16&ndash;30d</td><td className="py-1.5">Extended &mdash; tighten stops, reduce size</td></tr>
                  <tr><td className="py-1.5 pr-3 text-red-400 font-medium">EXHAUSTING</td><td className="py-1.5 pr-3">&gt;30d or fading</td><td className="py-1.5">Momentum dying &mdash; consider exit</td></tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Conviction Score">
            <p>Blends 4 signals into a single confidence level:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">RRG Quadrant</strong> &mdash; Leading = best, Lagging = worst</li>
              <li><strong className="text-white">Acceleration</strong> &mdash; Is momentum speeding up or slowing down?</li>
              <li><strong className="text-white">Chaikin Money Flow</strong> &mdash; Is money flowing in or out?</li>
              <li><strong className="text-white">Signal Trend</strong> &mdash; Are the 3 detection signals improving or declining?</li>
            </ul>
            <p className="mt-2">
              HIGH (&ge;6 pts) = strong conviction. MODERATE (3&ndash;5) = acceptable. LOW (0&ndash;2) = weak. EXIT (&lt;0) = bail out.
            </p>
          </SubSection>

          <Tip>
            Click a rotation card to expand the stock performance table below it. The card&apos;s action signal
            (ENTER, ADD, HOLD, EXIT) applies to the sector overall. The stock table shows you <em>which</em> stocks
            to act on within that sector.
          </Tip>
        </Section>

        {/* Section 9: Stock Performance Table */}
        <Section
          id="stock-table"
          title="Reading The Stock Table"
          icon={<BarChart3 className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            When you expand a rotation card, the stock table shows every stock in that sector ranked by
            performance since the rotation started. Here&apos;s what each column means:
          </p>

          <SubSection title="Column Reference">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Column</th>
                    <th className="py-1.5 text-left font-medium">What It Tells You</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-2 pr-3 font-medium text-white">Action</td><td className="py-2">The recommended action based on the stock&apos;s category + sector lifecycle (see Reading Actions section)</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-2 pr-3 font-medium text-white">% Change</td><td className="py-2">Total return since the rotation start date. This is absolute performance, not relative.</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-2 pr-3 font-medium text-white">vs ETF</td><td className="py-2">Stock return minus sector ETF return. Positive = outperforming the sector. Negative = underperforming.</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-2 pr-3 font-medium text-white">&gt;50MA</td><td className="py-2">Green dot = price above 50-day SMA (uptrend). Red dot = below (downtrend or broken).</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-2 pr-3 font-medium text-white">Vol vs Avg</td><td className="py-2">Today&apos;s volume divided by 10-day average. &ge;1.5x = high interest. &lt;0.8x = no participation.</td></tr>
                  <tr><td className="py-2 pr-3 font-medium text-white">Sector RS</td><td className="py-2">Relative strength acceleration vs sector ETF (5d vs 20d comparison). Positive = stock gaining ground vs sector recently. See dedicated section below.</td></tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Stock Categories">
            <p>Each stock is classified into one of four categories:</p>
            <div className="space-y-1.5 mt-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-400">Leader</span>
                <span>Above sector average performance + above 50MA + volume &ge; 1.0x. The stock riding the rotation hardest.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-400">Catch-up</span>
                <span>Above 50MA but not yet beating the sector average, or below-average volume. Potential to catch up to leaders.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400">Turnaround</span>
                <span>Lagging the sector but showing accelerating relative strength + volume participation. Early reversal signal. See dedicated section below.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-400">Avoid</span>
                <span>Below 50MA with no turnaround signal. The stock is not participating in the rotation.</span>
              </div>
            </div>
          </SubSection>

          <Tip>
            All columns are sortable. Click any column header to sort. Click again to reverse. <strong className="text-white">Sort by
            Sector RS descending</strong> to find stocks that are catching up to the sector ETF fastest right now, regardless
            of their total performance.
          </Tip>
        </Section>

        {/* Section 10: RS Acceleration */}
        <Section
          id="rs-acceleration"
          title="Sector RS (Relative Strength vs Sector ETF)"
          icon={<TrendingUp className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            <strong className="text-white">Sector RS</strong> measures whether a stock is gaining or losing ground
            vs its sector ETF <em>recently</em> compared to the <em>medium term</em>. It&apos;s a second derivative &mdash;
            not how the stock is doing, but whether the rate of relative performance is changing.
            Note: this is different from <strong className="text-white">Trend Accel</strong> on the Sectors dashboard,
            which measures the stock&apos;s own trend acceleration (distance from 50MA minus distance from 200MA).
          </p>

          <SubSection title="The Formula">
            <div className="rounded-md bg-[#0a0a0a] border border-[#333] p-3 font-mono text-[11px] text-[#c0c0c0]">
              Sector RS = (stock_5d_return &minus; etf_5d_return) &minus; (stock_20d_return &minus; etf_20d_return)
            </div>
            <p className="mt-2">
              The first term is the stock&apos;s recent (5-day) outperformance vs the ETF. The second term is the
              medium-term (20-day) outperformance. Subtracting them tells you if the stock is gaining ground
              faster recently than its historical rate.
            </p>
          </SubSection>

          <SubSection title="How To Read the Values">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Sector RS</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Color</th>
                    <th className="py-1.5 text-left font-medium">What It Means</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-mono text-green-400">+3.00 or higher</td>
                    <td className="py-2 pr-3 text-green-400">Green</td>
                    <td className="py-2">Strong catch-up. Stock outperformed ETF by 3%+ more in the last 5 days than over the last 20 days. Rapid relative improvement.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-mono text-green-400">+0.50 to +3.00</td>
                    <td className="py-2 pr-3 text-green-400">Green</td>
                    <td className="py-2">Moderate positive acceleration. Stock is gradually gaining ground vs the sector. If lagging + volume present = turnaround candidate.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-mono text-[#666]">-0.50 to +0.50</td>
                    <td className="py-2 pr-3 text-[#666]">Gray</td>
                    <td className="py-2">Neutral. Stock is performing roughly in line with its recent trend vs the sector. No acceleration or deceleration.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-mono text-red-400">-3.00 to -0.50</td>
                    <td className="py-2 pr-3 text-red-400">Red</td>
                    <td className="py-2">Moderate deceleration. Stock is losing ground vs ETF recently. Could be a leader fading or a post-spike consolidation (see below).</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-mono text-red-400">-3.00 or lower</td>
                    <td className="py-2 pr-3 text-red-400">Red</td>
                    <td className="py-2">Strong deceleration. Stock was far outperforming the ETF over 20 days but that outperformance has stalled or reversed in the last 5 days.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Post-Spike Cooldown (e.g., DDOG Pattern)">
            <p>
              A <strong className="text-white">strongly negative Sector RS on a recent big winner</strong> is normal and does
              not mean the stock is failing. Here&apos;s why:
            </p>
            <p className="mt-2">
              Imagine a stock spikes +30% on earnings 15 days ago, then consolidates flat for the last 5 days.
              The ETF gained +5% over the full 20 days and +1% over the last 5 days:
            </p>
            <div className="mt-2 rounded-md bg-[#0a0a0a] border border-[#333] p-3 font-mono text-[11px] text-[#c0c0c0]">
              <div>20d relative: +30% &minus; 5% = <span className="text-green-400">+25%</span> (massive outperformance)</div>
              <div>5d relative: 0% &minus; 1% = <span className="text-red-400">&minus;1%</span> (slight underperformance)</div>
              <div>Sector RS: (&minus;1) &minus; (+25) = <span className="text-red-400">&minus;26</span></div>
            </div>
            <p className="mt-2">
              The Sector RS is &minus;26 even though the stock is up 30%! This is correct &mdash; the stock <em>is</em> decelerating
              relative to the ETF. It&apos;s just that the &quot;deceleration&quot; is from an extraordinary spike back to normal,
              not from strength to weakness.
            </p>
            <p className="mt-2">
              <strong className="text-white">How to tell the difference:</strong>
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Check the <strong className="text-white">% Change</strong> column. If total return is strongly positive (e.g., +30%),
                negative Sector RS just means post-spike cooldown. The stock is fine.</li>
              <li>Check <strong className="text-white">vs ETF</strong>. If still well above zero, the stock is still outperforming
                on an absolute basis. The negative Sector RS is noise.</li>
              <li>A stock with <strong className="text-white">negative % Change AND negative Sector RS</strong> is genuinely failing &mdash;
                it&apos;s lagging the sector and getting worse. That&apos;s the real warning signal.</li>
            </ul>
          </SubSection>

          <SubSection title="Best Uses for Sector RS">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">Find turnaround candidates</strong> &mdash; Sort Sector RS descending. Stocks at the top
                with negative % Change are reversing their underperformance. These are early entries before the crowd notices.</li>
              <li><strong className="text-white">Spot fading leaders</strong> &mdash; Leaders (green badge) with negative Sector RS are losing
                their edge. They may still be up, but the rate of outperformance is slowing. Consider taking profits.</li>
              <li><strong className="text-white">Ignore post-spike noise</strong> &mdash; If % Change is +15% or higher and Sector RS is
                deeply negative, the stock just had a big move and is consolidating. This is not an exit signal &mdash; consolidation
                after a spike is healthy.</li>
              <li><strong className="text-white">Confirm catch-up plays</strong> &mdash; Catch-up stocks (cyan badge) with positive Sector RS
                are the highest-probability entries &mdash; they&apos;re in an uptrend AND accelerating relative to the sector.</li>
            </ul>
          </SubSection>

          <Warning>
            Sector RS requires at least 21 aligned trading days between the stock and ETF. Stocks with insufficient
            data show <span className="font-mono">0.00</span> and will not qualify as turnaround candidates. Newly
            IPO&apos;d or recently listed stocks may show zero Sector RS.
          </Warning>
        </Section>

        {/* Section 11: Leading vs Lagging */}
        <Section
          id="leading-lagging"
          title="Leading vs Lagging: How to Tell"
          icon={<Scale className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Sector RS tells you <em>direction</em>, but you need to combine it with total performance to understand
            <strong className="text-white"> where a stock sits in the move</strong>. The same Sector RS value means very
            different things depending on context.
          </p>

          <SubSection title="Reading the Combination">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">% Change</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Sector RS</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Arrow</th>
                    <th className="py-1.5 text-left font-medium">What It Means</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 text-green-400">High (+20%+)</td>
                    <td className="py-2 pr-3 text-red-400">Negative</td>
                    <td className="py-2 pr-3 text-red-400">&darr;</td>
                    <td className="py-2"><strong className="text-amber-400">Exhausted leader</strong> &mdash; had its run, now decelerating. Take profits. (e.g., WOLF +234%, RS &minus;125)</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 text-green-400">High (+20%+)</td>
                    <td className="py-2 pr-3 text-green-400">Positive</td>
                    <td className="py-2 pr-3 text-green-400">&uarr;</td>
                    <td className="py-2"><strong className="text-green-400">Accelerating leader</strong> &mdash; still gaining ground. Hold or add on dips.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 text-red-400">Low/Negative</td>
                    <td className="py-2 pr-3 text-green-400">Positive</td>
                    <td className="py-2 pr-3 text-green-400">&uarr;</td>
                    <td className="py-2"><strong className="text-cyan-400">Early catch-up</strong> &mdash; lagging but reversing. Best risk/reward entry zone. (e.g., AEIS &minus;3%, RS +31)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 text-red-400">Low/Negative</td>
                    <td className="py-2 pr-3 text-red-400">Negative</td>
                    <td className="py-2 pr-3 text-red-400">&darr;</td>
                    <td className="py-2"><strong className="text-red-400">Deteriorating laggard</strong> &mdash; underperforming and getting worse. Avoid entirely.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="The Direction Arrow (&uarr; / &darr;)">
            <p>
              Every Sector RS value now shows a <span className="text-green-400">&FilledVerySmallSquare; &uarr;</span> or <span className="text-red-400">&FilledVerySmallSquare; &darr;</span> arrow.
              This shows whether the Sector RS value itself is <strong className="text-white">improving or fading vs 5 days ago</strong> (the RS Delta).
            </p>
            <ul className="list-disc pl-4 space-y-1 mt-2">
              <li><span className="text-green-400 font-mono">&uarr;</span> = RS is accelerating &mdash; the stock is gaining ground faster than it was 5 days ago</li>
              <li><span className="text-red-400 font-mono">&darr;</span> = RS is decelerating &mdash; the stock is losing relative momentum</li>
            </ul>
            <p className="mt-2">
              Hover the arrow to see the exact RS Delta value. Positive delta + positive Sector RS = strongest signal.
              Negative delta on a previously positive RS = early warning that the inflection may be fading.
            </p>
          </SubSection>

          <SubSection title="Real Examples from Semiconductors">
            <p className="font-medium text-white mb-2">Exhausted leaders (move is over):</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1 pr-3 text-left font-medium">Stock</th>
                    <th className="py-1 pr-3 text-right font-medium">Gain</th>
                    <th className="py-1 pr-3 text-right font-medium">Sector RS</th>
                    <th className="py-1 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1 pr-3">MRAM</td><td className="py-1 pr-3 text-right text-green-400">+222%</td><td className="py-1 pr-3 text-right text-red-400">&minus;129</td><td className="py-1">Move exhausted</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1 pr-3">WOLF</td><td className="py-1 pr-3 text-right text-green-400">+234%</td><td className="py-1 pr-3 text-right text-red-400">&minus;125</td><td className="py-1">Move exhausted</td></tr>
                  <tr><td className="py-1 pr-3">MXL</td><td className="py-1 pr-3 text-right text-green-400">+449%</td><td className="py-1 pr-3 text-right text-red-400">&minus;76</td><td className="py-1">Move exhausted</td></tr>
                </tbody>
              </table>
            </div>
            <p className="font-medium text-white mt-3 mb-2">Early catch-ups (next potential movers):</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1 pr-3 text-left font-medium">Stock</th>
                    <th className="py-1 pr-3 text-right font-medium">Gain</th>
                    <th className="py-1 pr-3 text-right font-medium">Sector RS</th>
                    <th className="py-1 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1 pr-3">APH</td><td className="py-1 pr-3 text-right">+9%</td><td className="py-1 pr-3 text-right text-green-400">+31.8</td><td className="py-1">Accelerating now</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1 pr-3">AEIS</td><td className="py-1 pr-3 text-right text-red-400">&minus;3%</td><td className="py-1 pr-3 text-right text-green-400">+31.2</td><td className="py-1">Accelerating from bottom</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1 pr-3">CAMT</td><td className="py-1 pr-3 text-right">+7%</td><td className="py-1 pr-3 text-right text-green-400">+29.9</td><td className="py-1">Inflecting</td></tr>
                  <tr><td className="py-1 pr-3">AMKR</td><td className="py-1 pr-3 text-right text-green-400">+52%</td><td className="py-1 pr-3 text-right text-green-400">+20.7</td><td className="py-1">Mid-move, still accelerating</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2">
              The stocks in the second table are what MXL and WOLF looked like <em>before</em> their 200&ndash;400% runs. The key:
              look at the <strong className="text-white">bottom</strong> of the performance list with <strong className="text-green-400">positive Sector RS</strong>, not the top.
            </p>
          </SubSection>

          <Tip>
            The core insight: <strong className="text-white">% Change is backward-looking. Sector RS is forward-looking.</strong> It tells
            you which stocks are changing direction relative to the sector right now. Sort by Sector RS descending to find them.
          </Tip>
        </Section>

        {/* Section 12: 4-Phase Stock Lifecycle */}
        <Section
          id="four-phases"
          title="4-Phase Stock Lifecycle"
          icon={<Layers className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Every stock in a rotation moves through four phases. The <strong className="text-white">Phase badge</strong> on each
            row tells you where a stock is. Your job is to act on P1&ndash;P2 signals rather than waiting for P3 confirmation
            when 50&ndash;100% of the move is already done.
          </p>

          <SubSection title="Phase Progression">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Phase</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Signals</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Action</th>
                    <th className="py-1.5 text-left font-medium">Risk/Reward</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3"><span className="text-purple-400 font-medium">P1 Basing</span></td>
                    <td className="py-2 pr-3">Below 50MA, RS negative but Sector RS turning positive, volume rising toward 1.0x</td>
                    <td className="py-2 pr-3">Watch &mdash; add to watchlist, too early to act</td>
                    <td className="py-2">Highest reward if it works, but low probability. Wait for P2 confirmation.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3"><span className="text-amber-400 font-medium">P2 Turnaround</span></td>
                    <td className="py-2 pr-3">Below 50MA, RS 20d flips positive, volume &ge;1.2x, positive Sector RS</td>
                    <td className="py-2 pr-3"><strong className="text-white">Best entry zone</strong> &mdash; the turnaround is confirmed</td>
                    <td className="py-2">Best risk/reward. This is where MXL/WOLF would have been flagged before their 200&ndash;400% runs.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3"><span className="text-green-400 font-medium">P3 Trending</span></td>
                    <td className="py-2 pr-3">Above 50MA, RS still positive, volume sustained</td>
                    <td className="py-2 pr-3">Hold or add on dips &mdash; trail with stops</td>
                    <td className="py-2">Safest but 50&ndash;100% of the move may already be done. Good for adds, not initiation.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><span className="text-red-400 font-medium">P4 Exhausting</span></td>
                    <td className="py-2 pr-3">Sector RS deeply negative (like WOLF at &minus;125), momentum dying</td>
                    <td className="py-2 pr-3">Exit &mdash; take profits, do not enter</td>
                    <td className="py-2">The move is over. This is where you take profits, not where you start positions.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Separating Real Moves from Fakeouts">
            <p>Stocks that pop and drop share these traits:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">Low volume on the move</strong> &mdash; Vol vs Avg stays below 1.0x. No institutional participation. Compare COHR (0.7x, +49%) vs GFS (3.7x, +85%). Volume confirms conviction.</li>
              <li><strong className="text-white">No RS follow-through</strong> &mdash; Sector RS spikes for one scan then fades. Check if RS is sustained across multiple days, not a one-day blip. The <span className="text-green-400">&uarr;</span> arrow confirms follow-through.</li>
              <li><strong className="text-white">Low volume consistency</strong> &mdash; Volume on only 1&ndash;2 of the last 5 days means a spike, not sustained institutional interest. Look for 3+ days (Vol Consistency &ge; 3 in CSV export).</li>
            </ul>
          </SubSection>

          <SubSection title="Practical Screening for Early Entries">
            <p>To catch the next MXL/WOLF early, filter for:</p>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Criteria</th>
                    <th className="py-1.5 text-left font-medium">Why</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 text-white">Sector RS &gt; +10</td><td className="py-1.5">Momentum is inflecting hard</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 text-white">Vol vs Avg &ge; 1.2x</td><td className="py-1.5">Institutional buying confirmed</td></tr>
                  <tr className="border-b border-[#2a2a2a]/50"><td className="py-1.5 pr-3 text-white">Below 50MA</td><td className="py-1.5">Turnaround setup, not chasing</td></tr>
                  <tr><td className="py-1.5 pr-3 text-white">RS 20d turning positive</td><td className="py-1.5">Momentum confirmation</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2">
              Stocks with high Sector RS but low volume (e.g., 0.6x) are less trustworthy &mdash; momentum without institutional
              conviction often fades. <strong className="text-white">Volume confirms direction.</strong>
            </p>
          </SubSection>

          <Warning>
            Phase badges update with each data refresh. A stock can move from P1 to P2 (entry trigger) or from P3 to P4 (exit trigger)
            between scans. Don&apos;t set-and-forget &mdash; check phase transitions regularly.
          </Warning>
        </Section>

        {/* Section 13: Momentum Quality Filter */}
        <Section
          id="momentum-quality"
          title="Momentum Quality Filter"
          icon={<Eye className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            The <strong className="text-white">Quality</strong> dropdown (between Volume and Phase) separates
            <strong className="text-white"> sustained institutional movers</strong> from one-day spikes. It uses two signals
            not visible in the table columns: <strong className="text-white">RS Delta</strong> (is Sector RS itself improving?)
            and <strong className="text-white">Volume Consistency</strong> (volume above average on how many of the last 5 days?).
          </p>

          <SubSection title="Filter Options">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Option</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Criteria</th>
                    <th className="py-1.5 text-left font-medium">Use Case</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">RS Improving</td>
                    <td className="py-2 pr-3">RS Delta &gt; 0 (Sector RS trending upward)</td>
                    <td className="py-2">Catches inflection points &mdash; RS turning less negative or more positive</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">High Quality</td>
                    <td className="py-2 pr-3">RS improving + volume on 3+ of last 5 days + not crashing today (&gt;&minus;3%)</td>
                    <td className="py-2">Real sustained movers with institutional participation, not one-day spikes</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-white">Fading</td>
                    <td className="py-2 pr-3">RS declining + Sector RS negative</td>
                    <td className="py-2">Actively deteriorating &mdash; build your avoid/trim list</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Entry Quality Dots">
            <p>
              The dots next to the Phase badge (on P1 Basing and P2 Turnaround stocks) show entry quality on a 0&ndash;3 scale:
            </p>
            <ul className="list-disc pl-4 space-y-1 mt-2">
              <li><strong className="text-white">Dot 1:</strong> Sector RS &gt; 1 &mdash; meaningful relative strength acceleration</li>
              <li><strong className="text-white">Dot 2:</strong> Volume &ge; 1.5x average &mdash; strong institutional participation today</li>
              <li><strong className="text-white">Dot 3:</strong> RS improving + volume consistent on 3+ of last 5 days &mdash; <strong className="text-white">sustained</strong> momentum, not a one-day spike</li>
            </ul>
            <p className="mt-2">
              Three dots = strongest entry signal. Prioritize 3-dot stocks over 1-dot stocks within the same phase.
            </p>
          </SubSection>

          <SubSection title="RS Delta &amp; Volume Consistency (Under the Hood)">
            <p>
              These values are visible in the CSV export and as tooltips, but not as separate table columns:
            </p>
            <ul className="list-disc pl-4 space-y-1 mt-2">
              <li><strong className="text-white">RS Delta</strong> (hover the &uarr;/&darr; arrow): Sector RS today minus Sector RS 5 days ago. Positive = RS is accelerating. Negative = RS is decelerating.</li>
              <li><strong className="text-white">Vol Consistency</strong> (in CSV): 0&ndash;5 scale. How many of the last 5 trading days had volume above the 10-day average. &ge;3 means sustained institutional activity.</li>
            </ul>
          </SubSection>

          <SubSection title="Recommended Workflow">
            <ol className="list-decimal pl-4 space-y-2">
              <li>Set <strong className="text-white">Quality &rarr; High Quality</strong> to see only sustained movers</li>
              <li>Combine with <strong className="text-white">Phase &rarr; P2 Turnaround</strong> to find early entries with real momentum</li>
              <li>Sort by <strong className="text-white">Trend Accel descending</strong> to rank by strength</li>
              <li>Check the <span className="text-green-400">&uarr;</span>/<span className="text-red-400">&darr;</span> arrows &mdash; prioritize <span className="text-green-400">&uarr;</span></li>
              <li>Use <strong className="text-white">Quality &rarr; Fading</strong> to build your avoid/trim list</li>
              <li>Export via CSV for the full dataset including RS Delta and Vol Consistency</li>
            </ol>
          </SubSection>

          <SubSection title="Updated Filter Recipes">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Goal</th>
                    <th className="py-1.5 text-left font-medium">Filters</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-amber-400">Best entries</td>
                    <td className="py-2">Phase: P2 Turnaround + Quality: High Quality + Trend Accel: Positive</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-green-400">Momentum leaders</td>
                    <td className="py-2">Phase: P3 Trending + RS 20d: Positive + Volume: Above Avg</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-red-400">Avoid list</td>
                    <td className="py-2">Quality: Fading</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-purple-400">Early watchlist</td>
                    <td className="py-2">Phase: P1 Basing + Sector RS: Positive (contrarian &mdash; wait for P2 to enter)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <Tip>
            <strong className="text-white">The SNOW lesson:</strong> SNOW had Trend Accel +27.98 (strong) but Sector RS &minus;11.3 (lagging sector).
            When they diverge, <strong className="text-white">trust Trend Accel for direction</strong> and use Sector RS for relative positioning.
            Positive Trend Accel + negative Sector RS = coiled catch-up, not breakdown.
          </Tip>
        </Section>

        {/* Section 14: Turnaround Candidates */}
        <Section
          id="turnaround"
          title="Turnaround Candidates"
          icon={<Eye className="h-5 w-5 text-purple-400" />}
        >
          <p>
            The <span className="text-purple-400 font-semibold">Turnaround</span> category identifies stocks
            that are currently lagging their sector but showing early signs of reversal. These are deep-value
            plays &mdash; stocks the market has left behind that are starting to catch up.
          </p>

          <SubSection title="Qualification Criteria (All Must Be True)">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Criteria</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Threshold</th>
                    <th className="py-1.5 text-left font-medium">Why</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">Below sector average</td>
                    <td className="py-2 pr-3">% Change &lt; sector avg</td>
                    <td className="py-2">Must be a genuine laggard. Leaders and catch-ups don&apos;t need turnaround classification.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">Positive Sector RS</td>
                    <td className="py-2 pr-3">Sector RS &gt; +0.50</td>
                    <td className="py-2">The stock must be catching up at a meaningful rate, not just fluctuating. 0.50 filters noise.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-white">Volume participation</td>
                    <td className="py-2 pr-3">Vol vs Avg &ge; 0.80x</td>
                    <td className="py-2">There must be real trading interest behind the reversal. Low-volume bounces are unreliable.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Turnaround Actions by Lifecycle">
            <div className="space-y-1.5 mt-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400">Speculative Buy</span>
                <span>Sector is EARLY or MATURING. The rotation has legs and the stock is reversing early &mdash; highest conviction turnaround setup.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400/70">Risky</span>
                <span>Sector is LATE or EXHAUSTING. The stock may be turning but the sector rotation is fading &mdash; higher risk.</span>
              </div>
            </div>
          </SubSection>

          <SubSection title="How Turnaround Differs from Avoid">
            <p>
              Previously, all stocks below the 50-day SMA were categorized as &quot;Avoid&quot; with no distinction.
              Turnaround candidates are a carve-out from Avoid &mdash; they&apos;re still below average, but the
              Sector RS shows they&apos;re improving at an accelerating rate. Think of it as:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-red-400">Avoid</strong> = lagging AND getting worse (or no improvement signal)</li>
              <li><strong className="text-purple-400">Turnaround</strong> = lagging BUT catching up with volume support</li>
            </ul>
            <p className="mt-2">
              Note that turnaround candidates can be below their 50MA &mdash; the Sector RS gives a leading signal
              <em> before</em> the stock crosses above the 50MA. By the time a stock is above the 50MA and beating the
              sector average, it would be reclassified as Catch-up or Leader.
            </p>
          </SubSection>

          <SubSection title="Example: The Deep-Value Semi Play">
            <p>
              A semiconductor stock sits at $18, down 15% while the sector ETF (SMH) is up 8% during the rotation.
              It&apos;s below its 50MA and would normally be classified as &quot;Avoid.&quot; But:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>5-day return: +6% vs ETF +1% &rarr; 5d relative = +5%</li>
              <li>20-day return: &minus;15% vs ETF +8% &rarr; 20d relative = &minus;23%</li>
              <li>Sector RS = (+5) &minus; (&minus;23) = <span className="text-green-400 font-mono">+28.00</span></li>
              <li>Volume: 1.2x average (real participation)</li>
            </ul>
            <p className="mt-2">
              Sector RS of +28 means the stock swung from &minus;23% underperformance over 20 days to +5% outperformance
              over 5 days. Massive acceleration. Combined with volume, this is a strong turnaround signal &mdash; the stock
              has reversed and institutional money is showing up. It gets the purple
              <span className="text-purple-400 font-semibold"> Speculative Buy</span> badge.
            </p>
          </SubSection>

          <Tip>
            Turnaround candidates in <strong className="text-white">EARLY or MATURING</strong> sectors are the
            highest-conviction setups. The sector has fresh rotation momentum, and the lagging stock is catching
            up while others have already moved. These are the &quot;second wave&quot; entries that can deliver
            outsized returns because they&apos;re buying underperformance that is actively reversing.
          </Tip>
        </Section>

        {/* Section 15: Reading Actions */}
        <Section
          id="reading-actions"
          title="Reading Stock Actions"
          icon={<Scale className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            The <strong className="text-white">Action</strong> column combines the stock&apos;s category with the
            sector&apos;s lifecycle stage to produce a specific recommendation. Here&apos;s the full matrix:
          </p>

          <SubSection title="Action Matrix">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Category</th>
                    <th className="py-1.5 pr-3 text-left font-medium">EARLY / MATURING</th>
                    <th className="py-1.5 pr-3 text-left font-medium">LATE</th>
                    <th className="py-1.5 text-left font-medium">EXHAUSTING</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-green-400">Leader</td>
                    <td className="py-2 pr-3"><span className="text-green-400">Hold</span> &mdash; hold and let it run</td>
                    <td className="py-2 pr-3"><span className="text-amber-400">Trim</span> &mdash; lock in gains</td>
                    <td className="py-2"><span className="text-red-400">Exit</span> &mdash; rotation fading</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-cyan-400">Catch-up</td>
                    <td className="py-2 pr-3"><span className="text-cyan-400">Buy</span> &mdash; fresh entry</td>
                    <td className="py-2 pr-3"><span className="text-[#888]">Watch</span> &mdash; wait for clarity</td>
                    <td className="py-2"><span className="text-red-400">Avoid</span> &mdash; too late</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-purple-400">Turnaround</td>
                    <td className="py-2 pr-3"><span className="text-purple-400">Speculative Buy</span> &mdash; highest priority turnaround</td>
                    <td className="py-2 pr-3" colSpan={2}><span className="text-purple-400/70">Risky</span> &mdash; sector fading, higher risk</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-red-400">Avoid</td>
                    <td className="py-2 pr-3"><span className="text-red-400">Avoid</span></td>
                    <td className="py-2 pr-3"><span className="text-red-400">Avoid</span></td>
                    <td className="py-2"><span className="text-red-400">Exit</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Sort Order">
            <p>When sorted by Action, stocks appear in this priority order (highest conviction first):</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li><span className="text-purple-400">Speculative Buy</span> / <span className="text-cyan-400">Buy</span> (sort order 0) &mdash; best new entry opportunities</li>
              <li><span className="text-green-400">Hold</span> (sort order 1) &mdash; hold existing positions</li>
              <li><span className="text-amber-400">Trim</span> (sort order 2) &mdash; consider trimming</li>
              <li><span className="text-[#888]">Watch</span> / <span className="text-purple-400/70">Risky</span> (sort order 3) &mdash; wait and see</li>
              <li><span className="text-red-400">Avoid</span> (sort order 4) &mdash; no position</li>
              <li><span className="text-red-400">Exit</span> (sort order 5) &mdash; close position</li>
            </ol>
          </SubSection>

          <SubSection title="Strategy Summary Bar">
            <p>
              Above the stock table, the summary bar shows aggregated counts: how many Leaders, Buy candidates,
              Turnarounds, and Avoids are in the sector. Use this for a quick read on sector participation quality &mdash;
              a rotation with 8 Leaders and 2 Avoids is healthier than one with 3 Leaders and 7 Avoids.
            </p>
          </SubSection>
        </Section>

        {/* Section 16: Timeline & Stats */}
        <Section
          id="timeline"
          title="Timeline & Pattern Statistics"
          icon={<BarChart3 className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <SubSection title="12-Month Timeline">
            <p>
              The horizontal timeline shows all rotation events for each sector ETF over the past year. Green bars
              are positive-return rotations, red bars are negative. The opacity increases with the magnitude of the return.
              Pulsing dots indicate currently active rotations.
            </p>
            <p className="mt-2">
              Use the timeline to see which sectors rotate frequently (many bars) vs rarely (few bars), and whether
              past rotations in a sector tended to be profitable.
            </p>
          </SubSection>

          <SubSection title="Pattern Statistics Table">
            <p>Aggregated metrics for each sector&apos;s rotation history:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">Rotations (1y)</strong> &mdash; How many times the sector triggered rotation signals</li>
              <li><strong className="text-white">Avg Duration</strong> &mdash; Typical length of a rotation in this sector</li>
              <li><strong className="text-white">Avg Perf</strong> &mdash; Average ETF return during rotations</li>
              <li><strong className="text-white">Best / Worst</strong> &mdash; Range of historical outcomes</li>
            </ul>
            <p className="mt-2">
              Sectors with many short rotations and negative average performance are &quot;choppy&quot; &mdash; rotation signals
              in these sectors are less reliable. Sectors with fewer, longer rotations and consistently positive returns are
              higher quality rotation targets.
            </p>
          </SubSection>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════
            PART 3: WORKFLOWS + RECIPES
           ═══════════════════════════════════════════════════════════════ */}

        {/* Section 17: Trading Framework */}
        <Section
          id="trading-framework"
          title="Trading Framework"
          icon={<Scale className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Use the composite score, acceleration, and RRG quadrant together to decide <strong className="text-white">what to trade</strong>,{" "}
            <strong className="text-white">what to watch</strong>, and <strong className="text-white">what to avoid</strong>.
          </p>

          <SubSection title="Action Matrix by Quadrant">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Quadrant</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Action</th>
                    <th className="py-1.5 text-left font-medium">Why</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-green-400">LEADING</td>
                    <td className="py-2 pr-3 text-green-400">Trade (if score &ge; 60)</td>
                    <td className="py-2">Momentum + relative strength confirmed. Actively trade when composite &ge; 60 and acceleration &gt; 0. If composite is below 60, <em>watch</em> rather than trade &mdash; relative strength alone isn&apos;t enough.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-cyan-400">IMPROVING</td>
                    <td className="py-2 pr-3 text-cyan-400">Build (if accelerating)</td>
                    <td className="py-2">Best risk/reward entry zone when acceleration is positive. Start small, add as it moves toward Leading. If acceleration is flat or negative, <em>watch</em> and wait for confirmation.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-amber-400">WEAKENING</td>
                    <td className="py-2 pr-3 text-amber-400">Tighten stops, trim</td>
                    <td className="py-2">Still outperforming but losing steam. Do not open new positions. Tighten trailing stops on existing holdings. Money is starting to leave.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-red-400">LAGGING</td>
                    <td className="py-2 pr-3 text-red-400">Avoid (watch if turning)</td>
                    <td className="py-2">Underperforming and getting worse. No new longs. Exception: if acceleration turns positive and composite &ge; 40, it&apos;s worth watching for a Lagging &rarr; Improving transition.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Minimum Thresholds for New Positions">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Signal</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Trade</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Watch</th>
                    <th className="py-1.5 text-left font-medium">Avoid</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">Composite Score</td>
                    <td className="py-2 pr-3 text-green-400">&ge; 60</td>
                    <td className="py-2 pr-3 text-amber-400">40 &ndash; 59</td>
                    <td className="py-2 text-red-400">&lt; 40</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">Acceleration</td>
                    <td className="py-2 pr-3 text-green-400">&gt; 0 (positive)</td>
                    <td className="py-2 pr-3 text-amber-400">&minus;20 to 0</td>
                    <td className="py-2 text-red-400">&lt; &minus;20</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">Mansfield RS</td>
                    <td className="py-2 pr-3 text-green-400">&gt; 0 (above SPY)</td>
                    <td className="py-2 pr-3 text-amber-400">&minus;5 to 0</td>
                    <td className="py-2 text-red-400">&lt; &minus;5</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-white">Quadrant</td>
                    <td className="py-2 pr-3 text-green-400">LEADING / IMPROVING</td>
                    <td className="py-2 pr-3 text-amber-400">WEAKENING</td>
                    <td className="py-2 text-red-400">LAGGING</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2">
              <strong className="text-white">Ideal setup:</strong> Composite &ge; 60 AND acceleration &gt; 0 AND quadrant is LEADING or IMPROVING.
              Meeting all three = highest conviction. Meeting two of three = acceptable with tighter risk management.
            </p>
          </SubSection>

          <SubSection title="Stock Selection Within a Sector">
            <p>Once you identify a tradeable sector, pick the strongest individual stocks:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-white">RS Leaders</strong> &mdash; In the sector detail accordion, stocks with the highest
                positive RS (% above 50d SMA) are outperforming their peers. These lead the sector move.
              </li>
              <li>
                <strong className="text-white">Pre-Run Score &ge; 15</strong> &mdash; Stocks with high EW Scanner scores have strong
                technical setups (base patterns, volume, institutional accumulation).
              </li>
              <li>
                <strong className="text-white">Insider Buying</strong> &mdash; Stocks with insider buys in the last 90 days confirm
                smart money conviction at the company level.
              </li>
              <li>
                <strong className="text-white">Avoid RS Laggards</strong> &mdash; Even in a strong sector, stocks with deeply negative RS
                are dragging. A rising tide lifts most boats, but not the ones with holes.
              </li>
            </ul>
          </SubSection>

          <SubSection title="Examples">
            <div className="space-y-3">
              <div className="rounded-md bg-green-500/10 border border-green-500/20 p-3">
                <div className="font-semibold text-green-400 text-[11px] mb-1">TRADE: Semiconductors (SMH)</div>
                <div className="text-[10px] text-green-400/70">
                  Composite 80, Acceleration +88, Mansfield RS +33, Quadrant LEADING.
                  All thresholds exceeded. This is the strongest sector &mdash; buy leaders like AMD, NVDA, AVGO on pullbacks.
                </div>
              </div>
              <div className="rounded-md bg-cyan-500/10 border border-cyan-500/20 p-3">
                <div className="font-semibold text-cyan-400 text-[11px] mb-1">EARLY ENTRY: Software &amp; Cloud (IGV)</div>
                <div className="text-[10px] text-cyan-400/70">
                  Composite 33, Acceleration +831, Quadrant IMPROVING. Score is low but acceleration is extremely high &mdash;
                  the sector is inflecting hard. Start small positions in the strongest names. This is a recovery play, not a momentum trade.
                </div>
              </div>
              <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3">
                <div className="font-semibold text-red-400 text-[11px] mb-1">AVOID: Health Care (XLV)</div>
                <div className="text-[10px] text-red-400/70">
                  Composite 22, Acceleration &minus;172, Mansfield RS &minus;8, Quadrant LAGGING.
                  All signals negative. No new positions until acceleration turns positive and the sector starts moving toward Improving.
                </div>
              </div>
            </div>
          </SubSection>

          <Tip>
            The simplest rule: <strong className="text-white">trade the LEADING sector, build positions in the IMPROVING sector,
            and stay away from everything in LAGGING</strong>. Acceleration is your early warning &mdash; when it flips positive
            in a LAGGING sector, that&apos;s your signal to start watching for the Lagging &rarr; Improving transition.
          </Tip>
        </Section>

        {/* Section 18: Rotation Workflow */}
        <Section
          id="rotation-workflow"
          title="Rotation Workflow"
          icon={<TrendingUp className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            A step-by-step system for catching sector rotation early and turning it into trades.
            This workflow connects the Sectors dashboard to the Pre-Run, EW, and Confluence scanners.
          </p>

          <SubSection title="The Rotation Playbook">
            <p className="mb-2">Five steps from sector signal to trade entry:</p>
            <ol className="list-decimal pl-4 space-y-2">
              <li>
                <strong className="text-white">Check the Sectors page</strong> &mdash; Find sectors in the{" "}
                <span className="text-cyan-400">IMPROVING</span> quadrant. These are turning before the crowd notices.
              </li>
              <li>
                <strong className="text-white">Confirm the inflection</strong> &mdash; Look for: acceleration &gt; 0,
                Mansfield RS rising (even if still negative), and a{" "}
                <span className="text-cyan-400 font-semibold">STEALTH</span> accumulation badge.
                Two of three confirms the turn is real.
              </li>
              <li>
                <strong className="text-white">Run the Pre-Run scanner filtered to that sector</strong> &mdash;
                Focus on PRIORITY and KEEP stocks. These have the strongest fundamental + technical setups within
                the rotating sector.
              </li>
              <li>
                <strong className="text-white">Cross-check the EW scanner</strong> &mdash; Stocks in Wave 2 or Wave 4
                positions offer the best risk/reward entries. A sector rotation + corrective wave = high-conviction setup.
              </li>
              <li>
                <strong className="text-white">Use the Confluence &quot;Rotation Opportunities&quot; preset</strong> &mdash;
                This preset auto-filters to IMPROVING sectors with heavy sector weighting. The intersection of all four
                scanners gives you the highest-probability candidates.
              </li>
            </ol>
          </SubSection>

          <SubSection title="When to Enter">
            <p className="mb-2">Three entry stages with different risk/reward profiles:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Stage</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Signal</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Risk/Reward</th>
                    <th className="py-1.5 text-left font-medium">Conviction</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-amber-400">Earliest</td>
                    <td className="py-2 pr-3">Acceleration flips positive while sector is still in <span className="text-red-400">LAGGING</span></td>
                    <td className="py-2 pr-3 text-green-400">Highest R/R</td>
                    <td className="py-2 text-red-400">Lowest &mdash; sector hasn&apos;t turned yet</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-cyan-400">Confirmed</td>
                    <td className="py-2 pr-3">Sector enters <span className="text-cyan-400">IMPROVING</span> + stealth accumulation badge</td>
                    <td className="py-2 pr-3 text-green-400">Sweet spot</td>
                    <td className="py-2 text-green-400">High &mdash; multiple signals confirming</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-green-400">Momentum</td>
                    <td className="py-2 pr-3"><span className="text-cyan-400">IMPROVING</span> &rarr; <span className="text-green-400">LEADING</span> transition</td>
                    <td className="py-2 pr-3 text-amber-400">Lower upside</td>
                    <td className="py-2 text-green-400">Highest &mdash; trend confirmed by all</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Position Sizing by Conviction">
            <p className="mb-2">Scale position size based on how many scanners confirm the setup:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Scanner Passes</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Sector Quadrant</th>
                    <th className="py-1.5 text-left font-medium">Position Size</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 text-green-400 font-medium">4/4 scanners pass</td>
                    <td className="py-2 pr-3"><span className="text-cyan-400">IMPROVING</span> or <span className="text-green-400">LEADING</span></td>
                    <td className="py-2 text-green-400 font-medium">Full position</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 text-amber-400 font-medium">3/4 scanners pass</td>
                    <td className="py-2 pr-3"><span className="text-cyan-400">IMPROVING</span></td>
                    <td className="py-2 text-amber-400 font-medium">Half position</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 text-red-400 font-medium">2/4 scanners pass</td>
                    <td className="py-2 pr-3">Just entering <span className="text-cyan-400">IMPROVING</span></td>
                    <td className="py-2 text-red-400 font-medium">Quarter position (speculative)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2">
              Stocks in <span className="text-red-400">LAGGING</span> or <span className="text-amber-400">WEAKENING</span> sectors
              should not receive new positions regardless of individual scanner scores.
            </p>
          </SubSection>

          <SubSection title="Example Walkthrough: Semiconductors">
            <div className="space-y-2">
              <div className="rounded-md bg-cyan-500/10 border border-cyan-500/20 p-2">
                <div className="font-semibold text-cyan-400 text-[11px]">Step 1: Sector Signal</div>
                <div className="text-[10px] text-cyan-400/70">
                  Semiconductors (SMH) enters IMPROVING quadrant. Acceleration: +88. Stealth accumulation: YES.
                  The sector was beaten down but money flow is positive and breadth is diverging.
                </div>
              </div>
              <div className="rounded-md bg-green-500/10 border border-green-500/20 p-2">
                <div className="font-semibold text-green-400 text-[11px]">Step 2: Pre-Run Filter</div>
                <div className="text-[10px] text-green-400/70">
                  Run Pre-Run scanner &rarr; filter to Semiconductors. Find AMD (PRIORITY, score 18),
                  AVGO (KEEP, score 15), QCOM (KEEP, score 14). These are the sector leaders with the
                  strongest technical setups.
                </div>
              </div>
              <div className="rounded-md bg-[#5ba3e6]/10 border border-[#5ba3e6]/20 p-2">
                <div className="font-semibold text-[#5ba3e6] text-[11px]">Step 3: EW Cross-Check</div>
                <div className="text-[10px] text-[#5ba3e6]/70">
                  EW scanner shows AMD in Wave 2 position with deep fib retracement &mdash; ideal risk/reward
                  entry. AVGO in Wave 4 &mdash; shallower pullback, higher confidence. Both confirm corrective
                  wave + sector rotation alignment.
                </div>
              </div>
              <div className="rounded-md bg-[#ec4899]/10 border border-[#ec4899]/20 p-2">
                <div className="font-semibold text-[#ec4899] text-[11px]">Step 4: Confluence Confirmation</div>
                <div className="text-[10px] text-[#ec4899]/70">
                  Run Confluence scanner with &quot;Rotation Opportunities&quot; preset. AMD shows 4/4 passes,
                  AVGO 3/4. Both flagged as STRONG signal. Enter full position in AMD, half in AVGO.
                </div>
              </div>
            </div>
          </SubSection>

          <SubSection title="Setting Up Alerts">
            <p>
              The system sends a daily Telegram alert when sectors change quadrants. This runs automatically
              after market close and only sends a message when there is a transition to report.
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-white">Rotation Starting</strong> (<span className="text-red-400">LAGGING</span> &rarr;{" "}
                <span className="text-cyan-400">IMPROVING</span>) &mdash; Most actionable. A new sector is entering the
                sweet spot. Start your Rotation Playbook immediately.
              </li>
              <li>
                <strong className="text-white">Breakout Confirmed</strong> (<span className="text-cyan-400">IMPROVING</span> &rarr;{" "}
                <span className="text-green-400">LEADING</span>) &mdash; Sector has fully turned. Add to existing
                positions or enter with higher conviction.
              </li>
              <li>
                <strong className="text-white">Momentum Fading</strong> (<span className="text-green-400">LEADING</span> &rarr;{" "}
                <span className="text-amber-400">WEAKENING</span>) &mdash; Early warning. Tighten stops on holdings
                in this sector. Do not add new positions.
              </li>
              <li>
                <strong className="text-white">Rotation Out</strong> (<span className="text-amber-400">WEAKENING</span> &rarr;{" "}
                <span className="text-red-400">LAGGING</span>) &mdash; Exit signal. Close remaining positions.
                The sector has completed its rotation cycle.
              </li>
            </ul>
          </SubSection>

          <Tip>
            The Rotation Playbook works best in environments with active rotation (high dispersion index on the
            dashboard). When dispersion is low and all sectors move together, sector selection matters less &mdash;
            focus on individual stock quality instead.
          </Tip>
        </Section>

        {/* Section 19: Top-Down Workflow */}
        <Section
          id="workflow"
          title="Top-Down Workflow"
          icon={<Users className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Work from macro context down to individual stocks. Each step narrows your focus so you only spend time
            on the highest-conviction setups.
          </p>

          <SubSection title="Step 1: Regime Check (Top Banner)">
            <p>
              Start at the <strong className="text-white">Regime Banner</strong> at the top of the page. This sets the context for everything below:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-green-400">RISK ON</strong> &mdash; Broad participation likely. Turnaround setups have the best odds. Favor aggressive entries.</li>
              <li><strong className="text-red-400">RISK OFF</strong> (VIX &gt; 25) &mdash; Be defensive. Favor leaders in favored sectors only. Skip turnaround plays.</li>
              <li><strong className="text-amber-400">MIXED / INFLATIONARY</strong> &mdash; Be selective. Only act on HIGH conviction sectors with regime alignment.</li>
            </ul>
            <p className="mt-2">
              Note the <strong className="text-white">Favored</strong> and <strong className="text-white">Avoid</strong> sectors &mdash;
              these tell you which sectors have macro tailwinds or headwinds.
            </p>
          </SubSection>

          <SubSection title="Step 2: Scan Active Rotation Cards">
            <p>
              Read the <strong className="text-white">action signal banners</strong> on each card. Focus your time on:
            </p>
            <div className="space-y-1.5 mt-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-400">ENTER</span>
                <span>Highest priority &mdash; early rotation with strong conviction and regime support</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-400">ADD ON PULLBACK</span>
                <span>Second priority &mdash; established trend, good for adding on dips</span>
              </div>
            </div>
            <p className="mt-2">
              Skip HOLD and EXIT sectors for new entries &mdash; only check those if you already have positions.
              Cards with a <span className="text-green-400">Regime Aligned</span> badge have macro support behind them.
            </p>
          </SubSection>

          <SubSection title="Step 3: Expand Sector &rarr; Spot Turnarounds">
            <p>
              Click a card to expand the stock table. <strong className="text-white">Turnaround setups are highlighted automatically</strong> with
              an amber left border and <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">Turnaround</span> badge.
              No filtering needed &mdash; they&apos;re visible while scrolling the full table.
            </p>
            <p className="mt-2">
              A turnaround highlight means all three criteria are met:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">Below 50MA</strong> &mdash; not yet in uptrend (early)</li>
              <li><strong className="text-white">Positive Sector RS</strong> &mdash; relative strength improving vs sector</li>
              <li><strong className="text-white">Volume &ge; 1.2x average</strong> &mdash; confirms institutional participation (Rotation Tracker uses a lower 0.8x gate for initial detection)</li>
            </ul>
          </SubSection>

          <SubSection title="Step 4: Use Filters for Specific Screens">
            <p>
              The filter bar has action chips, 50MA, Sector RS, and Volume dropdowns. Use these combos for targeted screening:
            </p>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Goal</th>
                    <th className="py-1.5 text-left font-medium">Filter Combination</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-amber-400">Turnaround candidates</td>
                    <td className="py-2">Below 50MA + Positive Sector RS + Above Avg volume (matches amber highlights exactly)</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-green-400">Strongest leaders</td>
                    <td className="py-2">Hold/Buy chips + Above 50MA + Above Avg volume</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-red-400">Fading stocks to avoid</td>
                    <td className="py-2">Above 50MA + Negative Sector RS (momentum dying despite uptrend)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-cyan-400">Undiscovered catch-ups</td>
                    <td className="py-2">Buy chip + Below Avg volume (hasn&apos;t been discovered yet &mdash; early)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Step 5: Cross-Reference with Regime">
            <p>
              A turnaround candidate in a <span className="text-green-400">Regime Aligned</span> sector has higher conviction
              than one fighting a headwind. Check whether the expanded sector&apos;s card shows the alignment badge.
            </p>
            <p className="mt-2">
              Sort by <strong className="text-white">Sector RS descending</strong> within highlighted turnaround rows to rank
              them by momentum strength &mdash; the highest Sector RS values are reversing fastest.
            </p>
          </SubSection>

          <SubSection title="Step 6: Validate with Pattern Stats">
            <p>
              Scroll to <strong className="text-white">Pattern Statistics</strong> to check the sector&apos;s historical rotation quality:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">Avg Duration</strong> &mdash; compare to current days active. If past average, the rotation may be aging.</li>
              <li><strong className="text-white">Avg Perf</strong> &mdash; sectors with consistently positive avg returns are higher quality targets.</li>
              <li><strong className="text-white">Rotations (1y)</strong> &mdash; frequent short rotations = choppy, less reliable. Fewer long rotations = higher quality.</li>
            </ul>
          </SubSection>

          <SubSection title="Interpreting Big Sector RS Numbers">
            <p>Sector RS values outside &plusmn;5 deserve extra attention:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-green-400">Sector RS &gt; +5</strong> with negative % Change = strong turnaround signal.
                The stock is reversing hard and fast from a deep underperformance.</li>
              <li><strong className="text-green-400">Sector RS &gt; +5</strong> with positive % Change = momentum acceleration.
                Already outperforming and gaining more ground. Strong leader getting stronger.</li>
              <li><strong className="text-red-400">Sector RS &lt; &minus;5</strong> with positive % Change = post-spike cooldown.
                Check if there was a recent earnings gap or catalyst. Usually not a sell signal, just consolidation.</li>
              <li><strong className="text-red-400">Sector RS &lt; &minus;5</strong> with negative % Change = deteriorating laggard.
                The worst combination. Stock is underperforming and getting worse. Avoid.</li>
            </ul>
          </SubSection>

          <Tip>
            The highest-conviction setup: an <strong className="text-green-400">ENTER</strong> sector with
            <strong className="text-white"> Regime Aligned</strong> badge, containing amber-highlighted turnaround rows with
            <strong className="text-green-400"> Sector RS &gt; +2</strong>. This means fresh rotation + macro tailwind + lagging stock
            reversing with institutional volume. Cross-check on the Pre-Run scanner for additional confirmation.
          </Tip>
        </Section>

        {/* Quick Trade Checklist */}
        <Section
          id="quick-checklist"
          title="Quick Trade Checklist"
          icon={<Target className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Use these checklists to validate entries before committing capital.
            The <Link href="/sectors/picks" className="text-[#5ba3e6] hover:underline">Entry Signals panel</Link> on
            the Stock Picks page already applies the sector-level gates automatically &mdash; this guide explains
            the reasoning behind each check.
          </p>

          <SubSection title="Swing Trade Entry (2&ndash;15 Day Hold)">
            <p className="mb-2 font-medium text-white">Rotation Tracker checks:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Action signal = <strong className="text-green-400">ENTER</strong> or <strong className="text-cyan-400">ADD ON PULLBACK</strong></li>
              <li>Lifecycle stage = <strong className="text-white">EARLY</strong> or <strong className="text-white">MATURING</strong></li>
              <li>Conviction = <strong className="text-white">HIGH</strong> or <strong className="text-white">MODERATE</strong></li>
              <li>Regime alignment = <strong className="text-green-400">Aligned</strong> or <strong className="text-white">Neutral</strong> (never enter on headwind)</li>
            </ul>

            <p className="mt-3 mb-2 font-medium text-white">Entry Signals panel gates (all must pass):</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Action signal = <strong className="text-green-400">ENTER</strong> or <strong className="text-cyan-400">ADD ON PULLBACK</strong> (derived from lifecycle + conviction + regime)</li>
              <li>CMF &gt; 0 (institutional money flowing in)</li>
              <li>Acceleration &gt; 0 (momentum building, not fading)</li>
              <li>At least 1 stock with conviction = <strong className="text-green-400">HIGH</strong> or <strong className="text-cyan-400">MEDIUM</strong> + category = <strong className="text-white">LEADER</strong> or <strong className="text-purple-400">TURNAROUND</strong></li>
            </ul>
            <p className="mt-2 text-[10px] text-[#666]">
              Sector quadrant (LEADING/IMPROVING) is not a direct gate but influences the rotation conviction score.
              A LEADING quadrant adds +3 to conviction; IMPROVING adds +2.
            </p>

            <p className="mt-3 mb-2 font-medium text-white">Stock-level checks:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Price above 50-day SMA (confirmed uptrend)</li>
              <li>RS Acceleration positive (gaining vs sector ETF)</li>
              <li>Volume ratio &ge; 1.0x (institutional participation)</li>
              <li>Institutional ownership &gt; 30% (structural quality gate &mdash; stocks below 30% are filtered out as low-liquidity)</li>
            </ul>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Metric</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Green (Go)</th>
                    <th className="py-1.5 text-left font-medium">Red (No-Go)</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-3 font-medium text-white">CMF (20d)</td>
                    <td className="py-1.5 pr-3 text-green-400">&gt; +0.05</td>
                    <td className="py-1.5 text-red-400">&lt; 0</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-3 font-medium text-white">Acceleration</td>
                    <td className="py-1.5 pr-3 text-green-400">&gt; +0.5</td>
                    <td className="py-1.5 text-red-400">&lt; 0</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-3 font-medium text-white">Rotation Age</td>
                    <td className="py-1.5 pr-3 text-green-400">&le; 15 days</td>
                    <td className="py-1.5 text-red-400">&gt; 30 days</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 font-medium text-white">Conviction Score</td>
                    <td className="py-1.5 pr-3 text-green-400">&ge; 6 (HIGH)</td>
                    <td className="py-1.5 text-red-400">&lt; 0 (EXIT)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Day Trade Entry (Intraday)">
            <p className="mb-2 font-medium text-white">Pre-market (before 9:30 AM ET):</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Check <Link href="/rotation" className="text-[#5ba3e6] hover:underline">Rotation Tracker</Link> for active ENTER or ADD ON PULLBACK sectors</li>
              <li>Note which sectors have <strong className="text-green-400">HIGH</strong> conviction and <strong className="text-green-400">Regime Aligned</strong></li>
              <li>Identify 2&ndash;3 LEADER stocks from those sectors as your watchlist</li>
            </ul>

            <p className="mt-3 mb-2 font-medium text-white">Intraday execution:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Trade LEADERs from the Entry Signals panel &mdash; these have passed all gates</li>
              <li>Use the sector ETF as confirmation: if ETF is green, bias long on sector stocks</li>
              <li>Prefer stocks with positive RS Acceleration (catching up = momentum)</li>
            </ul>

            <p className="mt-3 mb-2 font-medium text-white">Position sizing guide:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-green-400">ENTER + HIGH conviction</strong> = full size</li>
              <li><strong className="text-cyan-400">ADD ON PULLBACK + MODERATE conviction</strong> = half size</li>
              <li>Anything else = skip or paper trade only</li>
            </ul>
          </SubSection>

          <Warning>
            <strong>Kill signals &mdash; exit or do not enter if any of these are true:</strong>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              <li>CMF negative (money flowing out)</li>
              <li>Acceleration negative (momentum fading)</li>
              <li>Regime = headwind (macro working against sector)</li>
              <li>Rotation age &gt; 30 days (exhausting)</li>
              <li>Conviction = EXIT (multiple bearish signals)</li>
            </ul>
          </Warning>

          <Tip>
            The <Link href="/sectors/picks" className="text-[#5ba3e6] hover:underline">Entry Signals panel</Link> on
            the Stock Picks page already applies all sector-level gates (CMF+, Accel+, conviction, regime).
            If a sector appears there, it has passed the checklist. Use this guide to understand <em>why</em> a
            sector qualifies and to apply stock-level checks before placing trades.
          </Tip>
        </Section>

        {/* Section 20: Filter Recipes */}
        <Section
          id="filter-recipes"
          title="Filter Recipes: Using All 3 Metrics Together"
          icon={<Eye className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            The stock table has three relative strength metrics side by side. Each measures something different.
            The strongest picks have <strong className="text-white">all three agreeing</strong>.
          </p>

          <SubSection title="The Three Metrics">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Metric</th>
                    <th className="py-1.5 pr-3 text-left font-medium">What It Measures</th>
                    <th className="py-1.5 text-left font-medium">Green Flag</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">RS 20d</td>
                    <td className="py-2 pr-3">20-day relative strength vs the broad market</td>
                    <td className="py-2 text-green-400">Positive = outperforming market</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-white">Trend Accel</td>
                    <td className="py-2 pr-3">Stock&apos;s own trend acceleration (% from 50MA minus % from 200MA)</td>
                    <td className="py-2 text-green-400">Positive = short-term trend gaining on long-term</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-white">Sector RS</td>
                    <td className="py-2 pr-3">Relative strength acceleration vs sector ETF (5d vs 20d)</td>
                    <td className="py-2 text-green-400">Positive = catching up vs sector recently</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Recipe 1: Best Entries (All 3 Positive)">
            <p>
              Set all three filters to <strong className="text-white">Positive</strong> plus Phase: <strong className="text-white">P2 Turnaround</strong>.
              This surfaces stocks with strong individual momentum, gaining vs market AND gaining vs sector, in the entry zone (below 50MA turning up).
              Highest-conviction new entries.
            </p>
          </SubSection>

          <SubSection title="Recipe 2: Momentum Leaders">
            <p>
              Phase: <strong className="text-white">P3 Trending</strong> + RS 20d: <strong className="text-white">Positive</strong> + Volume: <strong className="text-white">Above Avg</strong>.
              These are stocks already in uptrend with market-beating strength and institutional volume. Good for adding on pullbacks.
            </p>
          </SubSection>

          <SubSection title="Recipe 3: Catch-Up Catalyst (The SNOW Pattern)">
            <p>
              Trend Accel: <strong className="text-white">Positive</strong> + Sector RS: <strong className="text-white">Negative</strong> + check the Earnings column for <span className="text-red-400">red</span> or <span className="text-amber-400">amber</span> (&le;14 days).
            </p>
            <p className="mt-2">
              This combination identifies stocks with <strong className="text-white">strong individual momentum that are temporarily lagging their sector</strong>, with an upcoming earnings catalyst.
              The positive Trend Accel confirms the stock&apos;s own trend is accelerating &mdash; it&apos;s not broken.
              The negative Sector RS means it hasn&apos;t moved yet relative to peers &mdash; it&apos;s coiled.
              Earnings is the trigger that can close the gap.
            </p>
            <p className="mt-2">
              <strong className="text-white">Example:</strong> Before earnings, SNOW had Trend Accel <span className="text-green-400">+27.98</span> (powerful internal momentum) but Sector RS <span className="text-red-400">&minus;11.3</span> (lagging its sector ETF recently).
              The Sector RS looked bearish in isolation, but the strong Trend Accel correctly signaled the stock had momentum.
              SNOW jumped 75 points after earnings &mdash; the catalyst unlocked the gap between individual strength and sector-relative weakness.
            </p>
            <p className="mt-2">
              <strong className="text-white">Key distinction:</strong> If Trend Accel is also negative, the stock is genuinely weak &mdash; avoid.
              Positive Trend Accel + negative Sector RS = catch-up setup, not breakdown. The stock has the momentum; it just hasn&apos;t expressed it vs peers yet.
            </p>
            <Warning>
              Earnings are binary events. Size down (half position or use options) when holding through earnings.
              The pattern identifies <em>direction</em>, not <em>magnitude</em> &mdash; the stock can move the right way but still gap less than expected.
            </Warning>
          </SubSection>

          <SubSection title="Recipe 4: Avoid List">
            <p>
              Phase: <strong className="text-white">P4 Exhausting</strong> + Trend Accel: <strong className="text-white">Negative</strong>.
              Both the stock&apos;s own trend and its sector-relative momentum are fading. No reason to be involved.
            </p>
          </SubSection>

          <SubSection title="Recipe 5: Early Watch (Contrarian)">
            <p>
              Phase: <strong className="text-white">P1 Basing</strong> + Sector RS: <strong className="text-white">Positive</strong>.
              The stock is below 50MA with negative RS (hence P1 Basing), but its Sector RS is turning positive &mdash; it&apos;s starting to gain ground vs the sector ETF.
              Too early to buy, but add to watchlist. If it transitions to P2 Turnaround (volume confirms), that&apos;s the entry.
            </p>
          </SubSection>

          <SubSection title="Cross-Page Confirmation">
            <p>
              The same three metrics appear on both the <Link href="/rotation" className="text-[#5ba3e6] hover:underline">Rotation Tracker</Link> and the <Link href="/sectors/picks" className="text-[#5ba3e6] hover:underline">Stock Picks</Link> page.
              A stock that appears as a strong pick on <strong className="text-white">both pages</strong> &mdash; positive on all 3 metrics,
              in an active rotation, within a leading or improving sector &mdash; is the highest-conviction setup.
            </p>
          </SubSection>

          <Tip>
            When Trend Accel and Sector RS diverge, <strong className="text-white">trust Trend Accel for direction</strong>.
            It measures the stock&apos;s own momentum (more directional for individual moves). Use Sector RS for relative positioning
            within a sector trade &mdash; it tells you if the stock is keeping up with peers, not whether it will go up or down.
          </Tip>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════
            PART 4: LIMITATIONS
           ═══════════════════════════════════════════════════════════════ */}

        {/* Section 21: Combined Limitations */}
        <Section
          id="limitations"
          title="Data Quality & Limitations"
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
        >
          <p>
            These tools provide a quantitative framework for sector analysis and stock selection, but have important
            limitations you should understand:
          </p>

          <SubSection title="Dashboard Data Sources">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-white">ETF price data</strong> comes from Yahoo Finance (1-year daily OHLCV).
                Free API, occasionally delayed or missing bars.
              </li>
              <li>
                <strong className="text-white">Stock-level data</strong> (breadth, smart money) comes from the Pre-Run
                scanner. If you haven&apos;t run a scan recently, these factors will be missing and weight will be
                redistributed.
              </li>
              <li>
                <strong className="text-white">Data freshness</strong> is shown in the header badge. Green = fresh
                (&lt;20 min), amber = aging (20&ndash;60 min), red = stale (&gt;60 min). An inline staleness warning also appears when data exceeds 20 minutes.
              </li>
            </ul>
          </SubSection>

          <SubSection title="Dashboard Limitations">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-white">ETF proxy imprecision</strong> &mdash; Each sector uses one ETF proxy (e.g.,
                SMH for Semiconductors, IGV for Software). The ETF composition may not perfectly match the stocks classified
                in that sector.
              </li>
              <li>
                <strong className="text-white">Breadth data sources</strong> &mdash; Breadth uses a 3-tier cascade:
                (1) batch quotes from Yahoo Finance (price vs 50d SMA for all ~1,400 stocks &mdash; best quality),
                (2) Pre-Run scan data (price vs 20d SMA &mdash; good quality, limited to scanned stocks),
                (3) ETF proxy (ETF close vs its own 20d SMA &mdash; rough estimate). Tier 1 is used by default
                when the API returns stock quote data.
              </li>
              <li>
                <strong className="text-white">Composite weights are not backtested</strong> &mdash; The 25/15/20/15/15/10
                weighting is based on financial theory and practitioner consensus, not optimized to historical returns.
                The data quality field helps you assess how much of the composite is based on real vs. assumed data.
              </li>
              <li>
                <strong className="text-white">Rotation is a slow signal</strong> &mdash; Sector rotation plays out over
                weeks to months. This is not a day-trading tool. Use it to inform your sector bias, not for intraday
                entries.
              </li>
              <li>
                <strong className="text-white">No forward-looking guarantee</strong> &mdash; All indicators are based on
                historical data. A sector in Improving can reverse back to Lagging. Always use stops and manage risk.
              </li>
            </ul>
          </SubSection>

          <SubSection title="Sector RS Limitations">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-white">Post-spike distortion</strong> &mdash; Stocks that gapped up on earnings or
                a catalyst will show strongly negative Sector RS for ~15 trading days as the 20-day window slides past the
                spike. This is mathematically correct but does not indicate weakness. Always check % Change alongside Sector RS.
              </li>
              <li>
                <strong className="text-white">Minimum data requirement</strong> &mdash; Needs 21 aligned trading days between
                stock and ETF. New IPOs, recently listed stocks, or stocks with trading halts may show 0.00.
              </li>
              <li>
                <strong className="text-white">5d/20d windows are fixed</strong> &mdash; Sector RS uses 5-day and 20-day lookbacks.
                A stock that reversed 6 days ago may not yet show positive Sector RS if the first day of reversal was the 6th day
                back. The signal lags by a few days.
              </li>
            </ul>
          </SubSection>

          <SubSection title="Turnaround Limitations">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-white">Not all turnarounds succeed</strong> &mdash; A stock can meet all three criteria
                (lagging + Sector RS + volume) and still fail. The turnaround flag is a screening signal, not a trade signal.
                Always do additional analysis before entering.
              </li>
              <li>
                <strong className="text-white">Sector lifecycle matters</strong> &mdash; Speculative Buy in an EARLY sector
                is much higher quality than Speculative in an EXHAUSTING sector. The sector provides the tailwind; without it,
                the stock has to do all the work alone.
              </li>
              <li>
                <strong className="text-white">Volume threshold is lenient</strong> &mdash; The 0.8x minimum volume allows
                stocks with slightly below-average volume. For highest conviction, prefer turnaround candidates with
                Vol vs Avg &ge; 1.2x.
              </li>
            </ul>
          </SubSection>

          <SubSection title="General Limitations">
            <ul className="list-disc pl-4 space-y-1">
              <li>Rotation detection uses a 3-signal composite on daily data. Intraday rotations are not captured.</li>
              <li>Stock data comes from Yahoo Finance (6-month daily bars). Occasional data gaps or delays may occur.</li>
              <li>Data is cached for up to 4 hours on the client and 10 minutes on the server (with 5-minute CDN cache + stale-while-revalidate). Check the freshness badge in the header.</li>
              <li>The tracker shows the top 4 active rotations. Less prominent rotations may not appear.</li>
            </ul>
          </SubSection>

          <SubSection title="Best Practices">
            <ul className="list-disc pl-4 space-y-1">
              <li>Run a Pre-Run scan before checking sectors to get the full composite (breadth + smart money data).</li>
              <li>Focus on sectors in the <span className="text-cyan-400">Improving</span> quadrant with stealth accumulation signals.</li>
              <li>Use cross-sector pairs to confirm the macro environment supports your sector thesis.</li>
              <li>Check data quality badges &mdash; treat low-quality scores as directional, not precise.</li>
              <li>Combine sector rotation with individual stock analysis (Pre-Run scores, EW patterns, squeeze setups).</li>
            </ul>
          </SubSection>
        </Section>
      </div>
    </div>
  );
}
