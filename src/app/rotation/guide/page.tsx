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
  Users,
} from "lucide-react";

const SECTIONS = [
  { id: "what-is-it", label: "What Is It?" },
  { id: "rotation-cards", label: "Rotation Cards" },
  { id: "stock-table", label: "Stock Table" },
  { id: "rs-acceleration", label: "Sector RS" },
  { id: "turnaround", label: "Turnaround Candidates" },
  { id: "reading-actions", label: "Reading Actions" },
  { id: "timeline", label: "Timeline & Stats" },
  { id: "workflow", label: "Top-Down Workflow" },
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

export default function RotationGuidePage() {
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
              href="/rotation"
              className="block rounded-md px-3 py-1.5 text-xs font-medium text-[#5ba3e6] transition-colors hover:bg-[#1a1a1a]"
            >
              &larr; Back to Tracker
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
                  Rotation Tracker Guide
                </h1>
                <p className="mt-1 text-[#a0a0a0]">
                  How to read rotation cards, interpret stock performance, and use Sector RS to find turnaround candidates.
                </p>
              </div>
            </div>
            <Link
              href="/rotation"
              className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444] shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Tracker
            </Link>
          </div>
        </section>

        {/* Section 1: What Is The Rotation Tracker? */}
        <Section
          id="what-is-it"
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

        {/* Section 2: Rotation Cards */}
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

        {/* Section 3: Stock Performance Table */}
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

        {/* Section 4: RS Acceleration */}
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

        {/* Section 5: Turnaround Candidates */}
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

        {/* Section 6: Reading Actions */}
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

        {/* Section 7: Timeline & Stats */}
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

        {/* Section 8: Workflow */}
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
              <li><strong className="text-white">Volume &ge; 1.2x average</strong> &mdash; institutional interest confirmed</li>
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

        {/* Section 9: Filter Recipes */}
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
              The same three metrics appear on both the <Link href="/rotation" className="text-[#5ba3e6] hover:underline">Rotation Tracker</Link> and the <Link href="/sectors" className="text-[#5ba3e6] hover:underline">Sectors Dashboard</Link>.
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

        {/* Section 10: Limitations */}
        <Section
          id="limitations"
          title="Limitations"
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
        >
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
              <li>Data is cached for up to 4 hours on the client and 15 minutes on the server. Check the freshness badge in the header.</li>
              <li>The tracker shows the top 4 active rotations. Less prominent rotations may not appear.</li>
            </ul>
          </SubSection>
        </Section>
      </div>
    </div>
  );
}
