"use client";

import { useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Target,
  Layers,
  Shield,
  AlertTriangle,
  BarChart3,
  Zap,
  BookOpen,
} from "lucide-react";

const SECTIONS = [
  { id: "premise", label: "The Premise" },
  { id: "glossary", label: "Glossary" },
  { id: "ladder", label: "11-State Ladder" },
  { id: "htf", label: "HTF Bias" },
  { id: "premium-discount", label: "Premium / Discount" },
  { id: "scoring", label: "Score Components" },
  { id: "timeframes", label: "Timeframes" },
  { id: "reading", label: "Reading the Page" },
  { id: "limits", label: "Known Limits" },
];

function Section({ id, title, icon, children }: {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
        {icon}
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-[#aaa]">{children}</div>
    </section>
  );
}

const LADDER: [string, string, string][] = [
  ["1", "SSL", "Price sweeps below a pool of at least two roughly equal lows and closes back above it. A rolling low with one isolated bar under it does not count — a raid needs resting liquidity to take."],
  ["2", "Struct", "The structure high is frozen at the raid bar: the highest high of the eight bars before the sweep. This is the level a change of character has to clear."],
  ["3", "Disp", "A bullish candle whose body and range exceed each of the prior three, with a body at least 60% of its range, closing above the previous high."],
  ["4", "MSS", "Market structure shift — a CLOSE above the frozen structure high. A wick through it does not qualify."],
  ["5", "FVG", "A three-candle bullish imbalance: the third candle's low sits above the first candle's high, and the middle candle is itself an energetic bullish leg. Tested on the MSS bar itself, because the displacement candle is usually the third leg of its own gap."],
  ["6", "Retrace", "Price trades back into that gap on a later bar. Depth is tracked at its deepest, not at first touch."],
  ["7", "HL", "Reaccumulation: a confirmed pivot low above the protected low, reclaimed on the next candle. Risk trails up to that higher low here."],
  ["8", "BSL", "The draw on liquidity — the nearest unbroken pivot high above price carrying a cluster of equal highs, scanned across forty bars. This is the target."],
  ["9", "Armed", "Compression into the draw: consecutive higher lows, no break of the level, and price within 3% below it."],
  ["10", "Trigger", "CISD — a bullish close above the OPEN of the first candle of the most recent bearish run. The whole down leg has been undone in one move."],
  ["11", "Ignition", "A close through the BSL level with displacement. The expansion the rest of the ladder was waiting for."],
];

const COMPONENTS: [string, number, string][] = [
  ["State", 12, "Progression along the ladder. Deliberately a minority of the score — every other component is already gated on reaching a state, so a tall state weight charges twice for the same evidence."],
  ["Displacement", 14, "How far the displacement body exceeded the three bodies before it."],
  ["Entry (P/D + OTE)", 14, "Where in the dealing range the entry the setup OFFERED sat — the deepest discount reached since structure shifted, not where price is now. Full marks inside the 0.62-0.79 OTE band, most of the marks anywhere in discount, near zero if it never pulled back."],
  ["FVG Quality", 10, "Gap size as a percentage of price. Bigger imbalance, stronger void."],
  ["BSL Cluster", 10, "How many equal highs rest at the draw. Discounted heavily if price has already cleared it."],
  ["Compression", 10, "Consecutive higher lows and contracting ranges, measured at the bar the setup reached its current state — not at today's unrelated tail."],
  ["Retrace Depth", 8, "How deep into the FVG price traded. 50-75% is the goldilocks fill."],
  ["Coherence", 8, "Bars from the raid to the current state. Budgets are per-timeframe."],
  ["Invalidation", 8, "Distance to the protected low, scored as a BAND (1.5-5% ideal). Precision is the edge; a 12% stop is more risk for the same target, not more safety."],
  ["Recency", 6, "How recently the reported state was actually reached."],
];

export default function ICTGuidePage() {
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sidebar TOC */}
      <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:h-fit lg:w-52">
        <Link
          href="/prerun/ict-daily"
          className="mb-4 flex items-center gap-1.5 text-sm text-[#888] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to scanner
        </Link>
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="rounded px-2 py-1 text-left text-sm text-[#888] hover:bg-[#1a1a1a] hover:text-white"
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Body */}
      <div className="min-w-0 flex-1 space-y-10 pb-16">
        <header>
          <h1 className="text-2xl font-bold text-white">ICT Pre-Expansion Scanner — Guide</h1>
          <p className="mt-2 text-sm text-[#888]">
            A price-action state machine built on raw candle relationships. No moving
            averages, no oscillators, no volume.
          </p>
        </header>

        <Section id="premise" title="The Premise" icon={<Target className="h-5 w-5 text-cyan-400" />}>
          <p>
            The scanner looks for one specific sequence: price takes out a pool of sell-side
            liquidity, reverses hard enough to break its own structure, leaves an imbalance
            behind, retraces into that imbalance, reaccumulates, and then compresses toward
            an obvious pool of buy-side liquidity above. The trade is the expansion into
            that pool.
          </p>
          <p>
            Everything on the page is derived from OHLC. Nothing is smoothed, and nothing
            looks ahead — the engine walks the series bar by bar and reports the state as of
            the last one.
          </p>
          <p className="rounded border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-amber-200/90">
            <strong>Long setups only.</strong> This engine models the bullish half of the
            framework. There is no bearish mirror — no buy-side raid, bearish MSS, or
            sell-side draw. In a downtrend it will keep finding long setups and can say
            nothing at all about the other side of the tape. Read the HTF column before
            anything else.
          </p>
        </Section>

        <Section id="glossary" title="Glossary" icon={<BookOpen className="h-5 w-5 text-violet-400" />}>
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              ["SSL", "Sell-side liquidity — resting stops below a pool of roughly equal lows."],
              ["BSL", "Buy-side liquidity — resting stops above a pool of roughly equal highs. The scanner's target."],
              ["MSS", "Market structure shift — the first close above the high that defined the prior downswing."],
              ["FVG", "Fair value gap. A three-candle imbalance price tends to return to."],
              ["CISD", "Change in state of delivery — a close above the open of the candle that began the last bearish leg."],
              ["Protected low", "The invalidation level. Starts at the raid low, trails to the reaccumulation low once a higher low confirms."],
              ["Dealing range", "Raid low to the highest high made since. Premium/discount are measured against it."],
              ["OTE", "Optimal trade entry — the 0.62-0.79 retracement band of that range."],
            ].map(([term, def]) => (
              <div key={term} className="rounded border border-[#2a2a2a] bg-[#141414] px-3 py-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-white">{term}</dt>
                <dd className="mt-0.5 text-xs text-[#888]">{def}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="ladder" title="The 11-State Ladder" icon={<Layers className="h-5 w-5 text-blue-400" />}>
          <p>
            States are strictly ordered — a setup cannot reach BSL without having passed
            through MSS. A single candle can satisfy several steps at once, and often does:
            the displacement candle is frequently also the MSS and the third leg of the FVG.
          </p>
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#141414] text-[#888]">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">What it means</th>
                </tr>
              </thead>
              <tbody>
                {LADDER.map(([n, label, desc]) => (
                  <tr key={n} className="border-t border-[#1a1a1a] align-top">
                    <td className="px-3 py-2 font-mono text-[#666]">{n}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-white">{label}</td>
                    <td className="px-3 py-2 text-[#888]">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <strong className="text-white">Invalidation.</strong> Two things kill a setup: a
            close at or below the protected low, and a close below the floor of the FVG. The
            second matters — a bullish gap closed through has inverted and is resistance
            now, and waiting for the protected low (often far below) to break means scoring a
            dead idea for weeks.
          </p>
          <p>
            When a setup breaks, the engine resets and starts hunting again. The page reports
            the <em>live</em> state, and shows the earlier break as a red <code className="rounded bg-[#1a1a1a] px-1">Broke Nb</code> flag.
          </p>
        </Section>

        <Section id="htf" title="Higher-Timeframe Bias" icon={<BarChart3 className="h-5 w-5 text-green-400" />}>
          <p>
            The framework is bias first, then the array, then the entry. The HTF column reads
            the daily and weekly structure and reports one of three states:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li><span className="text-green-400">HTF ✓ (ALIGNED)</span> — daily or weekly has already shifted structure. The setup runs with the tide.</li>
            <li><span className="text-[#888]">HTF ~ (NEUTRAL)</span> — a swing timeframe has raided but structure has not flipped yet.</li>
            <li><span className="text-red-400">HTF ✗ (COUNTER)</span> — no bullish structure on either swing chart. An intraday long here is fighting the higher timeframe.</li>
          </ul>
          <p>
            Bias is a <strong className="text-white">gate, not a score adjustment</strong>. It
            decides whether a row counts as tradeable; it never moves the score, so scores
            stay comparable across regimes and across backtests.
          </p>
        </Section>

        <Section id="premium-discount" title="Premium / Discount and OTE" icon={<Zap className="h-5 w-5 text-amber-400" />}>
          <p>
            The dealing range runs from the raid low to the highest high made since. Its
            midpoint is equilibrium. Buying below equilibrium is discount; buying above it is
            premium.
          </p>
          <p>
            The <code className="rounded bg-[#1a1a1a] px-1">OTE</code> badge means price is in
            the 0.62-0.79 retracement band of that leg — the deepest part of discount that
            still respects structure. <code className="rounded bg-[#1a1a1a] px-1">Disc</code> is
            discount outside that band; <code className="rounded bg-[#1a1a1a] px-1">Prem</code> is
            the wrong half of the range.
          </p>
          <p className="text-[#888]">
            Note this is a different measurement from Retrace Depth. Depth grades how far into
            the <em>gap</em> price traded; entry quality grades where in the{" "}
            <em>whole leg</em> the entry sat. A setup can be mid-gap and still be in premium.
          </p>
          <p className="rounded border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-[#888]">
            <strong className="text-white">The badge and the score read different moments.</strong>{" "}
            OTE / Disc / Prem describe where price is <em>right now</em>. The Entry score grades
            the deepest discount the setup offered since structure shifted. They diverge on
            purpose: an armed setup has compressed to within 3% of its draw, so it is in premium
            by construction — scoring it on current position would zero out every state this page
            exists to surface. A <code className="rounded bg-[#1a1a1a] px-1">Prem</code> badge
            beside a high Entry score means the discount entry has already gone.
          </p>
        </Section>

        <Section id="scoring" title="Score Components" icon={<BarChart3 className="h-5 w-5 text-[#5ba3e6]" />}>
          <p>Ten components, 100 points. Expand any row on the scanner to see the split.</p>
          <div className="overflow-x-auto rounded-lg border border-[#2a2a2a]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#141414] text-[#888]">
                <tr>
                  <th className="px-3 py-2 font-medium">Component</th>
                  <th className="px-3 py-2 font-medium">Max</th>
                  <th className="px-3 py-2 font-medium">What it measures</th>
                </tr>
              </thead>
              <tbody>
                {COMPONENTS.map(([label, max, desc]) => (
                  <tr key={label} className="border-t border-[#1a1a1a] align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-white">{label}</td>
                    <td className="px-3 py-2 font-mono text-[#666]">{max}</td>
                    <td className="px-3 py-2 text-[#888]">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <strong className="text-white">Score and State answer different questions.</strong>{" "}
            State is where in the sequence the setup is; Score is how good the evidence is.
            A coiled name in Retrace can outscore a sloppy one in Armed.
          </p>
        </Section>

        <Section id="timeframes" title="Timeframes and Confluence" icon={<Layers className="h-5 w-5 text-purple-400" />}>
          <p>
            Four timeframes in two families: <strong className="text-white">intraday</strong>{" "}
            (1h, 4h) and <strong className="text-white">swing</strong> (1d, 1wk).
          </p>
          <p>
            The 4h candles are built by bucketing hourly bars <em>within a session</em>, never
            across days — a 6.5-hour RTH day yields two 4h candles, not one and a bit of the
            next. 8h and 12h are not offered because neither can be formed from a 6.5-hour
            session without merging days.
          </p>
          <p>
            Confluence blends the best member of <em>each family</em> once, plus a bonus per
            additional armed family. 1h and 4h are the same chart at two resolutions, so
            counting them separately would mean counting one dataset twice.
          </p>
        </Section>

        <Section id="reading" title="Reading the Page" icon={<Target className="h-5 w-5 text-cyan-400" />}>
          <ul className="list-inside list-disc space-y-1.5">
            <li><strong className="text-white">Top Picks</strong> — armed or better, HTF aligned, fresh, not extended, ranked by reward-to-risk. Start here.</li>
            <li><strong className="text-white">R:R</strong> — (BSL target − price) ÷ (price − protected low). Blank when the draw is behind price.</li>
            <li><strong className="text-white">Age</strong> — bars since the state was reached. A state persists until it advances or breaks, so a 40-bar-old &quot;Armed&quot; is a stale one.</li>
            <li><strong className="text-white">Dist BSL</strong> — distance to the draw. Shown green with a <code className="rounded bg-[#1a1a1a] px-1">+</code> once price has cleared it.</li>
            <li><strong className="text-white">Tradeable</strong> — past MSS, HTF not counter, state fresh, not chasing. The toggle above the table filters to these.</li>
            <li><strong className="text-white">Streak / Delta</strong> — consecutive days on the board, and today&apos;s score change.</li>
          </ul>
        </Section>

        <Section id="limits" title="Known Limits" icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}>
          <ul className="list-inside list-disc space-y-1.5">
            <li><strong className="text-white">No short side.</strong> See the note at the top. This is the biggest gap between the scanner and the framework.</li>
            <li><strong className="text-white">No session or killzone logic.</strong> The framework is deeply clock-anchored — London open, New York AM, the judas swing. The scanner reads structure only.</li>
            <li><strong className="text-white">The draw is same-timeframe.</strong> BSL is the nearest unbroken pivot cluster in a 40-bar window on the chart being scanned, not a prior-day or prior-week high.</li>
            <li><strong className="text-white">Order blocks and breakers are not modelled.</strong> The only PD array the engine tracks is the fair value gap.</li>
            <li><strong className="text-white">It is a scanner, not a signal.</strong> Everything here narrows a 460-name universe to a shortlist. The chart still has to be read.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
