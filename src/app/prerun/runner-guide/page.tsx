"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Rocket,
  Target,
  Shield,
  AlertTriangle,
  Layers,
  BarChart3,
  BookOpen,
  ArrowLeft,
  Zap,
  Activity,
} from "lucide-react";

const SECTIONS = [
  { id: "what-is-runner", label: "What Is a Runner?" },
  { id: "runner-lifecycle", label: "Lifecycle" },
  { id: "entry-process", label: "4-Stage Entry" },
  { id: "pump-dump", label: "Pump Checklist" },
  { id: "confluence-rules", label: "Confluence" },
  { id: "scanner-combos", label: "Scanner Combos" },
  { id: "playbook", label: "Playbook" },
  { id: "risk-management", label: "Risk Mgmt" },
];

export default function RunnerGuidePage() {
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
              href="/prerun"
              className="block rounded-md px-3 py-1.5 text-xs font-medium text-[#5ba3e6] transition-colors hover:bg-[#1a1a1a]"
            >
              &larr; Back to Pre-Run
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
              <Rocket className="h-8 w-8 text-violet-400" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  Runner Detection Framework
                </h1>
                <p className="mt-1 text-[#a0a0a0]">
                  How nine scanners combine to detect stocks before they make their move.
                </p>
              </div>
            </div>
            <Link
              href="/prerun"
              className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444] shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Pre-Run
            </Link>
          </div>
        </section>

        {/* Section 1: What Is a Runner? */}
        <Section
          id="what-is-runner"
          title="What Is a Runner?"
          icon={<Rocket className="h-5 w-5 text-violet-400" />}
        >
          <p>
            A <strong className="text-white">runner</strong> is a stock that makes a sustained,
            multi-day move of 20%+ from a well-defined accumulation base. Unlike gap-and-fade
            momentum plays, runners have institutional backing, structural confirmation, and
            identifiable entry points before the move begins.
          </p>

          <SubSection title="Runner Characteristics">
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Deep pullback origin</strong> &mdash; 20-50% from ATH, seller exhaustion visible</li>
              <li><strong className="text-white">Accumulation phase</strong> &mdash; Volume dries up, OBV diverges positive, range tightens</li>
              <li><strong className="text-white">Structural transition</strong> &mdash; Higher lows form, Change of Character (ChoCH) confirmed</li>
              <li><strong className="text-white">Sector tailwind</strong> &mdash; Stock&rsquo;s sector is in IMPROVING or LEADING quadrant</li>
              <li><strong className="text-white">Institutional participation</strong> &mdash; Volume expands on breakout days, not before</li>
              <li><strong className="text-white">Multi-scanner detection</strong> &mdash; Shows up on 3+ independent scanning engines</li>
            </ul>
          </SubSection>

          <SubSection title="Runners vs Momentum Plays">
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Dimension</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Runner</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Momentum Play</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Holding period</td>
                    <td className="px-3 py-1.5">Days to weeks</td>
                    <td className="px-3 py-1.5">Minutes to hours</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Entry timing</td>
                    <td className="px-3 py-1.5">Before or at breakout</td>
                    <td className="px-3 py-1.5">After breakout (chase)</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Volume pattern</td>
                    <td className="px-3 py-1.5">Quiet base, then expansion</td>
                    <td className="px-3 py-1.5">Already extended volume</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Risk/reward</td>
                    <td className="px-3 py-1.5">Defined invalidation level</td>
                    <td className="px-3 py-1.5">Wide stops or none</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">Detection</td>
                    <td className="px-3 py-1.5">Multi-scanner confluence</td>
                    <td className="px-3 py-1.5">Price/volume screen only</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>
        </Section>

        {/* Section 2: Runner Lifecycle */}
        <Section
          id="runner-lifecycle"
          title="Runner Lifecycle"
          icon={<Activity className="h-5 w-5 text-violet-400" />}
        >
          <p>
            Every runner goes through six identifiable stages. Each stage maps to specific scanners
            that detect it. The goal is to identify the stock in stages 2-4 and enter before stage 5.
          </p>

          <SubSection title="Stage 1: Markdown (Decline)">
            <p>
              Stock is in an active downtrend &mdash; lower highs, lower lows, expanding
              sell volume. <strong className="text-white">No scanner triggers at this stage.</strong> The
              Transition scanner classifies this as MARKDOWN state and filters it out.
            </p>
            <p className="mt-2 text-[#888]">
              Scanner mapping: None (filtered out by all scanners)
            </p>
          </SubSection>

          <SubSection title="Stage 2: Seller Exhaustion">
            <p>
              Down-volume begins declining. RSI recovers from oversold. Candle bodies shrink as
              sellers lose conviction. The stock is still making lower lows, but the pace slows.
            </p>
            <p className="mt-2 text-[#888]">
              Scanner mapping: <strong className="text-white">Inflection</strong> (SE component detects exhaustion),
              <strong className="text-white"> Transition</strong> (SELLING_EXHAUSTION state)
            </p>
          </SubSection>

          <SubSection title="Stage 3: Accumulation">
            <p>
              Price enters a range. OBV diverges positive (smart money buying). Volume dries up
              as weak hands finish selling. This is the stealth accumulation phase &mdash; institutions
              build positions quietly.
            </p>
            <p className="mt-2 text-[#888]">
              Scanner mapping: <strong className="text-white">Inflection</strong> (VC + BE components),
              <strong className="text-white"> Transition</strong> (ACCUMULATION / DEMAND_INCREASING state),
              <strong className="text-white"> Setup</strong> (criteria M2 + OBV divergence in Stealth/Early+ presets)
            </p>
          </SubSection>

          <SubSection title="Stage 4: Structural Confirmation">
            <p>
              Higher lows form. Change of Character (ChoCH) confirmed when price closes above the
              most recent swing high. This is the strongest signal &mdash; the stock&rsquo;s internal
              structure has shifted from bearish to bullish.
            </p>
            <p className="mt-2 text-[#888]">
              Scanner mapping: <strong className="text-white">Transition</strong> (BULLISH_CHOCH / HIGHER_LOW_FORMATION / BULLISH_BOS states, ARMED/READY alert),
              <strong className="text-white"> Inflection</strong> (IP component, STARTER trade read),
              <strong className="text-white"> VCP</strong> (compression detected if range is tightening)
            </p>
          </SubSection>

          <SubSection title="Stage 5: Breakout (Runner Begins)">
            <p>
              Volume expands as price breaks above the base range. The Transition scanner fires
              TRIGGERED alert. Institutional scanner picks up the volume signature. This is where
              the stock transitions from &ldquo;setup&rdquo; to &ldquo;runner.&rdquo;
            </p>
            <p className="mt-2 text-[#888]">
              Scanner mapping: <strong className="text-white">Transition</strong> (TRIGGERED alert, EARLY_EXPANSION state),
              <strong className="text-white"> Institutional</strong> (detects volume + momentum signature),
              <strong className="text-white"> Setup</strong> (Leading/Pullback presets),
              <strong className="text-white"> Rotation</strong> (if sector is rotating, flags as LEADER)
            </p>
          </SubSection>

          <SubSection title="Stage 6: Sustained Run / Extension">
            <p>
              Multi-day trending move with healthy pullbacks. Eventually becomes overextended.
              The goal is to hold through this phase, adding on pullbacks, and exit when
              extension risk rises.
            </p>
            <p className="mt-2 text-[#888]">
              Scanner mapping: <strong className="text-white">Transition</strong> (SUSTAINED_MARKUP / EXTENDED state),
              <strong className="text-white"> Setup</strong> (extension risk flag),
              <strong className="text-white"> Inflection</strong> (ADD_ON trade read during pullbacks)
            </p>
          </SubSection>
        </Section>

        {/* Section 3: 4-Stage Entry Process */}
        <Section
          id="entry-process"
          title="4-Stage Entry Process"
          icon={<Target className="h-5 w-5 text-violet-400" />}
        >
          <p>
            Don&rsquo;t jump to stock selection. Follow these four levels in order &mdash; each
            narrows the funnel so you only spend time on the highest-conviction setups.
          </p>

          <SubSection title="Level 1: Discovery (What to Look At)">
            <p className="mb-2">
              Use the nightly summary Telegram message or check the daily scanner pages each morning.
              Focus on stocks appearing on <strong className="text-white">multiple scanners</strong>.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Source</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">What to Look For</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Route</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Nightly Summary</td>
                    <td className="px-3 py-1.5">Confluence tiers 3/5 or higher</td>
                    <td className="px-3 py-1.5 text-[#888]">Telegram</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Inflection Daily</td>
                    <td className="px-3 py-1.5">STARTER or ADD_ON reads with TRANS badge</td>
                    <td className="px-3 py-1.5 text-[#888]">/prerun/inflection-daily</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Transition Daily</td>
                    <td className="px-3 py-1.5">TRIGGERED or READY alerts with INF badge</td>
                    <td className="px-3 py-1.5 text-[#888]">/prerun/transition-daily</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">High Conviction Filter</td>
                    <td className="px-3 py-1.5">Toggle on either page &mdash; stocks on BOTH scanners</td>
                    <td className="px-3 py-1.5 text-[#888]">Button on filter bar</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Level 2: Confirmation (Is It Real?)">
            <p className="mb-2">
              For each discovery candidate, check these confirmation signals:
            </p>
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Sector quadrant</strong> &mdash; Is the sector in IMPROVING or LEADING? (Check quadrant badge next to sector name)</li>
              <li><strong className="text-white">Institutional backing</strong> &mdash; Does the INST badge appear? What classification? (ACCUM or LEADER = confirmed)</li>
              <li><strong className="text-white">Cross-scanner overlap</strong> &mdash; How many independent scanners flag this ticker? (Check nightly confluence tier)</li>
              <li><strong className="text-white">Streak persistence</strong> &mdash; Has the stock appeared for 2+ consecutive days? (Streak badge in Days column)</li>
              <li><strong className="text-white">Score trajectory</strong> &mdash; Is the delta positive? (Rising score = strengthening setup)</li>
            </ul>
          </SubSection>

          <SubSection title="Level 3: Entry (When to Act)">
            <p className="mb-2">
              Timing the entry based on scanner signals:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Signal</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Action</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Position Size</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Transition ARMED + Inflection STARTER</td>
                    <td className="px-3 py-1.5">Build starter position (1/3 size)</td>
                    <td className="px-3 py-1.5">0.5-1% risk</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Transition TRIGGERED + volume expansion</td>
                    <td className="px-3 py-1.5">Add to position (2/3 size)</td>
                    <td className="px-3 py-1.5">0.5-1% risk</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">Inflection ADD_ON + pullback to support</td>
                    <td className="px-3 py-1.5">Full position (3/3 size)</td>
                    <td className="px-3 py-1.5">0.5% risk</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Level 4: Add / Hold / Exit">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Add on pullback</strong> &mdash; Stock pulls back to the trigger/breakout level, Inflection reads ADD_ON, Transition still TRIGGERED</li>
              <li><strong className="text-white">Hold</strong> &mdash; Stock trending higher, Transition in SUSTAINED_MARKUP, score stable or rising</li>
              <li><strong className="text-white">Tighten stop</strong> &mdash; Transition moves to EXTENDED, or delta turns negative for 2+ days</li>
              <li><strong className="text-white">Exit</strong> &mdash; Price breaks below Transition invalidation level, or stock drops off all scanners (streak breaks)</li>
            </ul>
          </SubSection>
        </Section>

        {/* Section 4: Pump-and-Dump Checklist */}
        <Section
          id="pump-dump"
          title="Pump-and-Dump Checklist"
          icon={<AlertTriangle className="h-5 w-5 text-violet-400" />}
        >
          <p>
            Not every stock on multiple scanners is a legitimate runner. Use these seven filters
            to distinguish real institutional accumulation from manufactured moves:
          </p>

          <SubSection title="7-Point Filter">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">#</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Check</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Red Flag If</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Where to Check</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">1</td>
                    <td className="px-3 py-1.5">Market cap</td>
                    <td className="px-3 py-1.5">Below $8B (below quality gate)</td>
                    <td className="px-3 py-1.5 text-[#888]">Quality gate auto-filters</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">2</td>
                    <td className="px-3 py-1.5">Dollar volume</td>
                    <td className="px-3 py-1.5">Below $100M/day (illiquid)</td>
                    <td className="px-3 py-1.5 text-[#888]">Quality gate auto-filters</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">3</td>
                    <td className="px-3 py-1.5">Volume pattern</td>
                    <td className="px-3 py-1.5">Spike without base (no dry-up period first)</td>
                    <td className="px-3 py-1.5 text-[#888]">Inflection VC score, Transition Acc score</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">4</td>
                    <td className="px-3 py-1.5">Institutional presence</td>
                    <td className="px-3 py-1.5">No INST badge, or INST classification is AVOID</td>
                    <td className="px-3 py-1.5 text-[#888]">Flags column (INST badge)</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">5</td>
                    <td className="px-3 py-1.5">Sector alignment</td>
                    <td className="px-3 py-1.5">Sector in LAGGING quadrant (no tailwind)</td>
                    <td className="px-3 py-1.5 text-[#888]">Quadrant badge next to sector name</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">6</td>
                    <td className="px-3 py-1.5">Score composition</td>
                    <td className="px-3 py-1.5">High overall but only 1-2 sub-scores contributing</td>
                    <td className="px-3 py-1.5 text-[#888]">Sub-score mini bars (SE, VC, BE, etc.)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">7</td>
                    <td className="px-3 py-1.5">Extension risk</td>
                    <td className="px-3 py-1.5">EXT flag present, or already 40%+ from base</td>
                    <td className="px-3 py-1.5 text-[#888]">EXT flag in Flags column</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="The Kill Rule">
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3">
              <p className="text-xs font-semibold text-red-400 mb-1">STOP &mdash; DO NOT ENTER IF:</p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-[#c0c0c0]">
                <li>3+ red flags from the checklist above</li>
                <li>Stock only appears on ONE scanner (no cross-validation)</li>
                <li>Institutional classification is AVOID or DISTRIBUTION</li>
                <li>Sector quadrant is LAGGING with negative acceleration</li>
              </ul>
            </div>
          </SubSection>
        </Section>

        {/* Section 5: Confluence Rules */}
        <Section
          id="confluence-rules"
          title="Confluence Rules"
          icon={<Layers className="h-5 w-5 text-violet-400" />}
        >
          <p>
            The nightly summary assigns a confluence tier (1/5 to 5/5) based on how many
            independent scanners detect a stock. Higher tiers have dramatically better
            hit rates.
          </p>

          <SubSection title="5 Confluence Scanners">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Scanner</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Label</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">What It Detects</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Best For</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Setup (PreRun)</td>
                    <td className="px-3 py-1.5">Setup</td>
                    <td className="px-3 py-1.5">Base breakouts from deep pullbacks</td>
                    <td className="px-3 py-1.5">Lifecycle stages 3-5</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Inflection</td>
                    <td className="px-3 py-1.5">Inflect</td>
                    <td className="px-3 py-1.5">Accumulation cycle transitions</td>
                    <td className="px-3 py-1.5">Lifecycle stages 2-4</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">VCP</td>
                    <td className="px-3 py-1.5">VCP</td>
                    <td className="px-3 py-1.5">Volatility contraction patterns</td>
                    <td className="px-3 py-1.5">Lifecycle stage 4 (compression)</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Institutional</td>
                    <td className="px-3 py-1.5">Inst</td>
                    <td className="px-3 py-1.5">Institutional-quality runners</td>
                    <td className="px-3 py-1.5">Lifecycle stages 5-6</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">PreRunner (Rot)</td>
                    <td className="px-3 py-1.5">Rot</td>
                    <td className="px-3 py-1.5">Sector rotation leaders/turnarounds</td>
                    <td className="px-3 py-1.5">Lifecycle stages 3-5 (sector context)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Badge-Only Scanners (Not Counted)">
            <p className="mb-2">
              Four additional scanners provide supplementary context as badges in the nightly summary
              but are <strong className="text-white">not counted</strong> toward the confluence tier:
            </p>
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">QFE</strong> &mdash; Quality-Factor-Entry rating (derived from PreRun, no new information)</li>
              <li><strong className="text-white">Setup4h</strong> &mdash; 4h-candle variant of Setup (same methodology, different timeframe)</li>
              <li><strong className="text-white">Transition</strong> &mdash; Market structure transitions (trial scanner, comparing against Inflection)</li>
              <li><strong className="text-white">INF WATCH</strong> &mdash; Inflection WATCH reads (low conviction, badge only)</li>
            </ul>
          </SubSection>

          <SubSection title="Confluence Tier Interpretation">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Tier</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Meaning</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Action</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">5/5</td>
                    <td className="px-3 py-1.5">All five scanners agree &mdash; extremely rare</td>
                    <td className="px-3 py-1.5">Highest conviction, full position sizing</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">4/5</td>
                    <td className="px-3 py-1.5">Four scanners agree &mdash; strong signal</td>
                    <td className="px-3 py-1.5">High conviction, standard position</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">3/5</td>
                    <td className="px-3 py-1.5">Three scanners agree &mdash; solid setup</td>
                    <td className="px-3 py-1.5">Moderate conviction, reduced size or wait for confirmation</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">2/5</td>
                    <td className="px-3 py-1.5">Two scanners agree &mdash; developing</td>
                    <td className="px-3 py-1.5">Watchlist only, wait for more confluence</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">1/5</td>
                    <td className="px-3 py-1.5">Single scanner &mdash; unconfirmed</td>
                    <td className="px-3 py-1.5">Monitor, do not act</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>
        </Section>

        {/* Section 6: Scanner Combinations */}
        <Section
          id="scanner-combos"
          title="Scanner Combinations"
          icon={<Zap className="h-5 w-5 text-violet-400" />}
        >
          <p>
            Certain scanner combinations are more powerful than others. These are the
            highest-signal pairings for runner detection:
          </p>

          <SubSection title="Best Combinations for Early Detection">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Combination</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Signal</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Lifecycle Stage</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Inflection STARTER + Transition ARMED</td>
                    <td className="px-3 py-1.5">Both scanners detect the accumulation-to-markup shift independently</td>
                    <td className="px-3 py-1.5">Stage 3-4 (earliest actionable)</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Transition TRIGGERED + Institutional</td>
                    <td className="px-3 py-1.5">Structural breakout confirmed by institutional volume signature</td>
                    <td className="px-3 py-1.5">Stage 5 (breakout confirmation)</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Setup + VCP + Rotation</td>
                    <td className="px-3 py-1.5">Deep pullback + compression + sector tailwind = coiled spring</td>
                    <td className="px-3 py-1.5">Stage 4 (maximum compression)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">Inflection ADD_ON + Transition SUSTAINED_MARKUP</td>
                    <td className="px-3 py-1.5">Confirmed runner pulling back to add-on level</td>
                    <td className="px-3 py-1.5">Stage 6 (add on pullback)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Sector Context Amplifiers">
            <p className="mb-2">
              Any of the above combinations gains conviction when sector context confirms:
            </p>
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Sector quadrant IMPROVING</strong> &mdash; Early institutional accumulation, best risk/reward window</li>
              <li><strong className="text-white">Sector quadrant LEADING</strong> &mdash; Momentum confirmed, trend continuation likely</li>
              <li><strong className="text-white">Rotation ENTER signal</strong> &mdash; Active sector rotation detected with high conviction (check /rotation)</li>
              <li><strong className="text-white">Regime RISK_ON</strong> &mdash; Macro environment supports risk-taking (check /sectors/brief)</li>
            </ul>
          </SubSection>

          <SubSection title="Dangerous Combinations (Avoid)">
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3">
              <ul className="list-inside list-disc space-y-1 text-xs text-[#c0c0c0]">
                <li><strong className="text-white">Single scanner only + LAGGING sector</strong> &mdash; Fighting the tide</li>
                <li><strong className="text-white">Transition TRIGGERED + no Inflection/Setup</strong> &mdash; Structural breakout without accumulation base (false breakout risk)</li>
                <li><strong className="text-white">Institutional AVOID + any other scanner</strong> &mdash; Smart money is selling, not buying</li>
                <li><strong className="text-white">High score + declining delta for 3+ days</strong> &mdash; Deteriorating setup, score inflection turning negative</li>
              </ul>
            </div>
          </SubSection>
        </Section>

        {/* Section 7: Playbook */}
        <Section
          id="playbook"
          title="Daily Playbook"
          icon={<BarChart3 className="h-5 w-5 text-violet-400" />}
        >
          <p>
            A practical daily workflow for using the scanner system to find runners:
          </p>

          <SubSection title="Pre-Market (8:00 AM - 9:30 AM ET)">
            <ol className="list-inside list-decimal space-y-1.5 text-[#c0c0c0]">
              <li>Check Telegram nightly summary &mdash; note any 3/5+ confluence tickers</li>
              <li>Visit <strong className="text-white">/sectors/brief</strong> &mdash; check regime, posture, risk flags. If DEFENSIVE or RISK_OFF, reduce aggression</li>
              <li>Visit <strong className="text-white">/sectors</strong> &mdash; identify IMPROVING and LEADING sectors</li>
              <li>Check <strong className="text-white">/api/premarket</strong> futures &mdash; confirm bias direction matches your thesis</li>
            </ol>
          </SubSection>

          <SubSection title="Scanner Review (9:30 AM - 10:00 AM ET)">
            <ol className="list-inside list-decimal space-y-1.5 text-[#c0c0c0]">
              <li>Open <strong className="text-white">/prerun/inflection-daily</strong> &mdash; filter STARTER/ADD_ON, look for TRANS + INST badges</li>
              <li>Open <strong className="text-white">/prerun/transition-daily</strong> &mdash; check TRIGGERED/READY, look for INF + INST badges</li>
              <li>Toggle <strong className="text-white">High Conviction</strong> on either page &mdash; these are your top candidates</li>
              <li>Cross-reference candidates with sector quadrant badges &mdash; prioritize stocks in IMPROVING/LEADING sectors</li>
              <li>Run pump-and-dump checklist on each candidate</li>
            </ol>
          </SubSection>

          <SubSection title="During Market Hours">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Watch for trigger levels</strong> &mdash; Transition ARMED stocks have defined trigger prices in the expanded row</li>
              <li><strong className="text-white">Scale in on confirmation</strong> &mdash; Don&rsquo;t front-run; wait for price to cross the trigger with volume</li>
              <li><strong className="text-white">Set invalidation stops</strong> &mdash; Use the invalidation level from Transition&rsquo;s expanded row</li>
              <li><strong className="text-white">Monitor existing positions</strong> &mdash; Check if scanner scores are stable/rising or deteriorating</li>
            </ul>
          </SubSection>

          <SubSection title="Post-Market (After 10:00 PM ET)">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Cron jobs finish by ~11 PM ET. New data appears on all daily pages</li>
              <li>Check Telegram nightly summary for updated confluence tiers</li>
              <li>Review dropped tickers section &mdash; if your position dropped off a scanner, investigate why</li>
              <li>Plan next day&rsquo;s watchlist from high-conviction candidates</li>
            </ul>
          </SubSection>
        </Section>

        {/* Section 8: Risk Management */}
        <Section
          id="risk-management"
          title="Risk Management"
          icon={<Shield className="h-5 w-5 text-violet-400" />}
        >
          <p>
            Position sizing and risk management rules for the runner detection framework:
          </p>

          <SubSection title="Position Sizing by Conviction">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Conviction Level</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Confluence</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Max Risk per Trade</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Max Portfolio Allocation</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Maximum</td>
                    <td className="px-3 py-1.5">4-5/5 + High Conviction filter + IMPROVING sector</td>
                    <td className="px-3 py-1.5">1.5% of portfolio</td>
                    <td className="px-3 py-1.5">8-10%</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Standard</td>
                    <td className="px-3 py-1.5">3/5 + sector in LEADING/IMPROVING</td>
                    <td className="px-3 py-1.5">1% of portfolio</td>
                    <td className="px-3 py-1.5">5-7%</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Starter</td>
                    <td className="px-3 py-1.5">2/5 + developing signals</td>
                    <td className="px-3 py-1.5">0.5% of portfolio</td>
                    <td className="px-3 py-1.5">3-4%</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">Watchlist</td>
                    <td className="px-3 py-1.5">1/5 or no sector confirmation</td>
                    <td className="px-3 py-1.5">No position</td>
                    <td className="px-3 py-1.5">0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Stop Placement">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Initial stop</strong> &mdash; Transition invalidation level (structural stop below swing low)</li>
              <li><strong className="text-white">Breakeven stop</strong> &mdash; Move to entry price once stock moves 1R in your favor</li>
              <li><strong className="text-white">Trailing stop</strong> &mdash; Trail below the most recent higher low on daily timeframe</li>
              <li><strong className="text-white">Scanner-based stop</strong> &mdash; Exit if stock drops from all scanners for 2 consecutive days</li>
            </ul>
          </SubSection>

          <SubSection title="Portfolio-Level Rules">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3">
              <ul className="list-inside list-disc space-y-1 text-xs text-[#c0c0c0]">
                <li><strong className="text-white">Max open positions:</strong> 5-8 (never more than you can monitor)</li>
                <li><strong className="text-white">Max sector concentration:</strong> 3 positions in same sector</li>
                <li><strong className="text-white">Max daily risk:</strong> 3% of portfolio across all positions</li>
                <li><strong className="text-white">Correlation check:</strong> Don&rsquo;t stack positions in highly correlated stocks (same sub-sector)</li>
                <li><strong className="text-white">Regime override:</strong> If posture turns DEFENSIVE, reduce all positions by 50%. If CASH, close all.</li>
              </ul>
            </div>
          </SubSection>

          <SubSection title="When to Not Trade">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Regime is RISK_OFF + 3 or more risk flags (check /sectors/brief)</li>
              <li>VIX spike above adaptive upper bound</li>
              <li>No stocks pass the High Conviction filter on either scanner page</li>
              <li>Your open positions are already at maximum and all are working</li>
              <li>It&rsquo;s a major economic event day (FOMC, CPI, NFP) &mdash; wait for the reaction</li>
            </ul>
          </SubSection>
        </Section>

        {/* Back nav at bottom */}
        <div className="flex justify-center pt-4">
          <Link
            href="/prerun"
            className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-4 py-2 text-sm text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Pre-Run Scanner
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Helper Components ──

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
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-violet-400">{title}</p>
      <div className="text-sm text-[#c0c0c0]">{children}</div>
    </div>
  );
}
