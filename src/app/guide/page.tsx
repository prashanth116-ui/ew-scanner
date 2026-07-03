"use client";

import { useCallback, useState } from "react";
import { Activity, Target, TrendingUp, AlertTriangle, Zap, Search, BarChart3 } from "lucide-react";

const SECTIONS = [
  { id: "how-it-works", label: "How It Works" },
  { id: "scoring", label: "Scoring" },
  { id: "universes", label: "Universes" },
  { id: "presets", label: "Presets" },
  { id: "reading-cards", label: "Reading Cards" },
  { id: "wave2-bottoms", label: "W2 Bottoms" },
  { id: "wave4-pullback", label: "W4 Pullback" },
  { id: "wave5-exhaust", label: "W5 Exhaustion" },
  { id: "breakout", label: "Breakout" },
  { id: "best-practices", label: "Best Practices" },
  { id: "export-workflow", label: "Export & Workflow" },
];

export default function EWScannerGuidePage() {
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
        </nav>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-8 pb-16">
        {/* Header */}
        <section>
          <div className="flex items-center gap-3">
            <Activity className="h-8 w-8 text-[#5ba3e6]" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Scanner Guide
              </h1>
              <p className="mt-1 text-[#a0a0a0]">
                Best practices and real-world scenarios for QuantRadar.
              </p>
            </div>
          </div>
        </section>

        {/* Quick Overview */}
        <Section id="how-it-works" title="How the Scanner Works" icon={<Search className="h-5 w-5 text-[#5ba3e6]" />}>
          <p>
            The scanner fetches <strong className="text-white">5 years of weekly price data</strong> from Yahoo Finance for every stock in the selected universe
            (batched 10 at a time with rate-limit delays), then runs five layers of analysis per ticker:
          </p>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-[#c0c0c0]">
            <li><strong className="text-white">Identify key levels</strong> &mdash; Find the all-time high (ATH) and the post-ATH trough. For stocks near ATH, the scanner uses the prior correction low as a structural fallback.</li>
            <li><strong className="text-white">Algorithmic wave counting</strong> &mdash; Detects swing highs/lows using a 3-bar pivot method, then tries 6 wave count models (impulse/corrective on decline, recovery, and developing phases). Picks the best by quality score and stores an alternate count.</li>
            <li><strong className="text-white">Multi-factor analysis</strong> &mdash; Fibonacci retracement (golden zone detection), volume comparison (decline vs recovery), momentum divergence (rate of change), and structure classification (impulsive 5-wave vs corrective A-B-C).</li>
            <li><strong className="text-white">Mode-specific filtering</strong> &mdash; Each mode applies strict thresholds (e.g., Wave 2 requires golden zone, Wave 4 must not overlap Wave 1, Breakout needs volume expansion).</li>
            <li><strong className="text-white">AI deep analysis</strong> &mdash; Top candidates get Claude-powered analysis with specific wave labels, forward targets (Fibonacci extensions), and invalidation levels.</li>
          </ol>
          <p className="mt-3">
            Results are scored on a <strong className="text-white">25-point enhanced scale</strong> combining
            all layers with mode-specific weighting, then ranked. The confidence tier (high / probable / speculative) tells you
            at a glance how many signals align.
          </p>
        </Section>

        {/* Scoring Breakdown */}
        <Section id="scoring" title="Scoring Breakdown" icon={<BarChart3 className="h-5 w-5 text-[#5ba3e6]" />}>
          <p>
            Each candidate is scored on a <strong className="text-white">25-point enhanced scale</strong> composed of six components.
            Weights vary by mode &mdash; Fibonacci matters more for Wave 4, volume matters more for Breakout.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-[#666]">
                  <th className="py-1.5 pr-3 text-left font-medium">Component</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Max Pts</th>
                  <th className="py-1.5 text-left font-medium">What It Measures</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                {[
                  { name: "Base", pts: "7", desc: "Decline depth (2), ATH timing (1), duration (2), recovery magnitude (2)" },
                  { name: "Fibonacci", pts: "4", desc: "Golden zone (38.2-61.8%) = +3, near any Fib level = +1" },
                  { name: "Volume", pts: "3", desc: "Expanding volume on recovery = +2, trending volume = +1" },
                  { name: "Structure", pts: "3", desc: "Impulsive 5-wave = +3, corrective A-B-C = +2, unclear = 0" },
                  { name: "Wave Count", pts: "5", desc: "Algorithmic count quality: valid + score 80+ = +5, 65+ = +4, 50+ = +3" },
                  { name: "Relative Strength", pts: "3", desc: "Recovery momentum vs peers in the same scan batch" },
                ].map((c) => (
                  <tr key={c.name} className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-3 font-medium text-white whitespace-nowrap">{c.name}</td>
                    <td className="py-1.5 pr-3 text-right text-[#5ba3e6]">{c.pts}</td>
                    <td className="py-1.5">{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            <strong className="text-white">Mode-specific weights:</strong>
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
            <li><strong className="text-white">Wave 2:</strong> All factors equally weighted (1.0x)</li>
            <li><strong className="text-white">Wave 4:</strong> Fibonacci 2.5x, Relative Strength 1.5x (precise retrace levels matter most)</li>
            <li><strong className="text-white">Wave 5:</strong> Volume 1.5x, Relative Strength 2.0x (divergence + strength confirmation)</li>
            <li><strong className="text-white">Breakout:</strong> Volume 2.0x, Relative Strength 2.0x (expansion + momentum)</li>
          </ul>
          <div className="mt-4 space-y-2">
            <SubSection title="Confidence Tiers">
              <p>
                The raw score is normalized (0-100%) then bucketed:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li><Badge color="green">high</Badge> &mdash; normalized score &ge; 75%. Strong alignment across all factors.</li>
                <li><Badge color="yellow">probable</Badge> &mdash; 50-74%. Most signals align but some conflict.</li>
                <li><Badge color="gray">speculative</Badge> &mdash; &lt; 50%. Needs more confirmation before acting.</li>
              </ul>
            </SubSection>
          </div>
        </Section>

        {/* Universes */}
        <Section id="universes" title="Universes" icon={<BarChart3 className="h-5 w-5 text-[#5ba3e6]" />}>
          <p>
            Choose a universe to control the scan scope. Smaller universes scan faster; larger ones cast a wider net.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-[#666]">
                  <th className="py-1.5 pr-3 text-left font-medium">Universe</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Stocks</th>
                  <th className="py-1.5 text-left font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                {[
                  { name: "Blue Chips", count: "~135", desc: "Deduplicated top holdings from SP500, NDX, Biotech, Energy, Financials, Consumer" },
                  { name: "Full", count: "~1,390", desc: "Entire squeeze universe — S&P 500 + S&P 400 MidCap + S&P 600 SmallCap highlights" },
                  { name: "SP500", count: "50", desc: "Top 50 S&P 500 names by market cap" },
                  { name: "NDX", count: "40", desc: "Top 40 Nasdaq-100 names (tech-heavy)" },
                  { name: "Biotech", count: "24", desc: "Large-cap biotech and healthcare" },
                  { name: "Energy", count: "20", desc: "Large-cap energy producers and services" },
                  { name: "Financials", count: "25", desc: "Large-cap banks, payments, and insurance" },
                  { name: "Consumer", count: "25", desc: "Large-cap consumer discretionary and staples" },
                ].map((u) => (
                  <tr key={u.name} className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-3 font-medium text-white whitespace-nowrap">{u.name}</td>
                    <td className="py-1.5 pr-3 text-right text-[#5ba3e6]">{u.count}</td>
                    <td className="py-1.5">{u.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Presets */}
        <Section id="presets" title="Presets at a Glance" icon={<Zap className="h-5 w-5 text-yellow-400" />}>
          <p>
            Presets configure the scanner mode, timeframes, and filter thresholds in one click.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-[#666]">
                  <th className="py-1.5 pr-3 text-left font-medium">Preset</th>
                  <th className="py-1.5 pr-3 text-left font-medium">Mode</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Min Decline</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Recovery</th>
                  <th className="py-1.5 text-left font-medium">Best For</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                {[
                  { name: "Deep Value", mode: "W2 Bottom", decline: "40%", recovery: "10%", use: "Classic golden zone bottoms. Highest conviction, fewest results." },
                  { name: "Pullback", mode: "W4 Pullback", decline: "15%", recovery: "20%", use: "Shallow dips in strong uptrends. Best in trending markets." },
                  { name: "Topping", mode: "W5 Exhaust", decline: "5%", recovery: "80%", use: "Near-ATH exhaustion signals. Use for exit timing, not entries." },
                  { name: "Breakout", mode: "Breakout", decline: "20%", recovery: "40%", use: "Recovered most of decline with volume. New impulse starting." },
                  { name: "Wide Net", mode: "W2 Bottom", decline: "25%", recovery: "5%", use: "Catches early recoveries. More results, lower avg quality." },
                ].map((p) => (
                  <tr key={p.name} className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-3 font-medium text-white whitespace-nowrap">{p.name}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{p.mode}</td>
                    <td className="py-1.5 pr-3 text-right text-[#5ba3e6]">{p.decline}</td>
                    <td className="py-1.5 pr-3 text-right text-[#5ba3e6]">{p.recovery}</td>
                    <td className="py-1.5">{p.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* What to Look For */}
        <Section id="reading-cards" title="Reading the Cards" icon={<BarChart3 className="h-5 w-5 text-[#5ba3e6]" />}>
          <div className="space-y-3">
            <SubSection title="Confidence Badge">
              <p>
                <Badge color="green">high</Badge> means 75%+ of the normalized score &mdash;
                strong alignment across Fibonacci, volume, structure, wave count, and base criteria.
                <Badge color="yellow">probable</Badge> (50-74%) has some conflicting signals.
                <Badge color="gray">speculative</Badge> (&lt;50%) needs more confirmation before acting.
                See the <em>Scoring</em> section above for the full 25-point breakdown.
              </p>
            </SubSection>
            <SubSection title="Sparkline">
              <p>
                The mini chart shows the full 5-year weekly price history.
                <span className="text-[#555]">Gray</span> = pre-ATH,
                <span className="text-red-400"> red</span> = ATH-to-Low decline,
                <span className="text-green-400"> green</span> = Low-to-Current recovery.
                A sharp red segment followed by a steady green climb is the classic Wave 2 bottom pattern.
              </p>
            </SubSection>
            <SubSection title="Fib Bar">
              <p>
                The horizontal bar shows where current price sits relative to Fibonacci retracement levels.
                The <span className="text-yellow-400">highlighted zone</span> is the 38.2%&ndash;61.8% &ldquo;golden zone&rdquo; &mdash;
                the most common Wave 2 and Wave 4 reversal area. A dot sitting inside the golden zone is a positive signal.
              </p>
            </SubSection>
            <SubSection title="Finding Dots">
              <p>
                Each row shows a signal with a colored dot: <span className="text-green-400">green</span> = strong pass,
                <span className="text-yellow-400"> yellow</span> = marginal, <span className="text-red-400">red</span> = weak.
                For high-conviction setups, you want all 7 dots green (Decline, Direction, Duration, Recovery, Fib Zone, Volume, Structure).
              </p>
              <p className="mt-2">
                <strong className="text-white">Dots vs Enhanced Score:</strong> The 7 dots are binary pass/fail
                checks for each signal dimension. The <strong className="text-white">25-point enhanced score</strong> is
                a separate, more granular measure that weights each dimension differently per mode (Fibonacci depth contributes
                more in Wave 4, volume more in Breakout). A stock can have 5/7 dots green but still score 18/25 if the
                passing dots are the high-weight ones. Use dots for quick visual scanning; use the enhanced score
                for ranking and comparison.
              </p>
            </SubSection>
          </div>
        </Section>

        {/* Scenario 1 */}
        <Section
          id="wave2-bottoms"
          title="Scenario 1: Finding Wave 2 Bottoms"
          icon={<Target className="h-5 w-5 text-green-400" />}
        >
          <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#666]">Setup</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-[#c0c0c0]">
              <li>Mode: <strong className="text-white">W2 Bottom</strong></li>
              <li>Universe: <strong className="text-white">SP500</strong></li>
              <li>Min Decline: <strong className="text-white">25%</strong>, Duration: <strong className="text-white">6mo</strong>, Recovery: <strong className="text-white">15%</strong></li>
              <li>HTF: Monthly, LTF: Daily</li>
            </ul>
          </div>
          <div className="mt-3 space-y-2">
            <p><strong className="text-white">What you&rsquo;re looking for:</strong></p>
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Stocks that dropped 25%+ from their ATH but are now recovering</li>
              <li>Fib retracement in the 38.2%&ndash;61.8% golden zone (classic Wave 2 target)</li>
              <li>Expanding volume on recovery (confirms buying pressure)</li>
              <li>Impulsive decline structure (5 swings = 5-wave drop = Wave 1 complete)</li>
              <li>AI label saying &ldquo;Wave 2&rdquo; or &ldquo;completing corrective phase&rdquo;</li>
            </ul>
            <p className="mt-2"><strong className="text-white">How to act:</strong></p>
            <p className="text-[#c0c0c0]">
              Click <em>Deep Analysis</em> on the top 3&ndash;5 candidates. Look for the invalidation level (below the
              Wave 1 start) and the next target (Wave 3 projection). Enter positions near Fibonacci support with a stop
              below the invalidation. Wave 3 is typically the strongest wave &mdash; aim for 1.618x the Wave 1 length as your target.
            </p>
            <Tip>
              Sort by <em>score</em> and group by <em>sector</em>. If 3+ stocks in one sector all show Wave 2 patterns,
              the sector rotation thesis is stronger than any individual signal.
            </Tip>
          </div>
        </Section>

        {/* Scenario 2 */}
        <Section
          id="wave4-pullback"
          title="Scenario 2: Wave 4 Pullback Entries"
          icon={<TrendingUp className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#666]">Setup</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-[#c0c0c0]">
              <li>Mode: <strong className="text-white">W4 Pullback</strong></li>
              <li>Universe: <strong className="text-white">NDX</strong> (strong tech uptrends)</li>
              <li>Min Decline: <strong className="text-white">10%</strong>, Duration: <strong className="text-white">1mo</strong>, Recovery: <strong className="text-white">5%</strong></li>
              <li>HTF: Weekly, LTF: 4H</li>
            </ul>
          </div>
          <div className="mt-3 space-y-2">
            <p><strong className="text-white">What you&rsquo;re looking for:</strong></p>
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Stocks in clear uptrends with a 10&ndash;30% dip (Wave 4 is shallower than Wave 2)</li>
              <li>Fib retracement at the 23.6%&ndash;38.2% level (Wave 4 rule: cannot enter Wave 1 territory)</li>
              <li>Corrective structure (3 swings = A-B-C pullback, not a new downtrend)</li>
              <li>Volume contracting on the pullback (sellers exhausted, not panic selling)</li>
            </ul>
            <p className="mt-2"><strong className="text-white">How to act:</strong></p>
            <p className="text-[#c0c0c0]">
              Wave 4 pullbacks are dip-buy setups in strong trends. The invalidation is the top of Wave 1
              (Wave 4 cannot overlap Wave 1 in standard EW theory). Enter near the 38.2% Fib with a tight stop
              below the Wave 1 high. Target is Wave 5, which often equals Wave 1 in length.
            </p>
            <Tip>
              Wave 4 pullbacks in the NDX/tech universe often coincide with market-wide risk-off events.
              If you see 10+ stocks showing W4 patterns simultaneously, it&rsquo;s likely a broad pullback &mdash;
              pick the strongest recoveries (highest relative strength score).
            </Tip>
          </div>
        </Section>

        {/* Scenario 3 */}
        <Section
          id="wave5-exhaust"
          title="Scenario 3: Wave 5 Exhaustion"
          icon={<AlertTriangle className="h-5 w-5 text-yellow-400" />}
        >
          <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#666]">Setup</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-[#c0c0c0]">
              <li>Mode: <strong className="text-white">W5 Exhaust</strong></li>
              <li>Universe: <strong className="text-white">SP500</strong></li>
              <li>Min Decline: <strong className="text-white">5%</strong>, Duration: <strong className="text-white">1mo</strong>, Recovery: <strong className="text-white">80%</strong></li>
              <li>HTF: Monthly, LTF: Daily</li>
            </ul>
          </div>
          <div className="mt-3 space-y-2">
            <p><strong className="text-white">What you&rsquo;re looking for:</strong></p>
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Stocks near or at all-time highs (Fib retracement above 78.6%)</li>
              <li>Momentum divergence (recovery pace slowing vs. earlier waves)</li>
              <li>Volume contracting near the high (exhaustion, not conviction)</li>
              <li>AI label suggesting &ldquo;Wave 5&rdquo; or &ldquo;completing impulse&rdquo;</li>
            </ul>
            <p className="mt-2"><strong className="text-white">How to act:</strong></p>
            <p className="text-[#c0c0c0]">
              Wave 5 exhaustion is a <em>warning signal</em>, not an immediate short trigger. Use it to:
              (1) tighten stops on existing long positions, (2) reduce position sizes, or (3) prepare for a
              corrective A-B-C decline after the 5-wave impulse completes. The Deep Analysis will give you
              a target for the Wave 5 completion level and the expected depth of the correction.
            </p>
            <Tip>
              Combine this with the Breakout scanner for confirmation. If a stock shows W5 Exhaustion but also
              appears as a Breakout candidate, the breakout is likely a final thrust (Wave 5 extension) rather than
              the start of a new impulse.
            </Tip>
          </div>
        </Section>

        {/* Scenario 4 */}
        <Section
          id="breakout"
          title="Scenario 4: Breakout (New Impulse)"
          icon={<TrendingUp className="h-5 w-5 text-green-400" />}
        >
          <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#666]">Setup</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-[#c0c0c0]">
              <li>Mode: <strong className="text-white">Breakout</strong></li>
              <li>Universe: <strong className="text-white">Blue Chips</strong> or <strong className="text-white">Full</strong></li>
              <li>Min Decline: <strong className="text-white">20%</strong>, Duration: <strong className="text-white">3mo</strong>, Recovery: <strong className="text-white">40%</strong></li>
              <li>HTF: Weekly, LTF: Daily</li>
            </ul>
          </div>
          <div className="mt-3 space-y-2">
            <p><strong className="text-white">What you&rsquo;re looking for:</strong></p>
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Stocks that suffered a meaningful decline (20%+) but have recovered most of it (40%+ retracement)</li>
              <li>Volume expanding on the recovery &mdash; this is the key signal (weighted 2x in scoring)</li>
              <li>Breaking above prior swing highs or consolidation resistance</li>
              <li>Structural stocks (at/near ATH) are accepted in this mode &mdash; they represent base breakouts</li>
              <li>Relative strength vs peers is high (also weighted 2x)</li>
            </ul>
            <p className="mt-2"><strong className="text-white">How to act:</strong></p>
            <p className="text-[#c0c0c0]">
              Breakout candidates are starting a new impulse wave (Wave 1 or Wave 3). Enter on the first
              pullback after the breakout (not the breakout itself &mdash; too prone to fakeouts).
              The invalidation is the prior swing low. Target is 1.618x the height of the base formation
              projected from the breakout level.
            </p>
            <Tip>
              Volume is king for breakouts. A breakout on 2x+ average volume is far more reliable than one
              on normal volume. Check the volume component in the enhanced score &mdash; if it&rsquo;s maxed
              (3/3), the breakout has institutional participation.
            </Tip>
          </div>
        </Section>

        {/* Best Practices */}
        <Section id="best-practices" title="Best Practices" icon={<Zap className="h-5 w-5 text-yellow-400" />}>
          <div className="space-y-4">
            <BestPractice title="Use Deep Analysis sparingly">
              The AI analysis costs API credits and takes 2&ndash;3 seconds per stock. Run it on your top
              3&ndash;5 candidates after reviewing the mechanical scoring, not on every result.
            </BestPractice>
            <BestPractice title="Cross-reference scanner modes">
              Run the same universe through different modes. A stock appearing as W2 Bottom in one scan
              and Breakout in another is showing conflicting signals &mdash; skip it. Stocks that only
              appear in one mode have cleaner setups.
            </BestPractice>
            <BestPractice title="Save scans for tracking">
              Use the Save button to snapshot results. Check back weekly to see how candidates evolved.
              A W2 Bottom candidate that strengthened in a week is confirming; one that weakened may be
              entering a deeper correction.
            </BestPractice>
            <BestPractice title="Sector grouping reveals rotation">
              Group by sector after scanning. If Healthcare shows 5 high-confidence candidates and Tech shows 0,
              money is rotating into Healthcare &mdash; that&rsquo;s a stronger signal than any individual stock.
            </BestPractice>
            <BestPractice title="Fibonacci golden zone is king">
              The 38.2%&ndash;61.8% retracement zone is where most Wave 2 and Wave 4 reversals occur.
              Candidates with the Fib bar dot inside the golden zone deserve extra attention.
            </BestPractice>
            <BestPractice title="Volume confirms everything">
              A green &ldquo;expanding&rdquo; volume dot means buying pressure is increasing during the recovery.
              Contracting volume on recovery is a warning &mdash; the bounce may not hold.
            </BestPractice>
          </div>
        </Section>

        {/* Export Tips */}
        <Section id="export-workflow" title="Export & Workflow" icon={<BarChart3 className="h-5 w-5 text-[#5ba3e6]" />}>
          <ul className="list-inside list-disc space-y-2 text-[#c0c0c0]">
            <li>
              <strong className="text-white">Excel export</strong> includes all 20+ columns: base score, enhanced score,
              Fibonacci zone, volume trend, structure, momentum, sector, and AI labels.
            </li>
            <li>
              <strong className="text-white">Workflow suggestion:</strong> Run a weekly scan every Sunday. Export to Excel.
              Compare with the previous week&rsquo;s export to spot new candidates entering your target zone and existing
              candidates progressing as expected.
            </li>
            <li>
              <strong className="text-white">Signal tracking:</strong> Every scan automatically records signals to the database.
              After 7+ days, outcomes are tracked (7d/30d/60d/90d returns, target hits, invalidation hits).
              Hit rate badges will appear on results once enough data accumulates.
            </li>
            <li>
              <strong className="text-white">Saved scans</strong> persist in your browser&rsquo;s local storage (up to 20 scans).
              They restore all scores, analysis, and labels but not sparklines (those require re-fetching data).
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

// ── Helper components ──

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
    <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#5ba3e6]">{title}</p>
      <div className="text-sm text-[#c0c0c0]">{children}</div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    green: "bg-green-500/20 text-green-400",
    yellow: "bg-yellow-500/20 text-yellow-400",
    gray: "bg-gray-500/20 text-gray-400",
  };
  return (
    <span className={`mx-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[color] ?? colors.gray}`}>
      {children}
    </span>
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

function BestPractice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-4">
      <p className="mb-1 text-sm font-semibold text-white">{title}</p>
      <p className="text-sm text-[#c0c0c0]">{children}</p>
    </div>
  );
}
