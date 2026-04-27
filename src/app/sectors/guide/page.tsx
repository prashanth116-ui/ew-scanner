"use client";

import { useCallback, useState } from "react";
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
} from "lucide-react";

const SECTIONS = [
  { id: "what-is-rotation", label: "What Is It?" },
  { id: "dashboard-overview", label: "Dashboard" },
  { id: "rrg-chart", label: "RRG Chart" },
  { id: "composite-score", label: "Composite Score" },
  { id: "leading-indicators", label: "Leading Indicators" },
  { id: "trading-framework", label: "Trading Framework" },
  { id: "cross-sector", label: "Cross-Sector Pairs" },
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

export default function SectorGuidePage() {
  const [, setTick] = useState(0);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTick((t) => t + 1);
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
                  How to read the dashboard, interpret signals, and identify where institutional money is flowing.
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

          <SubSection title="Tracked Sectors (13 GICS-Based)">
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
                  <tr><td className="py-1.5 pr-3 font-medium text-white">Materials</td><td className="py-1.5 pr-3">XLB</td><td className="py-1.5">Chemicals, metals, mining, packaging</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-[#555]">
              ~684 stocks classified across 13 GICS-based sectors. Each sector has a 1:1 ETF proxy.
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
          <p>The dashboard has 6 panels, each serving a different purpose:</p>

          <SubSection title="Panel 1: Rotation Status Banner">
            <p>
              The top banner tells you at a glance whether rotation is active. Two metrics determine this:
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

          <SubSection title="Panel 2: Sector Heatmap">
            <p>
              A grid of cards showing each sector&apos;s composite score (0&ndash;100), trend arrow, and RRG quadrant.
              Cards with a <span className="text-cyan-400">cyan border glow</span> have stealth accumulation signals.
              Scores are color-coded: <span className="text-green-400">green</span> &ge;67,{" "}
              <span className="text-amber-400">amber</span> 33&ndash;66, <span className="text-red-400">red</span> &lt;33.
            </p>
          </SubSection>

          <SubSection title="Panel 3: RRG Chart">
            <p>
              An interactive scatter plot showing all sectors relative to SPY (see next section for details). Hover any
              dot to see the sector name and composite score.
            </p>
          </SubSection>

          <SubSection title="Panel 4: Leading Indicators + Stocks to Watch">
            <p>
              <strong className="text-white">Leading Indicators</strong> lists sectors with divergence signals that
              may predict upcoming rotation (see Leading Indicators section below).
            </p>
            <p>
              <strong className="text-white">Stocks to Watch</strong> shows the top-ranked stocks within sectors that
              are improving or showing stealth accumulation, scored by pre-run score, insider buys, and options flow.
              This panel requires a Pre-Run scan to have been run first.
            </p>
          </SubSection>

          <SubSection title="Panel 5: Sector Details">
            <p>
              Expandable accordion for each sector showing all raw indicator values: momentum, acceleration, Mansfield RS,
              CMF, OBV, breadth, volume, insider buys, P/C ratio, earnings beats, smart money score, and RS-Ratio/Momentum.
              Also shows leading and lagging stocks within the sector ranked by 20-day relative strength.
            </p>
          </SubSection>

          <SubSection title="Panel 6: Cross-Sector Pairs">
            <p>Two ratio pairs that reveal the market&apos;s risk appetite (see Cross-Sector Pairs section below).</p>
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
              Measures the <em>level</em> of relative strength. Calculated as SMA(10) of the sector/SPY ratio divided by
              SMA(30) of the same ratio, multiplied by 100. A value above 100 means the sector is outperforming SPY
              on a trend basis.
            </p>
          </SubSection>

          <SubSection title="Y-Axis: RS-Momentum">
            <p>
              Measures the <em>direction</em> of relative strength. It&apos;s the daily change in RS-Ratio. Positive means
              relative strength is improving (sector gaining ground vs SPY). Negative means it&apos;s deteriorating.
            </p>
          </SubSection>

          <SubSection title="The Four Quadrants">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-green-500" />
                <div>
                  <strong className="text-green-400">Leading</strong> (top-right) &mdash; RS-Ratio &ge; 100, Momentum &ge; 0.
                  Sector is outperforming and gaining momentum. This is the strongest position. Hold winners here.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-amber-500" />
                <div>
                  <strong className="text-amber-400">Weakening</strong> (bottom-right) &mdash; RS-Ratio &ge; 100, Momentum &lt; 0.
                  Still outperforming but losing steam. Early warning to tighten stops or start trimming. The sector is
                  rolling over.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-red-500" />
                <div>
                  <strong className="text-red-400">Lagging</strong> (bottom-left) &mdash; RS-Ratio &lt; 100, Momentum &lt; 0.
                  Underperforming and getting worse. Avoid new positions. Watch for inflection signals.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-cyan-500" />
                <div>
                  <strong className="text-cyan-400">Improving</strong> (top-left) &mdash; RS-Ratio &lt; 100, Momentum &ge; 0.
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
                  <td className="py-2">Shows internal health. High breadth + declining ETF = bullish divergence. Uses batch Yahoo quotes for all ~684 stocks. Falls back to pre-run data or ETF proxy if quotes unavailable.</td>
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
              <strong className="text-white">Signal:</strong> More than 50% of sector stocks are above their 20-day SMA AND the sector ETF&apos;s 20-day return is negative.
            </p>
            <p>
              <strong className="text-white">What it means:</strong> The individual stocks are healthier than the ETF
              suggests. The ETF may be dragged down by a few large-cap names while the broader sector is improving.
              Watch for the ETF to catch up to its internals.
            </p>
          </SubSection>

          <SubSection title="3. Acceleration Inflection">
            <p>
              <strong className="text-white">Signal:</strong> Acceleration (2nd derivative of price) is positive AND 20-day return is still negative.
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

        {/* Section 6: Trading Framework */}
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
                    <td className="py-2 pr-3 text-green-400">Actively trade</td>
                    <td className="py-2">Momentum + relative strength confirmed. These are the highest-probability setups. Ride winners, add on pullbacks to support.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-cyan-400">IMPROVING</td>
                    <td className="py-2 pr-3 text-cyan-400">Build positions early</td>
                    <td className="py-2">Best risk/reward entry zone. Sector is turning before consensus. Start small, add as it moves toward Leading. Look for stealth accumulation signals.</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-amber-400">WEAKENING</td>
                    <td className="py-2 pr-3 text-amber-400">Tighten stops, trim</td>
                    <td className="py-2">Still outperforming but losing steam. Do not open new positions. Tighten trailing stops on existing holdings. Money is starting to leave.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-red-400">LAGGING</td>
                    <td className="py-2 pr-3 text-red-400">Avoid entirely</td>
                    <td className="py-2">Underperforming and getting worse. No new longs. Only revisit when acceleration turns positive (watch for Lagging &rarr; Improving transition).</td>
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

        {/* Section 7: Cross-Sector Pairs (was 6) */}
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

        {/* Section 7: Data Quality & Limitations */}
        <Section
          id="limitations"
          title="Data Quality & Limitations"
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
        >
          <p>
            This tool provides a quantitative framework for sector analysis, but has important limitations you should
            understand:
          </p>

          <SubSection title="Data Sources">
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
                (&lt;6 hours), amber = aging (6&ndash;24 hours), red = stale (&gt;24 hours).
              </li>
            </ul>
          </SubSection>

          <SubSection title="Known Limitations">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-white">ETF proxy imprecision</strong> &mdash; Each sector uses one ETF proxy (e.g.,
                SMH for Semiconductors, IGV for Software). The ETF composition may not perfectly match the stocks classified
                in that sector.
              </li>
              <li>
                <strong className="text-white">Breadth data sources</strong> &mdash; Breadth uses a 3-tier cascade:
                (1) batch quotes from Yahoo Finance (price vs 50d SMA for all ~684 stocks — best quality),
                (2) Pre-Run scan data (price vs 20d SMA — good quality, limited to scanned stocks),
                (3) ETF proxy (ETF close vs its own 20d SMA — rough estimate). Tier 1 is used by default
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
