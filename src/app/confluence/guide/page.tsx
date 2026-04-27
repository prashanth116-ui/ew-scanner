"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Layers,
  Cpu,
  BarChart3,
  Activity,
  SlidersHorizontal,
  Target,
  Shield,
  BookOpen,
  ArrowLeft,
} from "lucide-react";

const SECTIONS = [
  { id: "what-is-confluence", label: "What Is It?" },
  { id: "how-it-works", label: "How It Works" },
  { id: "signal-classification", label: "Signals" },
  { id: "four-scanners", label: "The 4 Scanners" },
  { id: "presets", label: "Presets" },
  { id: "using-scanner", label: "Scanner Tips" },
  { id: "risk-management", label: "Risk Mgmt" },
];

export default function ConfluenceGuidePage() {
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
              href="/confluence"
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
              <BookOpen className="h-8 w-8 text-pink-400" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  Confluence Guide
                </h1>
                <p className="mt-1 text-[#a0a0a0]">
                  How four independent scanners combine into one high-conviction signal.
                </p>
              </div>
            </div>
            <Link
              href="/confluence"
              className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444] shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Scanner
            </Link>
          </div>
        </section>

        {/* Section 1: What Is Confluence? */}
        <Section
          id="what-is-confluence"
          title="What Is Confluence?"
          icon={<Layers className="h-5 w-5 text-pink-400" />}
        >
          <p>
            <strong className="text-white">Confluence</strong> means multiple independent analyses
            pointing to the same conclusion. Each of the four scanners on this site looks at a stock
            through a different lens &mdash; technical positioning, short squeeze mechanics, fundamental
            catalysts, and sector rotation. When all four agree, the signal is far stronger than any
            single scanner alone.
          </p>

          <SubSection title="Why Confluence Matters">
            <p>
              Any single scanner can produce false positives. A stock might look great on Elliott Wave
              positioning but have no catalyst to trigger the move. Or it might have a massive short squeeze
              setup but sit in a sector that&rsquo;s rotating out of favor. Confluence filters these out by
              requiring agreement across multiple, uncorrelated dimensions.
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Single scanner</strong> &mdash; one perspective, higher false-positive rate</li>
              <li><strong className="text-white">Two scanners agree</strong> &mdash; coincidence is possible but less likely</li>
              <li><strong className="text-white">Three scanners agree</strong> &mdash; strong signal, worth deeper research</li>
              <li><strong className="text-white">All four agree</strong> &mdash; rare, highest conviction setup</li>
            </ul>
          </SubSection>

          <SubSection title="Intersection vs Union">
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Approach</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Method</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Result</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Union</td>
                    <td className="px-3 py-1.5">Any scanner flags it</td>
                    <td className="px-3 py-1.5">More candidates, more noise</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">Intersection (Confluence)</td>
                    <td className="px-3 py-1.5">Multiple scanners agree</td>
                    <td className="px-3 py-1.5">Fewer candidates, higher quality</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[#a0a0a0]">
              The confluence scanner uses intersection logic &mdash; it only surfaces stocks that appear in
              at least 2 of the 3 universe lists (EW, Squeeze, Sector), then scores each across all four
              dimensions.
            </p>
          </SubSection>
        </Section>

        {/* Section 2: How It Works */}
        <Section
          id="how-it-works"
          title="How It Works"
          icon={<Cpu className="h-5 w-5 text-pink-400" />}
        >
          <p>
            The confluence scanner runs all four analyses per ticker, normalizes each score to a common
            0&ndash;1 scale, then computes a weighted blend. Here&rsquo;s the pipeline:
          </p>

          <SubSection title="Scan Pipeline">
            <ol className="list-inside list-decimal space-y-1.5 text-[#c0c0c0]">
              <li><strong className="text-white">Universe selection</strong> &mdash; Build the ticker list from the intersection of EW, Squeeze, and Sector universes (stocks in 2+ of 3)</li>
              <li><strong className="text-white">Sector rotation</strong> &mdash; Fetch sector scores once (shared across all tickers)</li>
              <li><strong className="text-white">Per-ticker scan</strong> &mdash; For each ticker, run EW, Squeeze, and Pre-Run analyses in parallel (batched 10 at a time)</li>
              <li><strong className="text-white">Normalization</strong> &mdash; Convert each raw score to a 0&ndash;1 range</li>
              <li><strong className="text-white">Weighted blend</strong> &mdash; Combine the four normalized scores using configurable weights</li>
              <li><strong className="text-white">Classification</strong> &mdash; Assign a signal strength (Strong / Moderate / Weak / None) based on pass count and confluence score</li>
            </ol>
          </SubSection>

          <SubSection title="Score Normalization">
            <p className="mb-2">
              Each scanner uses a different scoring scale. Before blending, scores are normalized to 0&ndash;1:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Scanner</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Raw Range</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Normalization</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Example</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">EW Scanner</td>
                    <td className="px-3 py-1.5">0&ndash;25</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">enhancedNormalized (pre-computed)</td>
                    <td className="px-3 py-1.5">18/25 &rarr; 0.72</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Squeeze</td>
                    <td className="px-3 py-1.5">0&ndash;100</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">squeezeScore / 100</td>
                    <td className="px-3 py-1.5">65/100 &rarr; 0.65</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Pre-Run</td>
                    <td className="px-3 py-1.5">0&ndash;24</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">finalScore / 24</td>
                    <td className="px-3 py-1.5">14/24 &rarr; 0.58</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">Sector Rotation</td>
                    <td className="px-3 py-1.5">0&ndash;100</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">compositeScore / 100</td>
                    <td className="px-3 py-1.5">72/100 &rarr; 0.72</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Weighted Blend Formula">
            <p>
              The confluence score is a weighted average of the four normalized scores:
            </p>
            <div className="mt-2 rounded-md border border-[#333] bg-[#1a1a1a] p-3 font-mono text-xs text-[#c0c0c0]">
              <p>confluenceScore = (EW &times; w<sub>ew</sub> + Squeeze &times; w<sub>sq</sub> + PreRun &times; w<sub>pr</sub> + Sector &times; w<sub>sec</sub>) / (w<sub>ew</sub> + w<sub>sq</sub> + w<sub>pr</sub> + w<sub>sec</sub>)</p>
            </div>
            <p className="mt-2 text-[#a0a0a0]">
              Default weights: EW&nbsp;30, Squeeze&nbsp;25, Pre-Run&nbsp;25, Sector&nbsp;20. These are
              fully adjustable via the sidebar controls or presets.
            </p>
          </SubSection>

          <SubSection title="Pass Count">
            <p>
              Independently from the weighted blend, each scanner is checked against its threshold. If the
              normalized score meets or exceeds the threshold, that scanner &ldquo;passes.&rdquo; The pass count
              (0&ndash;4) drives signal classification and is shown as colored dots in the results.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-[#c0c0c0]">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-pink-500" /> Pass
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#c0c0c0]">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#333]" /> Fail
              </div>
              <span className="text-xs text-[#666]">
                &mdash; each scanner gets one dot
              </span>
            </div>
          </SubSection>

          <Tip>
            If a scanner fails to fetch data for a ticker (API timeout, no coverage), that scanner&rsquo;s
            score is treated as 0 for the blend and excluded from the pass count. A stock can still reach
            &ldquo;Strong&rdquo; with 3 of 4 scanners if the scores are high enough.
          </Tip>
        </Section>

        {/* Section 3: Signal Classification */}
        <Section
          id="signal-classification"
          title="Signal Classification"
          icon={<BarChart3 className="h-5 w-5 text-pink-400" />}
        >
          <p>
            After scoring, each stock is classified into one of four signal levels based on how many
            scanners passed and the overall confluence score:
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#333]">
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Signal</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Pass Count</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Score</th>
                  <th className="px-3 py-2 text-left text-[#a0a0a0]">Meaning</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-1.5">
                    <span className="rounded-full border border-pink-500/30 bg-pink-500/20 px-2 py-0.5 text-[10px] font-medium text-pink-400">
                      STRONG
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-white">4 pass</td>
                  <td className="px-3 py-1.5 text-white">&ge; 60%</td>
                  <td className="px-3 py-1.5">All scanners agree &mdash; highest conviction, rarest signal</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-1.5">
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                      MODERATE
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-white">3+ pass</td>
                  <td className="px-3 py-1.5 text-white">&ge; 45%</td>
                  <td className="px-3 py-1.5">Most scanners agree &mdash; solid setup worth deeper research</td>
                </tr>
                <tr className="border-b border-[#222]">
                  <td className="px-3 py-1.5">
                    <span className="rounded-full border border-[#333] bg-[#2a2a2a] px-2 py-0.5 text-[10px] font-medium text-[#a0a0a0]">
                      WEAK
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-white">2+ pass</td>
                  <td className="px-3 py-1.5 text-white">any</td>
                  <td className="px-3 py-1.5">Partial agreement &mdash; may have merit but needs more confirmation</td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5">
                    <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400/60">
                      NONE
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-white">&lt; 2 pass</td>
                  <td className="px-3 py-1.5 text-white">any</td>
                  <td className="px-3 py-1.5">Scanners disagree &mdash; no actionable confluence</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SubSection title="Interpreting Results">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Strong signals are rare</strong> &mdash; expect only 2&ndash;5 per scan. These are your highest-conviction candidates.</li>
              <li><strong className="text-white">Moderate signals are the sweet spot</strong> &mdash; enough agreement to warrant research, common enough to build a watchlist.</li>
              <li><strong className="text-white">Weak signals need context</strong> &mdash; check which two scanners passed. EW + Squeeze is a different thesis than Pre-Run + Sector.</li>
              <li><strong className="text-white">None means move on</strong> &mdash; if the scanners can&rsquo;t agree, the setup lacks the alignment that drives reliable moves.</li>
            </ul>
          </SubSection>

          <Tip>
            Use the signal filter buttons at the top of the scanner to show only the levels you care about.
            For initial screening, include Strong and Moderate. Enable Weak only when you want a broader
            candidate list.
          </Tip>
        </Section>

        {/* Section 4: The Four Scanners */}
        <Section
          id="four-scanners"
          title="The Four Scanners"
          icon={<Activity className="h-5 w-5 text-pink-400" />}
        >
          <p>
            Each scanner analyzes a fundamentally different dimension. Together they cover technical
            positioning, supply-demand imbalance, fundamental catalysts, and macro tailwinds.
          </p>

          <ScannerCard
            name="Elliott Wave (EW) Scanner"
            color="text-[#5ba3e6]"
            what="Technical positioning based on wave structure, Fibonacci retracements, and momentum indicators."
            why="Identifies where a stock sits in its price cycle. A stock in early Wave 3 (strongest impulse phase) has very different upside potential than one completing Wave 5 (exhaustion)."
            scores="Enhanced score 0-25, normalized to 0-1. Factors in wave position, Fibonacci depth, RSI, MACD alignment, and pattern confidence."
            link="/guide"
            linkLabel="EW Guide"
          />

          <ScannerCard
            name="Short Squeeze Scanner"
            color="text-red-400"
            what="Supply-demand imbalance from short interest, float size, days to cover, and volume surges."
            why="Heavily shorted stocks with small floats can experience explosive forced-buying cascades when shorts cover. The scanner quantifies how ripe conditions are for this dynamic."
            scores="Composite score 0-100, normalized to 0-1. Weights SI%, days to cover, float size, volume ratio, proximity to 52-week low, and EW alignment."
            link="/squeeze/guide"
            linkLabel="Squeeze Guide"
          />

          <ScannerCard
            name="Pre-Run Scanner"
            color="text-emerald-400"
            what="Fundamental catalyst detection: beaten-down stocks with insider buying, upcoming earnings, or improving sentiment."
            why="Catches stocks that are technically cheap and have an identifiable catalyst that could trigger a re-rating. Focuses on the 'why now' question that pure technical analysis misses."
            scores="Final score 0-24, normalized to 0-1. Evaluates distance from ATH, short float, insider activity, earnings proximity, and analyst sentiment."
            link="/prerun/guide"
            linkLabel="Pre-Run Guide"
          />

          <ScannerCard
            name="Sector Rotation Scanner"
            color="text-amber-400"
            what="Macro tailwind detection using Relative Rotation Graphs (RRG), sector momentum, and rotation patterns."
            why="Even the best individual setup struggles against a sector headwind. Stocks in sectors rotating into the 'Leading' or 'Improving' RRG quadrant have macro support behind them."
            scores="Composite score 0-100, normalized to 0-1. Combines RRG quadrant position, momentum score, and rotation direction."
            link="/sectors/guide"
            linkLabel="Sector Guide"
          />
        </Section>

        {/* Section 5: Presets Explained */}
        <Section
          id="presets"
          title="Presets Explained"
          icon={<SlidersHorizontal className="h-5 w-5 text-pink-400" />}
        >
          <p>
            Presets configure both the weights (how much each scanner contributes to the blend) and
            thresholds (what score each scanner needs to &ldquo;pass&rdquo;). Choose a preset to match
            your investing thesis, or customize weights manually.
          </p>

          <div className="mt-4 space-y-2">
            <PresetExplainer
              name="Max Conviction"
              config="Weights: EW 30, Squeeze 25, PreRun 25, Sector 20 | Thresholds: EW 0.50, Squeeze 0.40, PreRun 0.50, Sector 0.50"
              desc="Highest thresholds across the board. All four scanners must show strong readings. Produces the fewest results but highest quality. Start here if you want a focused watchlist."
              recommended
            />
            <PresetExplainer
              name="Value Squeeze"
              config="Weights: EW 35, Squeeze 35, PreRun 20, Sector 10 | Thresholds: EW 0.45, Squeeze 0.35, PreRun 0.30, Sector 0.20"
              desc="Emphasizes technical positioning (EW) and short squeeze setup. Best for finding beaten-down stocks with both wave support and short covering potential. Sector weight is low since squeeze plays can work against sector trends."
            />
            <PresetExplainer
              name="Catalyst Driven"
              config="Weights: EW 20, Squeeze 15, PreRun 40, Sector 25 | Thresholds: EW 0.30, Squeeze 0.20, PreRun 0.45, Sector 0.40"
              desc="Heavily weights Pre-Run catalysts (insider buying, earnings, beaten-down) and sector momentum. Best for event-driven setups where you want a clear 'why now' trigger plus macro support."
            />
            <PresetExplainer
              name="Wide Net"
              config="Weights: EW 25, Squeeze 25, PreRun 25, Sector 25 | Thresholds: EW 0.25, Squeeze 0.20, PreRun 0.25, Sector 0.25"
              desc="Equal weights and low thresholds. Casts the widest net for initial screening. Use this to discover candidates you might miss with stricter presets, then switch to Max Conviction to filter."
            />
          </div>

          <SubSection title="Custom Weights">
            <p>
              Use the sidebar sliders to set your own weights and thresholds. Some guidelines:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Higher weight</strong> = that scanner contributes more to the final score</li>
              <li><strong className="text-white">Higher threshold</strong> = harder for that scanner to &ldquo;pass&rdquo; (fewer results, higher quality)</li>
              <li>Setting a weight to 0 effectively disables that scanner in the blend (but it still appears in pass count)</li>
              <li>The weights don&rsquo;t need to sum to 100 &mdash; they&rsquo;re normalized automatically</li>
            </ul>
          </SubSection>
        </Section>

        {/* Section 6: Using the Scanner */}
        <Section
          id="using-scanner"
          title="Using the Scanner"
          icon={<Target className="h-5 w-5 text-pink-400" />}
        >
          <SubSection title="Recommended Workflow">
            <ol className="list-inside list-decimal space-y-1.5 text-[#c0c0c0]">
              <li><strong className="text-white">Start with Max Conviction</strong> &mdash; run a scan, review any Strong signals first</li>
              <li><strong className="text-white">Expand to Moderate</strong> &mdash; if the Strong list is small, include Moderate signals for a broader set</li>
              <li><strong className="text-white">Expand rows for detail</strong> &mdash; click a result to see each scanner&rsquo;s individual score and what drove it</li>
              <li><strong className="text-white">Compare pass counts</strong> &mdash; a 4/4 pass at 62% is better than a 2/4 pass at 65% (more dimensions agree)</li>
              <li><strong className="text-white">Check which scanners passed</strong> &mdash; the colored dots show exactly which scanners agree. Context matters: EW + Squeeze is a technical-squeeze thesis; Pre-Run + Sector is a fundamental-macro thesis.</li>
              <li><strong className="text-white">Use sector filter</strong> &mdash; narrow results to sectors you&rsquo;re interested in or exclude sectors you want to avoid</li>
            </ol>
          </SubSection>

          <SubSection title="Sorting">
            <p>
              Click any column header to sort. The most useful sorts:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Confluence Score (default)</strong> &mdash; overall weighted blend, best for general screening</li>
              <li><strong className="text-white">Pass Count</strong> &mdash; how many scanners agree, regardless of score magnitude</li>
              <li><strong className="text-white">Individual scanner</strong> &mdash; sort by EW, Squeeze, Pre-Run, or Sector to find the strongest single-dimension setups</li>
            </ul>
          </SubSection>

          <SubSection title="Adding Custom Tickers">
            <p>
              Use the ticker search box to add stocks not in the default universe. The scanner will run all
              four analyses on any valid ticker. This is useful for:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Checking a stock someone recommended</li>
              <li>Verifying a position you already hold</li>
              <li>Comparing a candidate against the rest of the scan results</li>
            </ul>
          </SubSection>

          <SubSection title="Reading the Detail Panel">
            <p>
              When you expand a result row, you&rsquo;ll see each scanner&rsquo;s contribution:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Score bar</strong> &mdash; visual representation of the normalized score (0&ndash;1)</li>
              <li><strong className="text-white">Key metrics</strong> &mdash; the most important data point from each scanner (wave position, SI%, distance from ATH, RRG quadrant)</li>
              <li><strong className="text-white">Pass/fail dot</strong> &mdash; whether the score met the current threshold</li>
            </ul>
            <p className="mt-2 text-[#a0a0a0]">
              Use the detail panel to understand <em>why</em> a stock scored high or low. Two stocks with
              the same confluence score can have very different profiles.
            </p>
          </SubSection>

          <Tip>
            The scanner batches requests 10 at a time with a short delay between batches to avoid
            rate limits. A full scan of the universe takes 30&ndash;60 seconds depending on size. You can
            stop a scan in progress and work with partial results.
          </Tip>
        </Section>

        {/* Section 7: Risk Management */}
        <Section
          id="risk-management"
          title="Risk Management"
          icon={<Shield className="h-5 w-5 text-yellow-400" />}
        >
          <p>
            A strong confluence signal increases the probability of a favorable move, but it does not
            guarantee it. Risk management remains essential.
          </p>

          <SubSection title="Confluence Is Not Certainty">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>All four scanners use <strong className="text-white">historical and current data</strong> &mdash; they cannot predict sudden events (earnings misses, regulatory actions, black swans)</li>
              <li>Scores reflect conditions <strong className="text-white">at scan time</strong> &mdash; a Strong signal today may weaken tomorrow as prices and indicators change</li>
              <li>Short interest data has a <strong className="text-white">reporting lag</strong> (up to 2 weeks for FINRA data) &mdash; the squeeze score may not reflect recent covering</li>
              <li>Sector rotation data captures <strong className="text-white">relative trends</strong> &mdash; a leading sector can still decline in a broad market sell-off</li>
            </ul>
          </SubSection>

          <SubSection title="Position Sizing">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Size positions based on conviction level: <strong className="text-white">Strong &gt; Moderate &gt; Weak</strong></li>
              <li>Even for Strong signals, risk no more than <strong className="text-white">2&ndash;3% of portfolio</strong> per position</li>
              <li>Scale in rather than taking a full position at once &mdash; let the thesis confirm before adding</li>
              <li>Higher confluence score = larger allowable position, but always within your risk framework</li>
            </ul>
          </SubSection>

          <SubSection title="Sector Concentration">
            <p>
              Confluence scans can cluster results in a few hot sectors. If 4 of your top 5 results are
              in Technology, you&rsquo;re making a concentrated sector bet regardless of individual stock quality.
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Use the <strong className="text-white">sector filter</strong> to review concentration</li>
              <li>Limit exposure to <strong className="text-white">2&ndash;3 positions per sector</strong></li>
              <li>If a sector dominates results, it may be an opportunity &mdash; or a sign of crowded positioning</li>
            </ul>
          </SubSection>

          <SubSection title="Data Freshness">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Data Source</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Update Frequency</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Lag</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Price / Volume</td>
                    <td className="px-3 py-1.5">Daily</td>
                    <td className="px-3 py-1.5">End of previous trading day</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Short Interest (FINRA)</td>
                    <td className="px-3 py-1.5">Twice monthly</td>
                    <td className="px-3 py-1.5">Up to 2 weeks</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Elliott Wave Analysis</td>
                    <td className="px-3 py-1.5">On-demand (per scan)</td>
                    <td className="px-3 py-1.5">Real-time at scan</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">Sector Rotation (RRG)</td>
                    <td className="px-3 py-1.5">Weekly</td>
                    <td className="px-3 py-1.5">Previous week close</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <Tip>
            The best use of the confluence scanner is as a <strong className="text-white">starting point
            for research</strong>, not a final buy signal. A Strong confluence reading tells you where to
            look &mdash; your own due diligence determines whether to act.
          </Tip>
        </Section>

        {/* Back to scanner */}
        <div className="flex justify-center pt-2">
          <Link
            href="/confluence"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm font-medium text-[#5ba3e6] transition-colors hover:bg-[#262626]"
          >
            &larr; Back to Confluence Scanner
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
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-pink-400">{title}</p>
      <div className="text-sm text-[#c0c0c0]">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-pink-500/20 bg-pink-500/5 p-3">
      <p className="text-xs font-semibold text-pink-400">Pro Tip</p>
      <p className="mt-1 text-sm text-[#c0c0c0]">{children}</p>
    </div>
  );
}

function ScannerCard({
  name,
  color,
  what,
  why,
  scores,
  link,
  linkLabel,
}: {
  name: string;
  color: string;
  what: string;
  why: string;
  scores: string;
  link: string;
  linkLabel: string;
}) {
  return (
    <div className="mt-4 rounded-lg border border-[#2a2a2a] bg-[#262626] p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-sm font-semibold ${color}`}>{name}</p>
        <Link
          href={link}
          className="text-[10px] font-medium text-[#5ba3e6] transition-colors hover:text-white"
        >
          {linkLabel} &rarr;
        </Link>
      </div>
      <div className="space-y-2 text-sm text-[#c0c0c0]">
        <p><strong className="text-white">What it measures:</strong> {what}</p>
        <p><strong className="text-white">Why it matters:</strong> {why}</p>
        <p><strong className="text-white">Scoring:</strong> {scores}</p>
      </div>
    </div>
  );
}

function PresetExplainer({
  name,
  config,
  desc,
  recommended,
}: {
  name: string;
  config: string;
  desc: string;
  recommended?: boolean;
}) {
  return (
    <div className="rounded border border-[#333] bg-[#1a1a1a] p-2.5">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-white">{name}</p>
        {recommended && (
          <span className="rounded-full bg-pink-500/20 px-1.5 py-0.5 text-[9px] font-medium text-pink-400">
            Recommended
          </span>
        )}
      </div>
      <p className="mt-0.5 font-mono text-[10px] text-[#666]">{config}</p>
      <p className="mt-1 text-xs text-[#a0a0a0]">{desc}</p>
    </div>
  );
}
