"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Flame,
  Target,
  Layers,
  BarChart3,
  AlertTriangle,
  BookOpen,
  ArrowLeft,
  Zap,
  Shield,
  Crosshair,
} from "lucide-react";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "layers", label: "AI Layers" },
  { id: "scoring", label: "Scoring" },
  { id: "verdicts", label: "Verdicts" },
  { id: "misses", label: "Misses" },
  { id: "fire-drills", label: "Fire Drills" },
  { id: "using-scanner", label: "Using It" },
  { id: "finding-runners", label: "Runners" },
  { id: "limitations", label: "Limitations" },
];

export default function CatalystGuidePage() {
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
              href="/catalyst"
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
              <BookOpen className="h-8 w-8 text-red-400" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  AI Radar Guide
                </h1>
                <p className="mt-1 text-[#a0a0a0]">
                  How the AI infrastructure spike detector works, factor by factor.
                </p>
              </div>
            </div>
            <Link
              href="/catalyst"
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#a0a0a0] transition-colors hover:border-[#444] hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Scanner
            </Link>
          </div>
        </section>

        {/* Section 1: Overview */}
        <Section
          id="overview"
          title="What Does AI Radar Do?"
          icon={<Flame className="h-5 w-5 text-red-400" />}
        >
          <p>
            AI Radar identifies <strong className="text-white">AI infrastructure stocks</strong> that
            are setting up for a significant move — <em>before</em> the spike happens. It scans ~82 tickers across
            11 layers of the AI supply chain, scores each stock on 17 factors, and classifies them into
            actionable categories.
          </p>

          <SubSection title="The Pattern It Detects">
            <p>
              When a major AI demand catalyst appears (a hyperscaler increasing capex, a new chip announcement,
              an earnings beat from a key player), stocks across the AI supply chain spike in a predictable
              sequence: chip makers first, then servers and networking, then power and software. The scanner
              identifies which stocks in each layer are most likely to participate in the next wave.
            </p>
          </SubSection>

          <SubSection title="How It Works">
            <ol className="list-inside list-decimal space-y-1.5 text-[#c0c0c0]">
              <li>Scans a curated universe of ~78 AI infrastructure tickers</li>
              <li>Fetches real-time price, volume, short interest, and analyst data</li>
              <li>Scores each stock on <strong className="text-white">17 factors</strong> (max 100 pts)</li>
              <li>Classifies into <strong className="text-white">PRE-SPIKE</strong>, <strong className="text-white">WATCH</strong>, <strong className="text-white">MONITOR</strong>, or <strong className="text-white">MISS</strong></li>
              <li>Detects <strong className="text-white">fire drills</strong> when a peer stock just spiked</li>
              <li>Overlays an <strong className="text-white">event calendar</strong> (earnings, FOMC, OPEX)</li>
            </ol>
          </SubSection>

          <Tip>
            The scanner runs as a nightly cron job and sends a Telegram alert with the top candidates.
            You can also run it manually from the dashboard at any time.
          </Tip>
        </Section>

        {/* Section 2: AI Layers */}
        <Section
          id="layers"
          title="AI Infrastructure Layers"
          icon={<Layers className="h-5 w-5 text-red-400" />}
        >
          <p>
            The universe is organized into <strong className="text-white">11 layers</strong> of the AI supply chain.
            Each layer represents a different part of the infrastructure stack, and stocks within a layer tend to
            move together when a catalyst hits.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#333]">
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Layer</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">What It Covers</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Examples</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Sector ETF</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                <LayerRow layer="AI Chips" desc="GPU/accelerator designers" examples="NVDA, AMD, AVGO" etf="SMH" />
                <LayerRow layer="AI Servers" desc="Server OEMs and data center hardware" examples="DELL, HPE, SMCI" etf="IGV" />
                <LayerRow layer="AI Networking" desc="Data center networking equipment" examples="ANET, CSCO, JNPR" etf="IGV" />
                <LayerRow layer="AI Optics" desc="Optical transceivers and fiber" examples="COHR, LITE, CIEN" etf="SMH" />
                <LayerRow layer="AI Power" desc="Utilities serving data centers" examples="VST, CEG, NRG" etf="XLU" />
                <LayerRow layer="AI Builders" desc="Hyperscalers building AI infra" examples="MSFT, GOOG, AMZN" etf="IGV" />
                <LayerRow layer="AI Software" desc="AI platform and application companies" examples="AI, PLTR, SNOW" etf="IGV" />
                <LayerRow layer="Semi Equipment" desc="Chip manufacturing equipment" examples="AMAT, LRCX, KLAC" etf="SMH" />
                <LayerRow layer="Commodities" desc="Metals/materials for AI hardware" examples="FCX, NEM, SCCO" etf="XME" />
                <LayerRow layer="Defense AI" desc="AI applied to defense/government" examples="LMT, RTX, NOC" etf="ITA" />
                <LayerRow layer="Robotics" desc="Physical AI and automation" examples="ISRG, ROK, TER" etf="ROBO" />
              </tbody>
            </table>
          </div>

          <SubSection title="Tiers">
            <p>
              Each stock is assigned a <strong className="text-white">tier</strong> based on its significance
              to the AI theme:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Tier 1</strong> &mdash; Core AI plays (NVDA, MSFT, AVGO). Direct revenue from AI infrastructure.</li>
              <li><strong className="text-white">Tier 2</strong> &mdash; Strong AI exposure (DELL, ANET, VST). Clear AI tailwind but not pure-play.</li>
              <li><strong className="text-white">Tier 3</strong> &mdash; Indirect beneficiaries (FCX, JNPR, NEM). AI narrative but more tenuous connection.</li>
            </ul>
          </SubSection>

          <SubSection title="Peer Sympathy">
            <p>
              Within each layer, stocks are considered <strong className="text-white">peers</strong>. When one
              peer spikes 10%+ in 5 days, the scanner flags all other stocks in that layer as potential sympathy
              plays. This is one of the strongest signals — if DELL spikes on AI server demand, HPE and SMCI
              often follow.
            </p>
          </SubSection>
        </Section>

        {/* Section 3: Scoring */}
        <Section
          id="scoring"
          title="17-Factor Scoring Engine"
          icon={<BarChart3 className="h-5 w-5 text-red-400" />}
        >
          <p>
            Each stock is scored on 17 factors, with a raw maximum of <strong className="text-white">118 points</strong>.
            Scores are normalized to 0-100 based on a practical ceiling of 100 (accounting for mutual exclusivities between factors).
          </p>

          <div className="mt-4 space-y-3">
            <FactorCard
              name="Days to Catalyst"
              max={12}
              active
              description="Proximity to the next earnings report, FOMC meeting, OPEX, or other macro event. Closer = higher score."
              levels={[
                { range: "0-2 days", score: "12" },
                { range: "3-5 days", score: "10" },
                { range: "6-10 days", score: "8" },
                { range: "11-14 days", score: "6" },
                { range: "15-21 days", score: "4" },
                { range: "22-30 days", score: "2" },
              ]}
            />

            <FactorCard
              name="Mean Reversion"
              max={8}
              active
              description="YTD drawdown from highs. Beaten-down stocks have more explosive upside when a catalyst hits."
              levels={[
                { range: "YTD -40%+", score: "8" },
                { range: "YTD -30%", score: "6" },
                { range: "YTD -20%", score: "5" },
                { range: "YTD -10%", score: "3" },
              ]}
            />

            <FactorCard
              name="Momentum Breakout"
              max={7}
              active
              description="Price near 52-week high with increasing volume. Signals a breakout in progress."
              levels={[
                { range: "Within 5% of high + vol >1.5x", score: "7" },
                { range: "Within 5% of high", score: "4" },
                { range: "Within 10% + vol >1.5x", score: "5" },
                { range: "Within 10%", score: "3" },
              ]}
            />

            <FactorCard
              name="Short Interest"
              max={10}
              active
              description="Short interest as % of float. Higher SI means more potential fuel for a squeeze on positive news."
              levels={[
                { range: "30%+", score: "10" },
                { range: "20%", score: "~7" },
                { range: "10%", score: "~3" },
              ]}
            />

            <FactorCard
              name="Analyst Upside"
              max={8}
              active
              description="Gap between current price and mean analyst target. Large upside means consensus sees the stock as undervalued."
              levels={[
                { range: "50%+ upside", score: "8" },
                { range: "35% upside", score: "6" },
                { range: "20% upside", score: "4" },
                { range: "10% upside", score: "2" },
              ]}
            />

            <FactorCard
              name="Volume Ratio"
              max={10}
              active
              description="5-day average volume vs 20-day average. Accumulation signal — smart money loading before a move."
              levels={[
                { range: "3x+", score: "10" },
                { range: "2x", score: "5" },
                { range: "1.5x", score: "2.5" },
              ]}
            />

            <FactorCard
              name="RSI Position"
              max={8}
              active
              description="Relative Strength Index sweet spot. RSI 35-50 is ideal — oversold enough for a bounce, not so low that it signals fundamental problems."
              levels={[
                { range: "35-50 (sweet spot)", score: "8" },
                { range: "30-35 or 50-60", score: "5" },
                { range: "<30 (oversold)", score: "3" },
                { range: ">70 (overbought)", score: "0" },
              ]}
            />

            <FactorCard
              name="Peer Spiked"
              max={8}
              active
              description="Sympathy play detection. If a peer in the same layer spiked 10%+ in 5 days, others in the layer often follow."
              levels={[
                { range: "2+ peers spiked", score: "8" },
                { range: "1 peer spiked", score: "5" },
              ]}
            />

            <FactorCard
              name="Sector ETF Momentum"
              max={7}
              active
              description="How the layer's sector ETF is performing. When the sector ETF is at its 20-day high, the entire sector has tailwinds."
              levels={[
                { range: "At 20d high", score: "7" },
                { range: "Within 2%", score: "5" },
                { range: "Within 5%", score: "3" },
              ]}
            />

            <FactorCard
              name="MA Position"
              max={5}
              active
              description="Trend alignment based on 50-day and 200-day moving averages. Stocks above both MAs in a golden cross have the strongest trends."
              levels={[
                { range: "Above both MAs", score: "5" },
                { range: "Above 50 SMA only", score: "3" },
                { range: "Above 200 SMA only", score: "2" },
              ]}
            />

            <FactorCard
              name="Earnings Surprise"
              max={8}
              active
              description="Consecutive EPS beats over the last 4 quarters. Companies that consistently beat estimates tend to continue surprising to the upside."
              levels={[
                { range: "4 consecutive beats", score: "8" },
                { range: "3 consecutive beats", score: "6" },
                { range: "2 consecutive beats", score: "4" },
                { range: "1 beat (most recent)", score: "2" },
                { range: "Most recent miss", score: "0" },
              ]}
            />

            <FactorCard
              name="Options Skew"
              max={4}
              active
              description="Put/call open interest ratio from the options chain. High put/call ratio means heavy put positioning — squeeze fuel when a positive catalyst hits."
              levels={[
                { range: "P/C >= 1.5 (heavy puts)", score: "4" },
                { range: "P/C >= 1.0", score: "3" },
                { range: "P/C <= 0.4 (very bullish)", score: "2" },
                { range: "P/C 0.4-1.0", score: "1" },
              ]}
            />

            <FactorCard
              name="Trend Acceleration"
              max={5}
              active
              description="Compares 10-day rate of change vs half of 20-day ROC. Positive acceleration means the trend is speeding up, not just continuing."
              levels={[
                { range: "Acceleration >= 5%", score: "5" },
                { range: ">= 3%", score: "4" },
                { range: ">= 1.5%", score: "3" },
                { range: ">= 0.5%", score: "2" },
                { range: "> 0%", score: "1" },
              ]}
            />

            <FactorCard
              name="Relative Strength vs Sector"
              max={5}
              active
              description="Stock's 20-day return minus its sector ETF's 20-day return. Outperforming the sector means the stock has its own catalyst, not just riding the wave."
              levels={[
                { range: "Outperformance >= 10%", score: "5" },
                { range: ">= 5%", score: "4" },
                { range: ">= 2%", score: "3" },
                { range: ">= 0%", score: "1" },
                { range: "Underperforming", score: "0" },
              ]}
            />

            <FactorCard
              name="Insider Buying"
              max={5}
              active
              description="Net insider purchase activity in the last 90 days. Insiders buying their own stock is a strong conviction signal — they have the most information."
              levels={[
                { range: "3+ purchases, 0 sales", score: "5" },
                { range: "2+ purchases, net positive", score: "4" },
                { range: "1 purchase, 0 sales", score: "3" },
                { range: "Any purchase with sales", score: "1" },
                { range: "Only sales or none", score: "0" },
              ]}
            />

            <FactorCard
              name="Institutional Ownership"
              max={4}
              active
              description="Percentage of shares held by institutional investors. High institutional ownership means smart money is positioned and provides a floor of support."
              levels={[
                { range: ">= 90%", score: "4" },
                { range: ">= 75%", score: "3" },
                { range: ">= 50%", score: "2" },
                { range: ">= 25%", score: "1" },
              ]}
            />

            <FactorCard
              name="Dark Pool Proxy"
              max={4}
              active
              description="Days in last 10 with volume > 2x 20-day average but price change < 1%. High volume with no movement suggests large block trades being absorbed — accumulation before a move."
              levels={[
                { range: "3+ days", score: "4" },
                { range: "2 days", score: "3" },
                { range: "1 day", score: "2" },
                { range: "0 days", score: "0" },
              ]}
            />
          </div>

          <Tip>
            Mean reversion and momentum breakout are somewhat <strong className="text-white">mutually exclusive</strong>.
            A stock that&rsquo;s down 40% YTD (mean reversion = 8) won&rsquo;t be near its 52-week high (momentum = 0), and
            vice versa. The scanner catches both types: beaten-down names ready for a bounce AND breakout stocks
            pushing to new highs.
          </Tip>
        </Section>

        {/* Section 4: Verdicts */}
        <Section
          id="verdicts"
          title="Verdict Categories"
          icon={<Target className="h-5 w-5 text-red-400" />}
        >
          <p>
            After scoring, each stock is classified into one of four verdicts based on its total score:
          </p>

          <div className="mt-4 space-y-3">
            <VerdictCard
              verdict="PRE-SPIKE"
              threshold="45+"
              color="green"
              description="Multiple factors are strongly aligned. This stock has the highest probability of a significant move. Immediate attention warranted."
            />
            <VerdictCard
              verdict="WATCH"
              threshold="32-44"
              color="amber"
              description="Several positive factors but not fully aligned. Worth monitoring closely — a catalyst or peer movement could push this to PRE-SPIKE."
            />
            <VerdictCard
              verdict="MONITOR"
              threshold="20-31"
              color="gray"
              description="Some positive signals but not enough for action. Keep on radar for factor improvement."
            />
            <VerdictCard
              verdict="MISS"
              threshold="<20"
              color="red"
              description="Insufficient factors for the current scan. Each miss is classified into a specific category explaining why."
            />
          </div>

          <SubSection title="Score Bar and Factor Dots">
            <p>
              Each result card shows a <strong className="text-white">score bar</strong> (total out of 100) and
              a row of <strong className="text-white">17 colored dots</strong> representing individual factor scores:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><span className="inline-block h-2 w-2 rounded-full bg-green-500" /> <strong className="text-white">Green</strong> &mdash; Factor at 75%+ of its max</li>
              <li><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> <strong className="text-white">Amber</strong> &mdash; Factor at 40-74% of its max</li>
              <li><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> <strong className="text-white">Red</strong> &mdash; Factor below 40% (contributing but weak)</li>
              <li><span className="inline-block h-2 w-2 rounded-full bg-[#333]" /> <strong className="text-white">Gray</strong> &mdash; Factor at 0 (not contributing or data unavailable)</li>
            </ul>
            <p className="mt-2 text-[#a0a0a0]">
              Hover over any dot to see the factor name and exact score.
            </p>
          </SubSection>
        </Section>

        {/* Section 5: Misses */}
        <Section
          id="misses"
          title="Miss Categories"
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
        >
          <p>
            Stocks that score below the MONITOR threshold are classified as misses. Rather than discarding them,
            the scanner categorizes <em>why</em> they missed so you can make manual decisions. Toggle
            &ldquo;Show Misses&rdquo; in the sidebar to see them.
          </p>

          <div className="mt-4 space-y-3">
            <MissCard
              category="Already Moved"
              rule="YTD > +50% OR 5d > +15%"
              description="The stock has already made its big move. Would have been a PRE-SPIKE candidate earlier. These are confirmation that the scanner's thesis is correct — just too late to catch this one."
            />
            <MissCard
              category="Post-Spike"
              rule="5d change > +10%"
              description="The spike just happened. The move may not be over, but the risk/reward is no longer favorable for a new entry. Wait for a pullback."
            />
            <MissCard
              category="Wrong Sector"
              rule="Commodities/Power layer + no peer activity + sector ETF weak"
              description="The sector isn't participating in the current AI trade. Commodities and power are more macro-driven and may not track with chip/software names."
            />
            <MissCard
              category="Wrong Pattern"
              rule="Defense/Robotics layer + low score"
              description="These stocks tend to grind higher gradually rather than spike. AI Radar is designed for explosive moves, not slow trends."
            />
            <MissCard
              category="Too Early"
              rule="Near threshold + no catalyst within 30 days"
              description="The score is promising but there's no imminent catalyst. Revisit this stock when earnings or a macro event approaches."
            />
          </div>

          <SubSection title="Override to Watch">
            <p>
              If you disagree with a miss classification, click the <strong className="text-white">Override</strong> button
              to manually promote a stock to your watch list. Overrides are saved in your browser and persist across sessions.
              Use this for stocks where you have edge beyond what the scanner measures (insider knowledge, sector expertise,
              upcoming catalysts the scanner doesn&rsquo;t track).
            </p>
          </SubSection>
        </Section>

        {/* Section 6: Fire Drills */}
        <Section
          id="fire-drills"
          title="Fire Drill Detection"
          icon={<Zap className="h-5 w-5 text-red-400" />}
        >
          <p>
            A <strong className="text-white">fire drill</strong> is triggered when any stock in the universe moves
            10%+ in a single day. This is an unusually large move that signals something significant happened in
            that layer — an earnings surprise, a major contract win, or a macro catalyst.
          </p>

          <SubSection title="How Fire Drills Work">
            <ol className="list-inside list-decimal space-y-1.5 text-[#c0c0c0]">
              <li>Scanner detects a stock with <strong className="text-white">1-day change &ge; 10%</strong></li>
              <li>Identifies which <strong className="text-white">layer</strong> that stock belongs to</li>
              <li>Flags <strong className="text-white">all other stocks</strong> in the same layer with a fire drill badge</li>
              <li>Boosts their <strong className="text-white">peer-spiked score</strong> to maximum (8 pts)</li>
              <li>This can push borderline stocks across verdict thresholds</li>
            </ol>
          </SubSection>

          <SubSection title="Why It Matters">
            <p>
              When DELL spikes 15% on AI server demand, HPE and SMCI haven&rsquo;t moved yet but are likely to
              follow within 1-3 days. The fire drill flag tells you: <em>&ldquo;Something just happened in this
              layer — these peers need immediate attention.&rdquo;</em>
            </p>
          </SubSection>

          <Tip>
            Fire drill stocks are marked with a red <strong className="text-white">FIRE DRILL</strong> badge
            on their result card. If you see this badge, check what triggered it — the peer that spiked will
            be listed in the card details.
          </Tip>
        </Section>

        {/* Section 7: Using the Scanner */}
        <Section
          id="using-scanner"
          title="Using the Scanner Effectively"
          icon={<Target className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <SubSection title="Daily Workflow">
            <ol className="list-inside list-decimal space-y-1.5 text-[#c0c0c0]">
              <li>Check the <strong className="text-white">calendar ribbon</strong> at the top for upcoming catalysts</li>
              <li>Review <strong className="text-white">PRE-SPIKE</strong> candidates — these need immediate attention</li>
              <li>Check <strong className="text-white">WATCH</strong> stocks for potential entries ahead of catalysts</li>
              <li>Toggle <strong className="text-white">Show Misses</strong> to see if any &ldquo;Too Early&rdquo; stocks have upcoming catalysts</li>
              <li>Check for <strong className="text-white">fire drill</strong> badges — sympathy plays need quick action</li>
            </ol>
          </SubSection>

          <SubSection title="Sidebar Filters">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Layers</strong> &mdash; Filter to specific parts of the AI stack you want to focus on</li>
              <li><strong className="text-white">Tiers</strong> &mdash; Tier 1 for core plays, Tier 2-3 for higher-beta names</li>
              <li><strong className="text-white">Min Score</strong> &mdash; Raise the threshold to see only the strongest candidates</li>
              <li><strong className="text-white">Verdict</strong> &mdash; Focus on a specific verdict category</li>
              <li><strong className="text-white">Show Misses</strong> &mdash; Toggle the miss table to see why stocks didn&rsquo;t qualify</li>
            </ul>
          </SubSection>

          <SubSection title="Sort Controls">
            <p>
              In card view, use the sort buttons to reorder results by Score, Symbol, 5d %, YTD %, SI %,
              or Volume Ratio. In miss table view, click any column header to sort. Click again to reverse
              the sort direction.
            </p>
          </SubSection>

          <SubSection title="Calendar Ribbon">
            <p>
              The ribbon at the top shows upcoming events that could trigger moves:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Earnings</strong> &mdash; Individual stock catalysts (most impactful)</li>
              <li><strong className="text-white">FOMC</strong> &mdash; Rate decisions affect AI power and growth stocks</li>
              <li><strong className="text-white">OPEX</strong> &mdash; Options expiration can amplify moves via gamma</li>
              <li><strong className="text-white">CPI/Jobs</strong> &mdash; Macro data that shifts risk appetite</li>
              <li><strong className="text-white">Russell/S&amp;P rebalance</strong> &mdash; Index inclusion triggers forced buying</li>
            </ul>
          </SubSection>
        </Section>

        {/* Section 8: Finding Runners */}
        <Section
          id="finding-runners"
          title="Finding the Next Runner"
          icon={<Crosshair className="h-5 w-5 text-green-400" />}
        >
          <p>
            The scanner doesn&rsquo;t predict direction &mdash; it identifies <strong className="text-white">setup alignment</strong>.
            AI infrastructure stocks spike in a cascade: chips first, then servers/networking, then power/software.
            The scanner detects when a stock is loaded with fuel before the match is lit.
          </p>

          <SubSection title="What a Runner Looks Like">
            <p>
              A high-conviction runner typically has <strong className="text-white">5-6 green dots</strong> in
              this specific combination:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Catalyst imminent</strong> &mdash; Earnings or FOMC within 5 days (days to catalyst 10+)</li>
              <li><strong className="text-white">Compressed price</strong> &mdash; Either beaten down (mean reversion 5+) OR coiled at highs (momentum 4+), never both</li>
              <li><strong className="text-white">Accumulation</strong> &mdash; Volume ratio 5+ (smart money loading quietly)</li>
              <li><strong className="text-white">Short fuel</strong> &mdash; SI 3+ means forced buying when the move starts</li>
              <li><strong className="text-white">Sector tailwind</strong> &mdash; Sector ETF momentum 5+ means the whole layer is participating</li>
              <li><strong className="text-white">Earnings beats</strong> &mdash; Earnings surprise 6+ means the company has a track record of beating</li>
            </ul>
          </SubSection>

          <SubSection title="Step-by-Step: Finding the Runner">
            <ol className="list-inside list-decimal space-y-2 text-[#c0c0c0]">
              <li>
                <strong className="text-white">Filter for signal, not noise</strong> &mdash;
                Set Min Score to 55+ to hide weak setups. Focus on PRE-SPIKE and top WATCH cards.
              </li>
              <li>
                <strong className="text-white">Check the catalyst calendar</strong> &mdash;
                A runner needs a trigger. Look at the ribbon for earnings within 5 days. Stocks with no upcoming catalyst rarely spike.
              </li>
              <li>
                <strong className="text-white">Read the dots left to right</strong> &mdash;
                The strongest setups have green on both sides of the dot row (timing factors on the left, sentiment/flow factors on the right).
                A stock with green dots only on the left but gray on the right is missing conviction.
              </li>
              <li>
                <strong className="text-white">Look for the sympathy setup</strong> &mdash;
                When you see a FIRE DRILL badge, the stock that spiked already moved. Its peers that haven&rsquo;t moved yet are the runners.
                Example: DELL spikes 15% on AI server demand &rarr; HPE and SMCI cards show fire drill badges. Those are your entries.
              </li>
              <li>
                <strong className="text-white">Cross-reference the new factors</strong> &mdash;
                Insider buying 3+ (management putting their own money in), institutional ownership 3+ (smart money positioned),
                dark pool proxy 2+ (quiet large-block accumulation), options skew 3+ (heavy puts = squeeze fuel),
                relative strength 3+ (outperforming sector, not just riding the wave).
              </li>
              <li>
                <strong className="text-white">Disqualify false positives</strong> &mdash;
                RSI &gt; 70 (overbought, move may be done), 5d change already &gt; +10% (you&rsquo;re late),
                no catalyst within 30 days (score may decay), trend acceleration 0 (move decelerating).
              </li>
            </ol>
          </SubSection>

          <SubSection title="The Ideal Card">
            <div className="mt-1 space-y-1 font-mono text-xs text-[#c0c0c0]">
              <div>Score: <strong className="text-green-400">72+</strong></div>
              <div>Dots: <strong className="text-white">5-6 green</strong>, 3-4 amber, few gray</div>
              <div>Catalyst: <strong className="text-white">Earnings in 3-5 days</strong></div>
              <div>Peers: <strong className="text-white">At least 1 peer spiked recently</strong></div>
              <div>Layer: <strong className="text-white">AI Chips, Servers, or Networking</strong> (fastest movers)</div>
              <div>SI: <strong className="text-white">&gt; 10%</strong></div>
              <div>Insider: <strong className="text-white">Recent purchases, no sales</strong></div>
              <div>Volume: <strong className="text-white">1.5x+ 20d average</strong></div>
            </div>
          </SubSection>

          <SubSection title="What the Scanner Cannot Tell You">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Direction</strong> &mdash; Earnings can beat or miss. The scanner finds loaded setups, not outcomes.</li>
              <li><strong className="text-white">Timing precision</strong> &mdash; A PRE-SPIKE stock might move tomorrow or in 2 weeks.</li>
              <li><strong className="text-white">Position sizing</strong> &mdash; That&rsquo;s your risk management, not the scanner&rsquo;s job.</li>
            </ul>
          </SubSection>

          <Tip>
            The scanner narrows 82 tickers down to the 3-5 that have the most factors aligned.
            Your edge is acting on those 3-5 before the catalyst hits. The strongest signal is a
            FIRE DRILL badge on a stock with insider buying and high short interest &mdash; that
            combination creates the most explosive moves.
          </Tip>
        </Section>

        {/* Section 9: Limitations */}
        <Section
          id="limitations"
          title="Limitations and Caveats"
          icon={<Shield className="h-5 w-5 text-amber-400" />}
        >
          <SubSection title="Score Normalization">
            <p>
              All 17 factors are active with a raw maximum of 118 points. Scores are normalized to 0-100
              based on a practical ceiling of 100, accounting for mutual exclusivities between factors
              (e.g., mean reversion vs momentum breakout). Some data points may be unavailable for
              certain tickers:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Options Skew</strong> &mdash; ADR tickers (e.g., FANUY) may lack options chain data</li>
              <li><strong className="text-white">Earnings Surprise</strong> &mdash; Pre-revenue or recently IPO&rsquo;d companies may have no history</li>
              <li><strong className="text-white">Insider Transactions</strong> &mdash; Some companies have sparse insider filing data</li>
            </ul>
          </SubSection>

          <SubSection title="Data Freshness">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Price and volume data are <strong className="text-white">near real-time</strong> from Yahoo Finance (15-min delay)</li>
              <li>Short interest data is <strong className="text-white">reported bi-monthly</strong> by FINRA with ~2 week lag</li>
              <li>Analyst targets update <strong className="text-white">irregularly</strong> as analysts publish</li>
              <li>Earnings calendar data may not include recently announced dates</li>
            </ul>
          </SubSection>

          <SubSection title="What the Scanner Cannot Do">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Predict the <strong className="text-white">direction</strong> of a catalyst (earnings could beat or miss)</li>
              <li>Account for <strong className="text-white">non-public information</strong> (insider activity, undisclosed orders)</li>
              <li>Detect <strong className="text-white">commodity-specific</strong> catalysts (copper supply disruptions, uranium contracts)</li>
              <li>Replace <strong className="text-white">fundamental analysis</strong> — it&rsquo;s a screening tool, not a buy signal</li>
            </ul>
          </SubSection>

          <Tip>
            The miss categories are just as valuable as the verdicts. &ldquo;Already Moved&rdquo; confirms the
            thesis was right — the scanner would have flagged it. &ldquo;Too Early&rdquo; stocks are your
            watch list for when catalysts approach.
          </Tip>
        </Section>

        {/* Back to scanner */}
        <div className="flex justify-center pt-2">
          <Link
            href="/catalyst"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm font-medium text-[#5ba3e6] transition-colors hover:bg-[#262626]"
          >
            &larr; Back to AI Radar
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
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#5ba3e6]">{title}</p>
      <div className="text-sm text-[#c0c0c0]">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-[#5ba3e6]/20 bg-[#185FA5]/10 p-3">
      <p className="text-xs font-semibold text-[#5ba3e6]">Pro Tip</p>
      <p className="mt-1 text-sm text-[#c0c0c0]">{children}</p>
    </div>
  );
}

function FactorCard({
  name,
  max,
  active,
  stub,
  description,
  levels,
}: {
  name: string;
  max: number;
  active?: boolean;
  stub?: boolean;
  description: string;
  levels: { range: string; score: string }[];
}) {
  return (
    <div className={`rounded-lg border p-4 ${stub ? "border-[#333] bg-[#1a1a1a] opacity-60" : "border-[#2a2a2a] bg-[#262626]"}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-semibold text-white">{name}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
          stub ? "bg-[#333] text-[#666]" : "bg-red-500/10 text-red-400"
        }`}>
          {stub ? "PHASE 2" : `MAX ${max}`}
        </span>
        {active && (
          <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-bold text-green-400">
            ACTIVE
          </span>
        )}
      </div>
      <p className="text-sm text-[#c0c0c0]">{description}</p>
      {levels.length > 0 && (
        <div className="mt-2 space-y-1">
          {levels.map((l) => (
            <div key={l.range} className="flex items-center gap-2 text-xs">
              <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-red-400">
                {l.range}
              </span>
              <span className="text-[#a0a0a0]">&rarr; {l.score} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VerdictCard({
  verdict,
  threshold,
  color,
  description,
}: {
  verdict: string;
  threshold: string;
  color: "green" | "amber" | "gray" | "red";
  description: string;
}) {
  const colors = {
    green: "border-green-500/30 bg-green-500/5",
    amber: "border-amber-500/30 bg-amber-500/5",
    gray: "border-[#333] bg-[#1a1a1a]",
    red: "border-red-500/30 bg-red-500/5",
  };
  const textColors = {
    green: "text-green-400",
    amber: "text-amber-400",
    gray: "text-[#a0a0a0]",
    red: "text-red-400",
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-sm font-bold ${textColors[color]}`}>{verdict}</span>
        <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] font-mono text-[#a0a0a0]">
          Score {threshold}
        </span>
      </div>
      <p className="text-sm text-[#c0c0c0]">{description}</p>
    </div>
  );
}

function MissCard({
  category,
  rule,
  description,
}: {
  category: string;
  rule: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-semibold text-white">{category}</span>
        <span className="rounded bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[10px] text-[#666]">
          {rule}
        </span>
      </div>
      <p className="text-sm text-[#c0c0c0]">{description}</p>
    </div>
  );
}

function LayerRow({
  layer,
  desc,
  examples,
  etf,
}: {
  layer: string;
  desc: string;
  examples: string;
  etf: string;
}) {
  return (
    <tr className="border-b border-[#222]">
      <td className="px-3 py-1.5 text-white">{layer}</td>
      <td className="px-3 py-1.5">{desc}</td>
      <td className="px-3 py-1.5 font-mono text-[10px]">{examples}</td>
      <td className="px-3 py-1.5">
        <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] text-[#a0a0a0]">{etf}</span>
      </td>
    </tr>
  );
}
