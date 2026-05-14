"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ArrowLeft,
  BarChart3,
  Layers,
  Target,
  Activity,
  SlidersHorizontal,
  Cpu,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";

const SECTIONS = [
  { id: "what-is-strat", label: "What Is It?" },
  { id: "bar-classification", label: "Bar Types" },
  { id: "tfc", label: "TFC" },
  { id: "combos", label: "Combos" },
  { id: "forming-setups", label: "Forming Setups" },
  { id: "pmg", label: "PMG" },
  { id: "scoring", label: "Scoring" },
  { id: "signals", label: "Signals" },
  { id: "filters", label: "Filters" },
  { id: "how-to-trade", label: "How to Trade" },
];

export default function StratGuidePage() {
  const [, setTick] = useState(0);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTick((t) => t + 1);
  }, []);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sidebar TOC */}
      <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:h-fit lg:w-48">
        {/* Mobile: horizontal scroll */}
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
        {/* Desktop: vertical list */}
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
              href="/strat"
              className="block rounded-md px-3 py-1.5 text-xs font-medium text-[#5ba3e6] transition-colors hover:bg-[#1a1a1a]"
            >
              &larr; Back to Scanner
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
              <BookOpen className="h-8 w-8 text-orange-400" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  The Strat Guide
                </h1>
                <p className="mt-1 text-[#a0a0a0]">
                  Rob Smith&rsquo;s universal price action framework &mdash; bar classification, combos, and timeframe continuity.
                </p>
              </div>
            </div>
            <Link
              href="/strat"
              className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444] shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Scanner
            </Link>
          </div>
        </section>

        {/* Section 1: What Is The Strat? */}
        <Section
          id="what-is-strat"
          title="What Is The Strat?"
          icon={<Layers className="h-5 w-5 text-orange-400" />}
        >
          <p>
            <strong className="text-white">The Strat</strong> is a universal price action framework
            created by Rob Smith. It reduces all market movement to a simple classification system
            that works on any instrument and any timeframe. Instead of subjective pattern reading,
            The Strat uses objective bar-by-bar comparisons to identify exactly where price is in
            its cycle.
          </p>

          <SubSection title="Core Principles">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Every bar tells a story</strong> &mdash; each bar is classified relative to the prior bar as Inside (1), Directional Up (2U), Directional Down (2D), or Outside (3)</li>
              <li><strong className="text-white">Scenarios, not predictions</strong> &mdash; The Strat defines what CAN happen (broadening/narrowing scenarios) rather than predicting what WILL happen</li>
              <li><strong className="text-white">Timeframe continuity</strong> &mdash; when monthly, weekly, and daily charts all agree on direction, trades have the highest probability of success</li>
              <li><strong className="text-white">Actionable triggers</strong> &mdash; specific price levels from combo patterns define exact entry points</li>
            </ul>
          </SubSection>

          <SubSection title="Why Use The Strat?">
            <p>
              Traditional technical analysis is subjective &mdash; two traders can look at the same chart
              and see different patterns. The Strat eliminates subjectivity by reducing price action to
              four bar types and a finite set of combo patterns. This makes scanning, back-testing, and
              trade planning systematic and repeatable.
            </p>
          </SubSection>

          <Tip>
            The Strat works on any market (stocks, futures, forex, crypto) and any timeframe (1-min to monthly).
            The scanner focuses on daily, weekly, and monthly for swing trading setups.
          </Tip>
        </Section>

        {/* Section 2: Bar Classification */}
        <Section
          id="bar-classification"
          title="Bar Classification"
          icon={<BarChart3 className="h-5 w-5 text-orange-400" />}
        >
          <p>
            Every bar is classified by comparing its high and low to the <strong className="text-white">prior
            bar&rsquo;s</strong> high and low. There are exactly four possible outcomes:
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#333]">
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Type</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Name</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Definition</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Meaning</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2">
                    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-[#555] text-white">1</span>
                  </td>
                  <td className="px-3 py-2 text-white">Inside Bar</td>
                  <td className="px-3 py-2">High &le; prior high AND Low &ge; prior low</td>
                  <td className="px-3 py-2">Price is <strong className="text-white">coiling</strong> &mdash; contained within prior bar&rsquo;s range. Breakout pending.</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2">
                    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-green-500 text-white">2U</span>
                  </td>
                  <td className="px-3 py-2 text-white">Directional Up</td>
                  <td className="px-3 py-2">High &gt; prior high (but low &ge; prior low)</td>
                  <td className="px-3 py-2">Price <strong className="text-white">expanded upward</strong> &mdash; took out the prior bar&rsquo;s high but held the low.</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2">
                    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-red-500 text-white">2D</span>
                  </td>
                  <td className="px-3 py-2 text-white">Directional Down</td>
                  <td className="px-3 py-2">Low &lt; prior low (but high &le; prior high)</td>
                  <td className="px-3 py-2">Price <strong className="text-white">expanded downward</strong> &mdash; took out the prior bar&rsquo;s low but held the high.</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-orange-500 text-white">3</span>
                  </td>
                  <td className="px-3 py-2 text-white">Outside Bar</td>
                  <td className="px-3 py-2">High &gt; prior high AND Low &lt; prior low</td>
                  <td className="px-3 py-2">Price <strong className="text-white">expanded both ways</strong> &mdash; took out both the prior high and low. High volatility, often indecisive.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SubSection title="Key Insight: The 1 Bar">
            <p>
              The <strong className="text-white">inside bar (1)</strong> is the most important setup bar
              in The Strat. It represents energy being compressed &mdash; like a coiled spring. When a 1 bar
              forms, you know the breakout level in both directions: the prior bar&rsquo;s high (bullish
              trigger) and low (bearish trigger). This is why inside-bar breakouts are the cleanest entries.
            </p>
          </SubSection>

          <SubSection title="Directionality of the 3 Bar">
            <p>
              An outside bar (3) takes out both the high and low of the prior bar. Its
              <strong className="text-white"> direction</strong> is determined by the close relative to the
              open: if close &gt; open, it&rsquo;s bullish (expanded down first, then reversed up). If
              close &lt; open, it&rsquo;s bearish. Outside bars often signal exhaustion or reversal.
            </p>
          </SubSection>

          <Tip>
            In the scanner results, bar types are color-coded:
            <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-[#555] text-white mx-1">1</span> gray,
            <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-green-500 text-white mx-1">2U</span> green,
            <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white mx-1">2D</span> red,
            <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-orange-500 text-white mx-1">3</span> orange.
            The M/W/D columns show current bar type per timeframe.
          </Tip>
        </Section>

        {/* Section 3: Timeframe Continuity (TFC) */}
        <Section
          id="tfc"
          title="Timeframe Continuity (TFC)"
          icon={<Activity className="h-5 w-5 text-orange-400" />}
        >
          <p>
            <strong className="text-white">Timeframe Continuity</strong> measures whether the monthly,
            weekly, and daily charts are all pointing in the same direction. When all three timeframes
            are aligned, you&rsquo;re trading with the full weight of the market behind you.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#333]">
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Alignment</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">M / W / D</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Score</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Meaning</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2">
                    <span className="text-green-400 font-medium">FULL BULL</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-400 mr-1" />
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-400 mr-1" />
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-400" />
                  </td>
                  <td className="px-3 py-2 text-white">3</td>
                  <td className="px-3 py-2">All timeframes bullish. Highest probability long setups.</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2">
                    <span className="text-red-400 font-medium">FULL BEAR</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400 mr-1" />
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400 mr-1" />
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
                  </td>
                  <td className="px-3 py-2 text-white">3</td>
                  <td className="px-3 py-2">All timeframes bearish. Highest probability short setups.</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">
                    <span className="text-[#a0a0a0] font-medium">MIXED</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-400 mr-1" />
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400 mr-1" />
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-400" />
                  </td>
                  <td className="px-3 py-2 text-white">0&ndash;2</td>
                  <td className="px-3 py-2">Timeframes disagree. Choppier conditions, lower probability. Trade the aligned timeframes or wait.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SubSection title="How TFC Direction Is Determined">
            <p>
              Each timeframe&rsquo;s direction comes from its current bar type:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">2U</strong> &rarr; BULL</li>
              <li><strong className="text-white">2D</strong> &rarr; BEAR</li>
              <li><strong className="text-white">3</strong> &rarr; Depends on close vs. open (bullish if close &gt; open)</li>
              <li><strong className="text-white">1</strong> &rarr; NEUTRAL (inside bar &mdash; no directional bias yet)</li>
            </ul>
          </SubSection>

          <SubSection title="Trading with TFC">
            <p>
              The strongest setups occur when your trade direction matches the TFC alignment. A
              <strong className="text-white"> long entry on a Full Bull TFC</strong> stock has all three
              timeframes confirming the uptrend. A long entry on a Mixed TFC stock is fighting at least
              one timeframe &mdash; it can still work, but the odds are lower.
            </p>
          </SubSection>

          <Tip>
            In the scanner, three colored dots show the TFC at a glance. Three green dots = Full Bull,
            three red dots = Full Bear. Filter by TFC alignment in the sidebar to focus on the highest-probability direction.
          </Tip>
        </Section>

        {/* Section 4: Combo Patterns */}
        <Section
          id="combos"
          title="Combo Patterns"
          icon={<Target className="h-5 w-5 text-orange-400" />}
        >
          <p>
            <strong className="text-white">Combos</strong> are specific sequences of 2&ndash;3 consecutive
            bar types that form recognizable patterns. Each combo has a defined trigger level and directional
            bias. The scanner detects all 10 combo types across monthly, weekly, and daily timeframes.
          </p>

          <SubSection title="Reversal Combos">
            <p className="mb-2">
              Reversals indicate a potential change in direction. The key sequence is a directional bar
              followed by an inside bar, then a breakout in the opposite direction.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Combo</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Sequence</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Direction</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Description</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-2 text-white">2-1-2U Rev</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white mr-0.5">2D</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-[#555] text-white mr-0.5">1</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-500 text-white">2U</span>
                    </td>
                    <td className="px-3 py-2"><span className="text-green-400">BULL</span></td>
                    <td className="px-3 py-2">Downward move, coil, then breakout up. Classic bullish reversal.</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-2 text-white">2-1-2D Rev</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-500 text-white mr-0.5">2U</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-[#555] text-white mr-0.5">1</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white">2D</span>
                    </td>
                    <td className="px-3 py-2"><span className="text-red-400">BEAR</span></td>
                    <td className="px-3 py-2">Upward move, coil, then breakdown. Classic bearish reversal.</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-2 text-white">1-2-2U Rev</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-[#555] text-white mr-0.5">1</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white mr-0.5">2D</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-500 text-white">2U</span>
                    </td>
                    <td className="px-3 py-2"><span className="text-green-400">BULL</span></td>
                    <td className="px-3 py-2">Coil, fake-out down, then reversal up. Inside bar breakout reversal.</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-2 text-white">1-2-2D Rev</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-[#555] text-white mr-0.5">1</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-500 text-white mr-0.5">2U</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white">2D</span>
                    </td>
                    <td className="px-3 py-2"><span className="text-red-400">BEAR</span></td>
                    <td className="px-3 py-2">Coil, fake-out up, then breakdown. Inside bar breakout reversal.</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-2 text-white">3-2-2U Rev</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-orange-500 text-white mr-0.5">3</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white mr-0.5">2D</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-500 text-white">2U</span>
                    </td>
                    <td className="px-3 py-2"><span className="text-green-400">BULL</span></td>
                    <td className="px-3 py-2">Outside bar volatility, continued down, then reversal up.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-white">3-2-2D Rev</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-orange-500 text-white mr-0.5">3</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-500 text-white mr-0.5">2U</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white">2D</span>
                    </td>
                    <td className="px-3 py-2"><span className="text-red-400">BEAR</span></td>
                    <td className="px-3 py-2">Outside bar volatility, continued up, then reversal down.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Continuation Combos">
            <p className="mb-2">
              Continuations indicate the current trend is likely to persist. The inside bar coils energy
              before breaking out in the same direction as the preceding move.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Combo</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Sequence</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Direction</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Description</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-2 text-white">2-1-2U Cont</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-500 text-white mr-0.5">2U</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-[#555] text-white mr-0.5">1</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-500 text-white">2U</span>
                    </td>
                    <td className="px-3 py-2"><span className="text-green-400">BULL</span></td>
                    <td className="px-3 py-2">Up move, pause (coil), then continued up. Bull flag pattern.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-white">2-1-2D Cont</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white mr-0.5">2D</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-[#555] text-white mr-0.5">1</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white">2D</span>
                    </td>
                    <td className="px-3 py-2"><span className="text-red-400">BEAR</span></td>
                    <td className="px-3 py-2">Down move, pause (coil), then continued down. Bear flag pattern.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Outside Bar Combos">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Combo</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Sequence</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Direction</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Description</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-2 text-white">3-1-2U</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-orange-500 text-white mr-0.5">3</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-[#555] text-white mr-0.5">1</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-green-500 text-white">2U</span>
                    </td>
                    <td className="px-3 py-2"><span className="text-green-400">BULL</span></td>
                    <td className="px-3 py-2">Outside bar volatility, coil, then bullish breakout. Often a powerful reversal after a capitulation outside bar.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-white">3-1-2D</td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-orange-500 text-white mr-0.5">3</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-[#555] text-white mr-0.5">1</span>
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white">2D</span>
                    </td>
                    <td className="px-3 py-2"><span className="text-red-400">BEAR</span></td>
                    <td className="px-3 py-2">Outside bar volatility, coil, then bearish breakdown. Distribution after volatile expansion.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <Tip>
            Reversal combos work best when they align with TFC from a higher timeframe. A daily 2-1-2U
            reversal on a stock with Full Bull weekly/monthly TFC is much higher probability than one
            fighting a bearish higher timeframe.
          </Tip>
        </Section>

        {/* Section 5: Forming Setups */}
        <Section
          id="forming-setups"
          title="Forming Setups"
          icon={<Zap className="h-5 w-5 text-orange-400" />}
        >
          <p>
            Not all combos are complete. The scanner also detects <strong className="text-white">forming
            patterns</strong> &mdash; 2-bar sequences where the final bar hasn&rsquo;t printed yet. These
            are marked as <span className="text-amber-400 italic">forming</span> in the results.
          </p>

          <SubSection title="How Forming Detection Works">
            <p>
              When the scanner sees a 2-bar sequence that could become a combo, it identifies the setup:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">[2D, 1]</strong> &rarr; Could become 2-1-2U Rev (bullish) or 2-1-2D Cont (bearish)</li>
              <li><strong className="text-white">[2U, 1]</strong> &rarr; Could become 2-1-2D Rev (bearish) or 2-1-2U Cont (bullish)</li>
              <li><strong className="text-white">[3, 1]</strong> &rarr; Could become 3-1-2U (bullish) or 3-1-2D (bearish)</li>
            </ul>
          </SubSection>

          <SubSection title="Both Directions Are In Play">
            <p>
              A forming setup is a <strong className="text-white">conditional entry</strong>. When an
              inside bar (1) forms after a directional bar, BOTH breakout levels are defined:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-green-400">Long trigger</strong> = prior bar&rsquo;s high &mdash; enter long if price breaks above</li>
              <li><strong className="text-red-400">Short trigger</strong> = prior bar&rsquo;s low &mdash; enter short if price breaks below</li>
            </ul>
            <p className="mt-2 text-[#a0a0a0]">
              The scanner shows both trigger levels. Whichever direction price breaks determines the combo type.
              This is why inside-bar breakouts are the purest Strat setups &mdash; the market tells you which
              way it wants to go.
            </p>
          </SubSection>

          <Tip>
            Filter for bar type &ldquo;1&rdquo; on daily timeframe to find all stocks currently coiling
            with inside bars. These are your breakout candidates for the next session.
          </Tip>
        </Section>

        {/* Section 6: PMG */}
        <Section
          id="pmg"
          title="PMG (Pivot Machine Gun)"
          icon={<TrendingUp className="h-5 w-5 text-orange-400" />}
        >
          <p>
            <strong className="text-white">Pivot Machine Gun (PMG)</strong> occurs when price tests the
            same high or low level three or more times. Each test that fails to break through builds up
            stored energy &mdash; when the level finally breaks, the move is often explosive.
          </p>

          <SubSection title="Detection Rules">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Minimum 3 tests</strong> of the same level (within 0.2% tolerance)</li>
              <li>Tests are counted from the <strong className="text-white">last 8 bars</strong> in each timeframe</li>
              <li>Both <strong className="text-green-400">HIGH</strong> and <strong className="text-red-400">LOW</strong> PMG levels are detected</li>
              <li>A HIGH PMG that breaks = bullish breakout. A LOW PMG that breaks = bearish breakdown.</li>
            </ul>
          </SubSection>

          <SubSection title="Why PMG Matters">
            <p>
              Multiple failed tests of a level create a wall of stops just beyond it. When price finally
              breaks through, those stops cascade into a <strong className="text-white">forced buying/selling
              wave</strong>. The more tests, the bigger the stored energy, and the more explosive the move.
            </p>
            <p className="mt-2 text-[#a0a0a0]">
              PMG is especially powerful when combined with a combo trigger at the same level. A 2-1-2U reversal
              with a 4x PMG on the high is a high-conviction long setup.
            </p>
          </SubSection>

          <Tip>
            In the expanded detail panel, PMG levels are shown with their test count and timeframe.
            Look for PMG levels that coincide with your combo triggers &mdash; that&rsquo;s where
            the highest probability breakouts occur.
          </Tip>
        </Section>

        {/* Section 7: Scoring System */}
        <Section
          id="scoring"
          title="Scoring System"
          icon={<SlidersHorizontal className="h-5 w-5 text-orange-400" />}
        >
          <p>
            Each stock gets a composite score from 0&ndash;13 based on five dimensions. Higher scores
            indicate stronger, more actionable setups.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#333]">
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Component</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Range</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">How It&rsquo;s Scored</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2 text-white font-medium">TFC Score</td>
                  <td className="px-3 py-2">0&ndash;3</td>
                  <td className="px-3 py-2">Count of aligned timeframes. Full Bull or Full Bear = 3, all neutral = 0.</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2 text-white font-medium">Combo Score</td>
                  <td className="px-3 py-2">0&ndash;5</td>
                  <td className="px-3 py-2">
                    +1 if any combo exists, +1 for reversal combo, +1 for weekly actionable,
                    +2 for monthly actionable, +1 if combo direction matches TFC,
                    +1 if actionable combos in 2+ timeframes share the same direction.
                  </td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2 text-white font-medium">Actionability</td>
                  <td className="px-3 py-2">0&ndash;2</td>
                  <td className="px-3 py-2">
                    +1 if any actionable trigger exists, +1 if trigger aligns with TFC direction.
                  </td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2 text-white font-medium">PMG Coincidence</td>
                  <td className="px-3 py-2">0&ndash;2</td>
                  <td className="px-3 py-2">
                    +1 if a PMG HIGH level is within 0.3% of the long trigger (and a BULL combo exists),
                    +1 if a PMG LOW level is within 0.3% of the short trigger (and a BEAR combo exists).
                    Heavy testing at the breakout level confirms high breakout probability.
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-white font-medium">Volume</td>
                  <td className="px-3 py-2">0&ndash;1</td>
                  <td className="px-3 py-2">
                    +1 if the last daily bar&rsquo;s volume is 1.5x or more above the average volume
                    of all available bars. Above-average volume confirms institutional participation.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <SubSection title="Score Breakdown Examples">
            <div className="space-y-2 text-[#c0c0c0]">
              <p>
                <strong className="text-white">Score 13 (perfect)</strong>: Full Bull TFC (3) + monthly
                reversal combo matching TFC direction with multi-TF alignment (5) + actionable trigger
                aligned with TFC (2) + PMG at both triggers (2) + above-average volume (1) = 13.
                This is the highest-conviction setup The Strat can produce.
              </p>
              <p>
                <strong className="text-white">Score 8 (actionable)</strong>: Full Bull TFC (3) + daily
                reversal combo matching TFC (3) + actionable trigger (2) = 8. Clear setup with trigger levels.
              </p>
              <p>
                <strong className="text-white">Score 4 (moderate)</strong>: Mixed TFC with 2 aligned (2)
                + daily combo (1) + trigger exists (1) = 4. Worth watching but needs more confirmation.
              </p>
              <p>
                <strong className="text-white">Score 1 (weak)</strong>: Mixed TFC with 1 aligned (1)
                + no combos (0) + no triggers (0) = 1. No actionable setup.
              </p>
            </div>
          </SubSection>

          <Tip>
            Use the Min Score slider in the sidebar to filter out noise. A threshold of 5+ is a good
            starting point. Raise to 8+ for only the strongest setups.
          </Tip>
        </Section>

        {/* Section 8: Signal Classification */}
        <Section
          id="signals"
          title="Signal Classification"
          icon={<Cpu className="h-5 w-5 text-orange-400" />}
        >
          <p>
            Based on the total score and combo state, each stock is classified into one of four signals:
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#333]">
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Signal</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Criteria</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Meaning</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2">
                    <span className="rounded px-2 py-0.5 text-[10px] font-medium border text-green-400 border-green-500/30 bg-green-500/10">ACTIONABLE</span>
                  </td>
                  <td className="px-3 py-2 text-white">Score &ge; 8 + actionable combo</td>
                  <td className="px-3 py-2">Complete pattern with trigger levels and direction shown (LONG/SHORT/BOTH). Ready to trade.</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2">
                    <span className="rounded px-2 py-0.5 text-[10px] font-medium border text-amber-400 border-amber-500/30 bg-amber-500/10">SETTING UP</span>
                  </td>
                  <td className="px-3 py-2 text-white">Score &ge; 5 or has any combo</td>
                  <td className="px-3 py-2">Pattern forming or moderate alignment. Add to watchlist, wait for trigger.</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2">
                    <span className="rounded px-2 py-0.5 text-[10px] font-medium border text-[#888] border-[#333] bg-[#1a1a1a]">NEUTRAL</span>
                  </td>
                  <td className="px-3 py-2 text-white">Score &le; 2 + no combos</td>
                  <td className="px-3 py-2">No meaningful setup. Price action is directionless or not forming any pattern.</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">
                    <span className="rounded px-2 py-0.5 text-[10px] font-medium border text-red-400 border-red-500/30 bg-red-500/10">CONFLICTED</span>
                  </td>
                  <td className="px-3 py-2 text-white">Everything else</td>
                  <td className="px-3 py-2">Mixed signals. Some setup elements present but incomplete or contradictory.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SubSection title="Using Signals for Screening">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-green-400">ACTIONABLE</strong> &mdash; your primary focus. These have defined triggers you can set alerts on.</li>
              <li><strong className="text-amber-400">SETTING UP</strong> &mdash; your watchlist. Check back when the forming combo completes.</li>
              <li><strong className="text-[#888]">NEUTRAL</strong> and <strong className="text-red-400">CONFLICTED</strong> &mdash; skip unless you have an independent thesis.</li>
            </ul>
          </SubSection>
        </Section>

        {/* Section 9: Scanner Filters */}
        <Section
          id="filters"
          title="Scanner Filters"
          icon={<SlidersHorizontal className="h-5 w-5 text-orange-400" />}
        >
          <p>
            The sidebar offers filters to narrow results after scanning. Here&rsquo;s what each one does:
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#333]">
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Filter</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Options</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Effect</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2 text-white">Sector</td>
                  <td className="px-3 py-2">All, Semiconductors, Software & Cloud, etc.</td>
                  <td className="px-3 py-2">Limits the scan universe to a specific GICS sector. Scans only those tickers.</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2 text-white">TFC Alignment</td>
                  <td className="px-3 py-2">All, Full Bull, Full Bear, Mixed</td>
                  <td className="px-3 py-2">Show only stocks with matching monthly/weekly/daily alignment.</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2 text-white">Active Combo</td>
                  <td className="px-3 py-2">All, 2-1-2 Rev, 2-1-2 Cont, 3-1-2, 1-2-2 Rev, 3-2-2 Rev</td>
                  <td className="px-3 py-2">Filter for stocks with a specific combo pattern (any direction).</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2 text-white">Combo Timeframe</td>
                  <td className="px-3 py-2">All, Monthly, Weekly, Daily</td>
                  <td className="px-3 py-2">Require the combo to exist in a specific timeframe. Composes with Active Combo.</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2 text-white">Bar Type</td>
                  <td className="px-3 py-2">All, 1, 2U, 2D, 3</td>
                  <td className="px-3 py-2">Filter by current bar type in the selected timeframe (or daily by default).</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-2 text-white">Min Score</td>
                  <td className="px-3 py-2">0&ndash;13 slider</td>
                  <td className="px-3 py-2">Hide stocks below this total score. 5+ recommended for focused screening.</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-white">Signal</td>
                  <td className="px-3 py-2">All, Actionable, Setting Up, Neutral, Conflicted</td>
                  <td className="px-3 py-2">Show only stocks with the selected signal classification.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SubSection title="Preset Configurations">
            <p>Presets apply multiple filters at once. Here&rsquo;s what each one does:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Full Bull TFC</strong> &mdash; TFC=FULL_BULL, Score &ge; 4. The strongest long setups.</li>
              <li><strong className="text-white">Full Bear TFC</strong> &mdash; TFC=FULL_BEAR, Score &ge; 4. The strongest short setups.</li>
              <li><strong className="text-white">2-1-2 Reversals</strong> &mdash; Combo=2-1-2 REV. Classic reversal patterns in any timeframe.</li>
              <li><strong className="text-white">Inside Day Breakout</strong> &mdash; Bar type=1, Daily. Stocks coiling with inside bars today.</li>
              <li><strong className="text-white">Actionable Now</strong> &mdash; Signal=ACTIONABLE, Score &ge; 8. Only triggered, high-score setups with direction shown.</li>
              <li><strong className="text-white">Wide Net</strong> &mdash; All defaults. Maximum results for broad exploration.</li>
            </ul>
          </SubSection>

          <Tip>
            Filters compose with each other. Setting TFC=FULL_BULL + Combo=2-1-2 REV + Timeframe=Daily
            finds stocks with daily 2-1-2 bullish reversals in a full bull timeframe alignment &mdash;
            one of the highest-probability setups in The Strat.
          </Tip>
        </Section>

        {/* Section 10: How to Trade */}
        <Section
          id="how-to-trade"
          title="How to Trade The Strat"
          icon={<Shield className="h-5 w-5 text-orange-400" />}
        >
          <p>
            The Strat provides a framework for identifying setups and defining exact entry levels.
            Here&rsquo;s how to turn scanner results into trade plans:
          </p>

          <SubSection title="Entry Triggers">
            <ol className="list-inside list-decimal space-y-1.5 text-[#c0c0c0]">
              <li><strong className="text-white">Identify the combo pattern</strong> and its direction (bullish or bearish)</li>
              <li><strong className="text-white">Confirm TFC alignment</strong> &mdash; the combo direction should match the higher-timeframe trend</li>
              <li><strong className="text-white">Set an alert at the trigger level</strong> &mdash; for bullish combos, the trigger is the high of the setup bar; for bearish, the low</li>
              <li><strong className="text-white">Enter on the break</strong> of the trigger level. Some traders wait for a close above/below the trigger for confirmation.</li>
            </ol>
          </SubSection>

          <SubSection title="Stop Placement">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">For long entries</strong>: Stop below the low of the inside bar (1 bar) or the setup bar</li>
              <li><strong className="text-white">For short entries</strong>: Stop above the high of the inside bar (1 bar) or the setup bar</li>
              <li>The inside bar&rsquo;s range defines your risk. Tighter inside bars = tighter stops = better risk/reward.</li>
              <li>If the setup bar is a 3 (outside bar), the stop may be wide. Consider reducing position size or skipping.</li>
            </ul>
          </SubSection>

          <SubSection title="TFC-Aligned Workflow">
            <ol className="list-inside list-decimal space-y-1.5 text-[#c0c0c0]">
              <li><strong className="text-white">Scan for Full Bull or Full Bear TFC</strong> stocks</li>
              <li><strong className="text-white">Check for daily combos</strong> that match the TFC direction</li>
              <li><strong className="text-white">Prioritize combos with PMG</strong> at the trigger level</li>
              <li><strong className="text-white">Enter on trigger break</strong>, stop below/above the setup bar</li>
              <li><strong className="text-white">Target the next timeframe&rsquo;s trigger level</strong> or use a 2:1 risk/reward ratio minimum</li>
            </ol>
          </SubSection>

          <SubSection title="Risk Management">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Size by risk</strong> &mdash; define your dollar risk per trade, then calculate position size from the trigger-to-stop distance</li>
              <li><strong className="text-white">Avoid outside bar (3) setups</strong> unless they align with strong TFC &mdash; wide ranges mean wide stops</li>
              <li><strong className="text-white">Don&rsquo;t chase</strong> &mdash; if price has already moved significantly past the trigger, the risk/reward is degraded. Wait for the next setup.</li>
              <li><strong className="text-white">Respect the timeframe</strong> &mdash; a daily combo plays out over days, a weekly combo over weeks. Don&rsquo;t expect intraday results from a weekly setup.</li>
            </ul>
          </SubSection>

          <Tip>
            The scanner is a starting point, not an auto-trading signal. Always verify the chart, check
            for news catalysts, and ensure the risk/reward makes sense before entering. The best Strat
            traders combine pattern identification with sound position sizing and risk management.
          </Tip>
        </Section>

        {/* Back to scanner */}
        <div className="flex justify-center pt-2">
          <Link
            href="/strat"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm font-medium text-[#5ba3e6] transition-colors hover:bg-[#262626]"
          >
            &larr; Back to Strat Scanner
          </Link>
        </div>
      </div>
    </div>
  );
}

// -- Helper Components --

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
    <section id={id} className="scroll-mt-20 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
        {icon}
        {title}
      </h2>
      <div className="text-sm leading-relaxed text-[#c0c0c0]">{children}</div>
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-orange-400">{title}</p>
      <div className="text-sm text-[#c0c0c0]">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
      <p className="text-xs font-semibold text-orange-400">Pro Tip</p>
      <p className="mt-1 text-sm text-[#c0c0c0]">{children}</p>
    </div>
  );
}
