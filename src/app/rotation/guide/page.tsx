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
  { id: "rs-acceleration", label: "RS Acceleration" },
  { id: "turnaround", label: "Turnaround Candidates" },
  { id: "reading-actions", label: "Reading Actions" },
  { id: "timeline", label: "Timeline & Stats" },
  { id: "workflow", label: "Workflow" },
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
                  How to read rotation cards, interpret stock performance, and use RS Acceleration to find turnaround candidates.
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
                  <tr><td className="py-2 pr-3 font-medium text-white">RS Accel</td><td className="py-2">Relative Strength Acceleration vs sector ETF. See dedicated section below.</td></tr>
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
            RS Accel descending</strong> to find stocks that are catching up to the sector ETF fastest right now, regardless
            of their total performance.
          </Tip>
        </Section>

        {/* Section 4: RS Acceleration */}
        <Section
          id="rs-acceleration"
          title="RS Acceleration (RS Accel)"
          icon={<TrendingUp className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            <strong className="text-white">RS Acceleration</strong> measures whether a stock is gaining or losing ground
            vs its sector ETF <em>recently</em> compared to the <em>medium term</em>. It&apos;s a second derivative &mdash;
            not how the stock is doing, but whether the rate of relative performance is changing.
          </p>

          <SubSection title="The Formula">
            <div className="rounded-md bg-[#0a0a0a] border border-[#333] p-3 font-mono text-[11px] text-[#c0c0c0]">
              RS Accel = (stock_5d_return &minus; etf_5d_return) &minus; (stock_20d_return &minus; etf_20d_return)
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
                    <th className="py-1.5 pr-3 text-left font-medium">RS Accel</th>
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
              A <strong className="text-white">strongly negative RS Accel on a recent big winner</strong> is normal and does
              not mean the stock is failing. Here&apos;s why:
            </p>
            <p className="mt-2">
              Imagine a stock spikes +30% on earnings 15 days ago, then consolidates flat for the last 5 days.
              The ETF gained +5% over the full 20 days and +1% over the last 5 days:
            </p>
            <div className="mt-2 rounded-md bg-[#0a0a0a] border border-[#333] p-3 font-mono text-[11px] text-[#c0c0c0]">
              <div>20d relative: +30% &minus; 5% = <span className="text-green-400">+25%</span> (massive outperformance)</div>
              <div>5d relative: 0% &minus; 1% = <span className="text-red-400">&minus;1%</span> (slight underperformance)</div>
              <div>RS Accel: (&minus;1) &minus; (+25) = <span className="text-red-400">&minus;26</span></div>
            </div>
            <p className="mt-2">
              The RS Accel is &minus;26 even though the stock is up 30%! This is correct &mdash; the stock <em>is</em> decelerating
              relative to the ETF. It&apos;s just that the &quot;deceleration&quot; is from an extraordinary spike back to normal,
              not from strength to weakness.
            </p>
            <p className="mt-2">
              <strong className="text-white">How to tell the difference:</strong>
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Check the <strong className="text-white">% Change</strong> column. If total return is strongly positive (e.g., +30%),
                negative RS Accel just means post-spike cooldown. The stock is fine.</li>
              <li>Check <strong className="text-white">vs ETF</strong>. If still well above zero, the stock is still outperforming
                on an absolute basis. The negative RS Accel is noise.</li>
              <li>A stock with <strong className="text-white">negative % Change AND negative RS Accel</strong> is genuinely failing &mdash;
                it&apos;s lagging the sector and getting worse. That&apos;s the real warning signal.</li>
            </ul>
          </SubSection>

          <SubSection title="Best Uses for RS Accel">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">Find turnaround candidates</strong> &mdash; Sort RS Accel descending. Stocks at the top
                with negative % Change are reversing their underperformance. These are early entries before the crowd notices.</li>
              <li><strong className="text-white">Spot fading leaders</strong> &mdash; Leaders (green badge) with negative RS Accel are losing
                their edge. They may still be up, but the rate of outperformance is slowing. Consider taking profits.</li>
              <li><strong className="text-white">Ignore post-spike noise</strong> &mdash; If % Change is +15% or higher and RS Accel is
                deeply negative, the stock just had a big move and is consolidating. This is not an exit signal &mdash; consolidation
                after a spike is healthy.</li>
              <li><strong className="text-white">Confirm catch-up plays</strong> &mdash; Catch-up stocks (cyan badge) with positive RS Accel
                are the highest-probability entries &mdash; they&apos;re in an uptrend AND accelerating relative to the sector.</li>
            </ul>
          </SubSection>

          <Warning>
            RS Accel requires at least 21 aligned trading days between the stock and ETF. Stocks with insufficient
            data show <span className="font-mono">0.00</span> and will not qualify as turnaround candidates. Newly
            IPO&apos;d or recently listed stocks may show zero RS Accel.
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
                    <td className="py-2 pr-3 font-medium text-white">Positive RS Acceleration</td>
                    <td className="py-2 pr-3">RS Accel &gt; +0.50</td>
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
                <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400">Turnaround Watch</span>
                <span>Sector is EARLY or MATURING. The rotation has legs and the stock is reversing early &mdash; highest conviction turnaround setup.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400/70">Speculative</span>
                <span>Sector is LATE or EXHAUSTING. The stock may be turning but the sector rotation is fading &mdash; higher risk, speculative only.</span>
              </div>
            </div>
          </SubSection>

          <SubSection title="How Turnaround Differs from Avoid">
            <p>
              Previously, all stocks below the 50-day SMA were categorized as &quot;Avoid&quot; with no distinction.
              Turnaround candidates are a carve-out from Avoid &mdash; they&apos;re still below average, but the
              RS Acceleration shows they&apos;re improving at an accelerating rate. Think of it as:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-red-400">Avoid</strong> = lagging AND getting worse (or no improvement signal)</li>
              <li><strong className="text-purple-400">Turnaround</strong> = lagging BUT catching up with volume support</li>
            </ul>
            <p className="mt-2">
              Note that turnaround candidates can be below their 50MA &mdash; the RS Accel gives a leading signal
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
              <li>RS Accel = (+5) &minus; (&minus;23) = <span className="text-green-400 font-mono">+28.00</span></li>
              <li>Volume: 1.2x average (real participation)</li>
            </ul>
            <p className="mt-2">
              RS Accel of +28 means the stock swung from &minus;23% underperformance over 20 days to +5% outperformance
              over 5 days. Massive acceleration. Combined with volume, this is a strong turnaround signal &mdash; the stock
              has reversed and institutional money is showing up. It gets the purple
              <span className="text-purple-400 font-semibold"> Turnaround Watch</span> badge.
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
                    <td className="py-2 pr-3"><span className="text-green-400">Ride</span> &mdash; hold and let it run</td>
                    <td className="py-2 pr-3"><span className="text-amber-400">Take Profit</span> &mdash; lock in gains</td>
                    <td className="py-2"><span className="text-red-400">Exit</span> &mdash; rotation fading</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-cyan-400">Catch-up</td>
                    <td className="py-2 pr-3"><span className="text-cyan-400">Entry Candidate</span> &mdash; fresh entry</td>
                    <td className="py-2 pr-3"><span className="text-[#888]">Watch</span> &mdash; wait for clarity</td>
                    <td className="py-2"><span className="text-red-400">Avoid</span> &mdash; too late</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-2 pr-3 font-medium text-purple-400">Turnaround</td>
                    <td className="py-2 pr-3"><span className="text-purple-400">Turnaround Watch</span> &mdash; highest priority</td>
                    <td className="py-2 pr-3" colSpan={2}><span className="text-purple-400/70">Speculative</span> &mdash; risky, sector fading</td>
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
              <li><span className="text-purple-400">Turnaround Watch</span> / <span className="text-cyan-400">Entry Candidate</span> (sort order 0) &mdash; best new entry opportunities</li>
              <li><span className="text-green-400">Ride</span> (sort order 1) &mdash; hold existing positions</li>
              <li><span className="text-amber-400">Take Profit</span> (sort order 2) &mdash; consider trimming</li>
              <li><span className="text-[#888]">Watch</span> / <span className="text-purple-400/70">Speculative</span> (sort order 3) &mdash; wait and see</li>
              <li><span className="text-red-400">Avoid</span> (sort order 4) &mdash; no position</li>
              <li><span className="text-red-400">Exit</span> (sort order 5) &mdash; close position</li>
            </ol>
          </SubSection>

          <SubSection title="Strategy Summary Bar">
            <p>
              Above the stock table, the summary bar shows aggregated counts: how many Leaders, Entry Candidates,
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
          title="Rotation Tracker Workflow"
          icon={<Users className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <SubSection title="Daily Check (2 Minutes)">
            <ol className="list-decimal pl-4 space-y-1">
              <li>Open the Rotation Tracker. Check the regime banner &mdash; risk-on or risk-off?</li>
              <li>Scan the active rotation cards. Any ENTER or ADD ON PULLBACK signals?</li>
              <li>Click the strongest card to expand stocks. Sort by Action to see top opportunities.</li>
              <li>Note any <span className="text-purple-400">Turnaround Watch</span> stocks &mdash; add to watchlist for monitoring.</li>
              <li>Check RS Accel on your existing holdings &mdash; negative accel on leaders = early warning to tighten stops.</li>
            </ol>
          </SubSection>

          <SubSection title="Finding Turnaround Plays">
            <ol className="list-decimal pl-4 space-y-1">
              <li>Expand an EARLY or MATURING sector rotation card.</li>
              <li>Sort the stock table by <strong className="text-white">RS Accel descending</strong>.</li>
              <li>Look for purple <span className="text-purple-400">Turnaround Watch</span> badges near the top.</li>
              <li>Verify: is the stock&apos;s % Change negative but RS Accel strongly positive? That&apos;s the setup.</li>
              <li>Check Vol vs Avg &mdash; you want &ge;0.8x to confirm real participation.</li>
              <li>Cross-reference with the Pre-Run scanner and EW scanner for additional confirmation.</li>
            </ol>
          </SubSection>

          <SubSection title="Interpreting Big Numbers">
            <p>RS Accel values outside &plusmn;5 deserve extra attention:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-green-400">RS Accel &gt; +5</strong> with negative % Change = strong turnaround signal.
                The stock is reversing hard and fast from a deep underperformance.</li>
              <li><strong className="text-green-400">RS Accel &gt; +5</strong> with positive % Change = momentum acceleration.
                Already outperforming and gaining more ground. Strong leader getting stronger.</li>
              <li><strong className="text-red-400">RS Accel &lt; &minus;5</strong> with positive % Change = post-spike cooldown.
                Check if there was a recent earnings gap or catalyst. Usually not a sell signal, just consolidation.</li>
              <li><strong className="text-red-400">RS Accel &lt; &minus;5</strong> with negative % Change = deteriorating laggard.
                The worst combination. Stock is underperforming and getting worse. Avoid.</li>
            </ul>
          </SubSection>

          <Tip>
            The most actionable setup: an <strong className="text-white">EARLY sector</strong> with a stock showing
            <strong className="text-purple-400"> Turnaround Watch</strong>, <strong className="text-green-400">RS Accel &gt; +2</strong>,
            and <strong className="text-white">Vol &ge; 1.0x</strong>. This means fresh sector rotation + lagging stock reversing hard
            with institutional volume. Cross-check the stock on the Pre-Run scanner for additional conviction.
          </Tip>
        </Section>

        {/* Section 9: Limitations */}
        <Section
          id="limitations"
          title="Limitations"
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
        >
          <SubSection title="RS Accel Limitations">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-white">Post-spike distortion</strong> &mdash; Stocks that gapped up on earnings or
                a catalyst will show strongly negative RS Accel for ~15 trading days as the 20-day window slides past the
                spike. This is mathematically correct but does not indicate weakness. Always check % Change alongside RS Accel.
              </li>
              <li>
                <strong className="text-white">Minimum data requirement</strong> &mdash; Needs 21 aligned trading days between
                stock and ETF. New IPOs, recently listed stocks, or stocks with trading halts may show 0.00.
              </li>
              <li>
                <strong className="text-white">5d/20d windows are fixed</strong> &mdash; RS Accel uses 5-day and 20-day lookbacks.
                A stock that reversed 6 days ago may not yet show positive RS Accel if the first day of reversal was the 6th day
                back. The signal lags by a few days.
              </li>
            </ul>
          </SubSection>

          <SubSection title="Turnaround Limitations">
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong className="text-white">Not all turnarounds succeed</strong> &mdash; A stock can meet all three criteria
                (lagging + RS Accel + volume) and still fail. The turnaround flag is a screening signal, not a trade signal.
                Always do additional analysis before entering.
              </li>
              <li>
                <strong className="text-white">Sector lifecycle matters</strong> &mdash; Turnaround Watch in an EARLY sector
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
