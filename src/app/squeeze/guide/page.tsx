"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Zap,
  Target,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Shield,
  BookOpen,
  ArrowLeft,
} from "lucide-react";

const SECTIONS = [
  { id: "what-is-squeeze", label: "What Is It?" },
  { id: "anatomy", label: "Anatomy" },
  { id: "patterns", label: "Patterns" },
  { id: "case-studies", label: "Case Studies" },
  { id: "using-screener", label: "Screener Tips" },
  { id: "risk-management", label: "Risk Mgmt" },
];

export default function SqueezeGuidePage() {
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
              href="/squeeze"
              className="block rounded-md px-3 py-1.5 text-xs font-medium text-[#5ba3e6] transition-colors hover:bg-[#1a1a1a]"
            >
              &larr; Back to Screener
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
                  Short Squeeze Guide
                </h1>
                <p className="mt-1 text-[#a0a0a0]">
                  Mechanics, real-world case studies, and how to use the screener effectively.
                </p>
              </div>
            </div>
            <Link
              href="/squeeze"
              className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444] shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Screener
            </Link>
          </div>
        </section>

        {/* Section 1: What Is a Short Squeeze? */}
        <Section
          id="what-is-squeeze"
          title="What Is a Short Squeeze?"
          icon={<Zap className="h-5 w-5 text-red-400" />}
        >
          <p>
            A <strong className="text-white">short squeeze</strong> occurs when a heavily shorted stock rises sharply,
            forcing short sellers to buy back shares to cover their positions. This buying pressure drives the price even
            higher, creating a self-reinforcing feedback loop.
          </p>

          <SubSection title="How Short Selling Works">
            <ol className="list-inside list-decimal space-y-1.5 text-[#c0c0c0]">
              <li>A trader <strong className="text-white">borrows</strong> shares from a broker and sells them at the current price</li>
              <li>They hope to <strong className="text-white">buy back</strong> later at a lower price, pocketing the difference</li>
              <li>If the price <strong className="text-white">rises instead</strong>, they face unlimited potential losses</li>
              <li>The broker may issue a <strong className="text-white">margin call</strong>, forcing them to buy back at any price</li>
            </ol>
          </SubSection>

          <SubSection title="Why Squeezes Happen">
            <p>
              When enough shorts are forced to cover simultaneously, their buying creates a cascade:
              rising price &rarr; more margin calls &rarr; more forced buying &rarr; higher price. This
              feedback loop is what separates a squeeze from a normal rally.
            </p>
          </SubSection>

          <SubSection title="Squeeze vs Normal Rally">
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Attribute</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Normal Rally</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Short Squeeze</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Driver</td>
                    <td className="px-3 py-1.5">Organic buying</td>
                    <td className="px-3 py-1.5">Forced covering</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Duration</td>
                    <td className="px-3 py-1.5">Weeks to months</td>
                    <td className="px-3 py-1.5">Days to weeks</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Volume</td>
                    <td className="px-3 py-1.5">Gradually increasing</td>
                    <td className="px-3 py-1.5">Explosive spike (10-50x+)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">Sustainability</td>
                    <td className="px-3 py-1.5">Fundamentals-driven</td>
                    <td className="px-3 py-1.5">Collapses when covering ends</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>
        </Section>

        {/* Section 2: Anatomy of a Squeeze Setup */}
        <Section
          id="anatomy"
          title="Anatomy of a Squeeze Setup"
          icon={<Target className="h-5 w-5 text-red-400" />}
        >
          <p>
            Not every shorted stock squeezes. The best setups combine multiple conditions that make forced covering
            likely and explosive. Here are the key ingredients:
          </p>

          <div className="mt-4 space-y-3">
            <MetricCard
              label="SI% of Float"
              levels={[
                { range: ">20%", desc: "Elevated — significant short interest" },
                { range: ">50%", desc: "Extreme — very crowded short, high squeeze potential" },
                { range: ">100%", desc: "Rare — more shares shorted than available (rehypothecation)" },
              ]}
            >
              The percentage of available (float) shares that are sold short. Higher SI% means more
              shorts that could be forced to cover. This is the single most important squeeze metric.
            </MetricCard>

            <MetricCard
              label="Days to Cover (DTC)"
              levels={[
                { range: ">3 days", desc: "Significant — shorts can't cover quickly" },
                { range: ">6 days", desc: "Critical — would take over a week at normal volume" },
              ]}
            >
              Short interest divided by average daily volume. Higher DTC means it takes longer for
              all shorts to exit, extending the squeeze duration and price impact.
            </MetricCard>

            <MetricCard
              label="Float Size"
              levels={[
                { range: "<50M shares", desc: "Explosive — small supply amplifies buying pressure" },
                { range: "<150M shares", desc: "Squeeze-prone — manageable for retail coordination" },
              ]}
            >
              Total shares available for public trading. Smaller floats mean less supply to absorb
              covering demand, leading to more violent price moves.
            </MetricCard>

            <MetricCard
              label="Volume Surge"
              levels={[
                { range: ">3x avg", desc: "Ignition signal — unusual interest emerging" },
                { range: ">10x avg", desc: "Squeeze likely in progress" },
              ]}
            >
              Current volume compared to the 3-month average. A sudden volume spike often signals the
              start of a squeeze as covering begins and momentum traders pile in.
            </MetricCard>

            <MetricCard
              label="Near 52-Week Low"
              levels={[
                { range: "<20% above", desc: "Maximum pain zone — shorts most complacent" },
                { range: "<30% above", desc: "Elevated risk zone for shorts" },
              ]}
            >
              Stocks near their 52-week low have complacent shorts sitting on large unrealized profits.
              Any positive catalyst triggers a scramble to lock in gains before they evaporate.
            </MetricCard>

            <MetricCard
              label="Market Cap"
              levels={[
                { range: "<$1B", desc: "Micro cap — most explosive but highest risk" },
                { range: "<$5B", desc: "Small/mid cap — sweet spot for squeeze mechanics" },
              ]}
            >
              Larger companies have too much liquidity for a squeeze to sustain. The most dramatic
              squeezes happen in small and micro caps where retail flow can move the price.
            </MetricCard>
          </div>
        </Section>

        {/* Section 3: Common Patterns */}
        <Section
          id="patterns"
          title="Common Patterns Across Squeezes"
          icon={<TrendingUp className="h-5 w-5 text-red-400" />}
        >
          <SubSection title='The "Perfect Storm" Checklist'>
            <p className="mb-2">
              The highest-probability squeezes share most or all of these conditions:
            </p>
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">SI% &gt; 20%</strong> of float (higher = better)</li>
              <li><strong className="text-white">Days to Cover &gt; 3</strong> (shorts can&rsquo;t exit quickly)</li>
              <li><strong className="text-white">Float &lt; 150M</strong> shares (limited supply)</li>
              <li><strong className="text-white">Market cap &lt; $5B</strong> (retail flow can move the price)</li>
              <li><strong className="text-white">Near 52-week lows</strong> (complacent shorts, maximum pain potential)</li>
              <li><strong className="text-white">Identifiable catalyst</strong> (earnings, activist, regulatory, retail coordination)</li>
            </ul>
            <p className="mt-2 text-[#888]">
              Each missing condition reduces the probability and magnitude. GME had all six. AMC had 3-4. BBBY had 4-5 but the catalyst evaporated.
            </p>
          </SubSection>

          <SubSection title="Volume as Confirmation">
            <p>
              Volume is the strongest real-time signal that a squeeze is in progress. Normal pre-squeeze volume is 1-3x average.
              Once covering begins:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">3-10x avg</strong> &mdash; Early ignition phase, covering beginning</li>
              <li><strong className="text-white">10-50x avg</strong> &mdash; Active squeeze, forced covering in progress</li>
              <li><strong className="text-white">50x+ avg</strong> &mdash; Peak squeeze, maximum buying pressure</li>
            </ul>
            <p className="mt-2 text-[#888]">
              When volume drops back to normal, the squeeze is ending. This is the single best timing indicator for exits.
            </p>
          </SubSection>

          <SubSection title="Catalyst Types">
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Catalyst</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Example</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Strength</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Fundamental turnaround</td>
                    <td className="px-3 py-1.5">CVNA debt restructuring</td>
                    <td className="px-3 py-1.5 text-green-400">Strongest (sustained)</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Activist investor</td>
                    <td className="px-3 py-1.5">Ryan Cohen at GME</td>
                    <td className="px-3 py-1.5 text-green-400">Strong</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Regulatory/index change</td>
                    <td className="px-3 py-1.5">TSLA S&P 500 inclusion</td>
                    <td className="px-3 py-1.5 text-yellow-400">Moderate (one-time)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">Retail coordination</td>
                    <td className="px-3 py-1.5">AMC Reddit momentum</td>
                    <td className="px-3 py-1.5 text-yellow-400">Moderate (fragile)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Failed Squeezes: What Goes Wrong">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Share dilution</strong> &mdash; Company issues new shares into the rally, flooding supply (AMC, BBBY)</li>
              <li><strong className="text-white">No catalyst</strong> &mdash; High SI alone isn&rsquo;t enough; shorts can wait indefinitely if nothing forces action</li>
              <li><strong className="text-white">Shorts add positions</strong> &mdash; Instead of covering, experienced shorts add at higher prices, betting on the eventual collapse</li>
              <li><strong className="text-white">Broker intervention</strong> &mdash; Trading restrictions or halts break momentum (GME Jan 28)</li>
              <li><strong className="text-white">Low float deception</strong> &mdash; Reported float is inaccurate; actual available supply is higher than expected</li>
            </ul>
          </SubSection>

          <SubSection title="Timing">
            <p>
              Most squeezes follow a predictable arc:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Build-up (weeks-months)</strong> &mdash; SI increases, price drifts near lows, setup conditions align</li>
              <li><strong className="text-white">Ignition (1-3 days)</strong> &mdash; Catalyst appears, volume spikes 3-10x, price breaks key resistance</li>
              <li><strong className="text-white">Squeeze (3-10 days)</strong> &mdash; Forced covering cascade, 50x+ volume, parabolic price action</li>
              <li><strong className="text-white">Exhaustion (1-3 days)</strong> &mdash; Volume drops, no new shorts to cover, price peaks</li>
              <li><strong className="text-white">Collapse (days-weeks)</strong> &mdash; Price retraces 50-80%+ as momentum buyers exit</li>
            </ul>
            <p className="mt-2 text-[#888]">
              Exception: Fundamental turnarounds (CVNA, TSLA) can sustain elevated prices because the
              thesis changes. Pure momentum squeezes (AMC, BBBY) almost always give back most gains.
            </p>
          </SubSection>
        </Section>

        {/* Section 4: Real-World Case Studies */}
        <Section
          id="case-studies"
          title="Real-World Case Studies"
          icon={<BarChart3 className="h-5 w-5 text-red-400" />}
        >
          <p>
            Studying past squeezes reveals the common conditions and catalysts. Every squeeze is different,
            but the underlying mechanics are remarkably consistent.
          </p>

          {/* GME */}
          <CaseStudy
            ticker="GME"
            name="GameStop"
            period="January 2021"
            move="$20 → $483 (24x)"
            verdict="The archetypal modern squeeze"
          >
            <CaseStudyTable
              rows={[
                ["SI% of Float", "~140%"],
                ["Days to Cover", "~6"],
                ["Float", "~50M shares"],
                ["Market Cap (pre)", "~$1.4B"],
                ["Catalyst", "Reddit/WallStreetBets coordination + Ryan Cohen activist position"],
              ]}
            />
            <p className="mt-3">
              GameStop had more shares sold short than actually existed in the float (140% SI). When
              r/WallStreetBets identified this extreme setup and began buying shares and call options,
              the resulting gamma squeeze on market makers amplified the covering cascade. Brokers
              restricted buying on Jan 28, ending the squeeze at $483. The stock settled around $40-80
              in the months after.
            </p>
            <p className="mt-2">
              <strong className="text-white">Key lesson:</strong> SI% above 100% is the single strongest
              signal. Combined with a small float and a catalyst (activist investor), it created
              the most dramatic squeeze in modern history.
            </p>
          </CaseStudy>

          {/* CVNA */}
          <CaseStudy
            ticker="CVNA"
            name="Carvana"
            period="2023–2024"
            move="$3.55 → $250+ (70x)"
            verdict="Fundamental turnaround + short squeeze"
          >
            <CaseStudyTable
              rows={[
                ["SI% of Float", "~70%"],
                ["Days to Cover", "5–7"],
                ["Float", "~105M shares"],
                ["Low Price", "$3.55 (Dec 2022)"],
                ["Catalyst", "Debt restructuring + return to profitability"],
              ]}
            />
            <p className="mt-3">
              Carvana was widely expected to go bankrupt after its stock crashed 99% from the 2021 peak.
              Short interest climbed to 70% of float. When the company successfully restructured its
              debt and showed improving unit economics, the fundamental turnaround forced a slow-motion
              squeeze over 12+ months. Unlike GME&rsquo;s explosive 2-week spike, CVNA&rsquo;s squeeze played
              out gradually as shorts covered into each leg higher.
            </p>
            <p className="mt-2">
              <strong className="text-white">Key lesson:</strong> Fundamental turnarounds create the most
              sustainable squeezes. Shorts can&rsquo;t re-short into improving fundamentals, so covering
              pressure persists for months.
            </p>
          </CaseStudy>

          {/* AMC */}
          <CaseStudy
            ticker="AMC"
            name="AMC Entertainment"
            period="June 2021"
            move="$2 → $72 (36x)"
            verdict="Retail-driven momentum squeeze"
          >
            <CaseStudyTable
              rows={[
                ["SI% of Float", "~20%"],
                ["Days to Cover", "~1-2"],
                ["Float", "~500M shares"],
                ["Market Cap (pre)", "~$1B"],
                ["Catalyst", "Reddit retail coordination + meme stock momentum"],
              ]}
            />
            <p className="mt-3">
              AMC had more modest short interest than GME (20% vs 140%) and a much larger float (500M vs 50M).
              The squeeze was driven primarily by retail buying momentum rather than forced covering. AMC&rsquo;s
              management issued new shares during the squeeze, diluting existing shareholders but raising
              capital to avoid bankruptcy.
            </p>
            <p className="mt-2">
              <strong className="text-white">Key lesson:</strong> A large float makes squeezes harder to sustain.
              AMC&rsquo;s move was more momentum-driven than mechanically forced. Watch for management dilution &mdash;
              companies can issue shares into a squeeze, ending it.
            </p>
          </CaseStudy>

          {/* VW */}
          <CaseStudy
            ticker="VOW3"
            name="Volkswagen"
            period="October 2008"
            move="€200 → €1,000 (5x)"
            verdict="The &ldquo;corner&rdquo; squeeze — float manipulation"
          >
            <CaseStudyTable
              rows={[
                ["SI% of Float", "~13% (headline)"],
                ["Effective Float", "<6% (Porsche held 74% + options)"],
                ["Catalyst", "Porsche disclosed 74% ownership + options on another 31%"],
                ["Duration", "~2 trading days"],
                ["Context", "2008 financial crisis — hedge funds were already short"],
              ]}
            />
            <p className="mt-3">
              The headline SI% of 13% looked manageable, but Porsche had secretly accumulated 74% of VW
              shares plus call options on another 31%. This left less than 6% of shares actually available.
              When Porsche disclosed this position, VW briefly became the most valuable company in the world
              by market cap. Hedge funds lost billions.
            </p>
            <p className="mt-2">
              <strong className="text-white">Key lesson:</strong> Effective float matters more than headline float.
              Check institutional and insider ownership &mdash; if 80% of shares are locked up, even moderate SI%
              becomes extreme relative to available supply.
            </p>
          </CaseStudy>

          {/* TSLA */}
          <CaseStudy
            ticker="TSLA"
            name="Tesla"
            period="2020"
            move="$80 → $900 (11x)"
            verdict="Macro catalyst + sustained covering"
          >
            <CaseStudyTable
              rows={[
                ["SI% of Float", "~20%"],
                ["Float", "~800M shares"],
                ["Market Cap Range", "$80B → $800B"],
                ["Catalyst", "S&P 500 inclusion + EV narrative + profitability"],
                ["Duration", "~12 months of sustained covering"],
              ]}
            />
            <p className="mt-3">
              Tesla&rsquo;s squeeze was unique because it happened in a mega-cap stock over a full year. Multiple
              catalysts (consistent profitability, S&P 500 inclusion, EV growth narrative) made shorting
              increasingly painful. Each quarter of better-than-expected results forced another wave of
              covering. The S&P 500 inclusion in Dec 2020 triggered index fund buying worth ~$80B.
            </p>
            <p className="mt-2">
              <strong className="text-white">Key lesson:</strong> Squeezes can happen in large caps if catalysts
              are strong enough and sustained. TSLA shorts were &ldquo;right on fundamentals but wrong on timing&rdquo;
              for years.
            </p>
          </CaseStudy>

          {/* CAR */}
          <CaseStudy
            ticker="CAR"
            name="Avis Budget Group"
            period="November 2021"
            move="$170 → $545 (3.2x in 2 days)"
            verdict="Earnings surprise + low float squeeze"
          >
            <CaseStudyTable
              rows={[
                ["SI% of Float", "~24%"],
                ["Days to Cover", "~3-4"],
                ["Float", "~37M shares"],
                ["Market Cap (pre)", "~$12B"],
                ["Catalyst", "Record Q3 earnings — $10.74 EPS vs $7.24 expected + EV fleet announcement"],
              ]}
            />
            <p className="mt-3">
              Avis reported blowout Q3 2021 earnings, beating estimates by 48%, and announced plans to
              electrify its rental fleet. The stock surged from $170 to $545 in two trading sessions on
              Nov 1-2, with volume hitting 50x normal. Circuit breakers halted trading multiple times on
              Nov 2. The tiny 37M share float amplified the move &mdash; with 24% short, there simply
              weren&rsquo;t enough shares for shorts to cover without driving the price parabolic.
            </p>
            <p className="mt-2">
              <strong className="text-white">Key lesson:</strong> Earnings surprises are the most common
              institutional squeeze catalyst. A small float (37M) combined with moderate SI (24%) can be
              just as explosive as higher SI with a larger float. The stock settled back to ~$300 within a
              week &mdash; the initial spike overshoots, then finds a new equilibrium.
            </p>
          </CaseStudy>

          {/* BBBY */}
          <CaseStudy
            ticker="BBBY"
            name="Bed Bath &amp; Beyond"
            period="August 2022"
            move="$5 → $30 (6x), then collapse"
            verdict="Failed squeeze — the cautionary tale"
          >
            <CaseStudyTable
              rows={[
                ["SI% of Float", "~40%"],
                ["Float", "~80M shares"],
                ["Catalyst", "Ryan Cohen position + Reddit momentum"],
                ["Peak Duration", "~1 week"],
                ["Aftermath", "Cohen sold, company filed bankruptcy in 2023"],
              ]}
            />
            <p className="mt-3">
              BBBY had genuine squeeze conditions (40% SI, small float) and a recognizable catalyst (Ryan Cohen).
              But Cohen sold his position near the top, momentum collapsed, and the company&rsquo;s deteriorating
              fundamentals couldn&rsquo;t support the elevated price. The stock fell back to $5 within weeks and
              the company eventually filed for bankruptcy.
            </p>
            <p className="mt-2">
              <strong className="text-white">Key lesson:</strong> Squeeze mechanics without fundamental support
              create short-lived spikes. Always have an exit plan. When the catalyst disappears (Cohen selling),
              the squeeze unwinds violently.
            </p>
          </CaseStudy>
        </Section>

        {/* Section 5: Using the Screener */}
        <Section
          id="using-screener"
          title="Using the Screener Effectively"
          icon={<Target className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <SubSection title="Presets Explained">
            <div className="mt-2 space-y-2">
              <PresetExplainer
                name="GME-Style Setup"
                filters="SI >20%, DTC >3, Float <150M, MktCap <$5B, Near Low <30%"
                desc="Mirrors the conditions that preceded GME's squeeze. Best signal quality — fewer candidates, higher conviction."
              />
              <PresetExplainer
                name="Volume Ignition"
                filters="SI >10%, DTC >2, Volume >2x avg"
                desc="Catches squeezes that may already be starting. The volume surge filter is key — it finds active covering, not just setups."
              />
              <PresetExplainer
                name="Micro Float Bomb"
                filters="SI >15%, DTC >2, Float <20M"
                desc="Tiny floats with extreme squeeze mechanics. Highest volatility and risk. Best for small positions with asymmetric upside."
              />
              <PresetExplainer
                name="Near 52w Low"
                filters="SI >10%, Near Low <20%, MktCap <$10B"
                desc="Finds complacent shorts near 52-week lows. These stocks have the most 'potential energy' — any positive catalyst creates maximum pain for shorts."
              />
              <PresetExplainer
                name="Wide Net"
                filters="SI >5%, DTC >1"
                desc="Relaxed filters for initial screening. Returns the most candidates. Use this first, then narrow with stricter presets."
              />
            </div>
          </SubSection>

          <SubSection title="How Scores Work">
            <p className="mb-2">
              The screener assigns a <strong className="text-white">0-100 composite score</strong> based on six components:
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Component</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Max Pts</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">What It Measures</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">SI %</td>
                    <td className="px-3 py-1.5">25</td>
                    <td className="px-3 py-1.5">Short interest as % of float &mdash; the core squeeze metric</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Days to Cover</td>
                    <td className="px-3 py-1.5">15</td>
                    <td className="px-3 py-1.5">How long it takes shorts to exit at normal volume</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Float Size</td>
                    <td className="px-3 py-1.5">15</td>
                    <td className="px-3 py-1.5">Available shares for trading &mdash; smaller = more explosive</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Volume Surge</td>
                    <td className="px-3 py-1.5">15</td>
                    <td className="px-3 py-1.5">Current volume vs 3-month average &mdash; ignition detection</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">Near 52w Low</td>
                    <td className="px-3 py-1.5">15</td>
                    <td className="px-3 py-1.5">Proximity to annual low &mdash; complacent short indicator</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">EW Alignment</td>
                    <td className="px-3 py-1.5">15</td>
                    <td className="px-3 py-1.5">Elliott Wave position in a squeeze-favorable zone</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-red-500/30 bg-red-500/20 px-2.5 py-1 text-[10px] font-medium text-red-400">
                65+ = High Squeeze Potential
              </span>
              <span className="rounded-full border border-yellow-500/30 bg-yellow-500/20 px-2.5 py-1 text-[10px] font-medium text-yellow-400">
                40-64 = Medium Potential
              </span>
              <span className="rounded-full border border-[#333] bg-[#2a2a2a] px-2.5 py-1 text-[10px] font-medium text-[#a0a0a0]">
                &lt;40 = Low Potential
              </span>
            </div>
          </SubSection>

          <SubSection title="EW Wave Alignment">
            <p>
              The optional Elliott Wave enrichment identifies stocks in squeeze-favorable wave positions.
              The best squeeze setups coincide with:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li><strong className="text-white">Wave 2 bottom</strong> &mdash; End of a corrective decline, about to enter impulsive Wave 3 (strongest rally phase)</li>
              <li><strong className="text-white">Wave C completion</strong> &mdash; End of an A-B-C correction, maximum pessimism, shorts most extended</li>
              <li><strong className="text-white">Wave 4 pullback</strong> &mdash; Shallow dip in an uptrend that triggers short entries, then reverses sharply into Wave 5</li>
            </ul>
            <p className="mt-2 text-[#888]">
              Click &ldquo;Enrich Top 20 with EW Wave Position&rdquo; after scanning to add wave labels. This uses
              the same AI analysis as the main EW Scanner.
            </p>
          </SubSection>

          <Tip>
            FINRA short interest data is reported twice monthly with a ~2 week delay. The SI% you see
            in the screener may not reflect the most recent covering activity. Combine with real-time
            volume analysis — if volume is spiking while reported SI is high, covering may be happening now.
          </Tip>
        </Section>

        {/* Section 6: Risk Management */}
        <Section
          id="risk-management"
          title="Risk Management for Squeeze Plays"
          icon={<Shield className="h-5 w-5 text-yellow-400" />}
        >
          <p>
            Squeeze plays have asymmetric upside but also extreme volatility. Position sizing and exit
            discipline are critical.
          </p>

          <SubSection title="Position Sizing">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Risk <strong className="text-white">1-2% of portfolio</strong> per squeeze play (high volatility = smaller positions)</li>
              <li>Never let a single squeeze candidate exceed <strong className="text-white">5% of portfolio</strong></li>
              <li>Consider <strong className="text-white">call options</strong> for defined-risk exposure &mdash; you can lose 100% of the premium but not more</li>
              <li>If using shares, position size for a <strong className="text-white">30-50% drawdown</strong> scenario and ensure you can hold through it</li>
            </ul>
          </SubSection>

          <SubSection title="Stop Placement">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>Below the <strong className="text-white">most recent swing low</strong> or key support level</li>
              <li>For volatile small caps, use a <strong className="text-white">wider stop (15-25%)</strong> &mdash; tight stops get hunted in pre-squeeze chop</li>
              <li>Consider <strong className="text-white">mental stops</strong> instead of hard stops to avoid being stopped out by intraday wicks</li>
              <li>If your stop hits, <strong className="text-white">don&rsquo;t re-enter</strong> the same day &mdash; reassess the thesis</li>
            </ul>
          </SubSection>

          <SubSection title="Profit Taking Strategy">
            <p className="mb-2">Scale out in thirds to capture upside while locking in gains:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#333]">
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Tranche</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Exit Target</th>
                    <th className="px-3 py-2 text-left text-[#a0a0a0]">Rationale</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">1/3 position</td>
                    <td className="px-3 py-1.5">2x entry price</td>
                    <td className="px-3 py-1.5">Lock in initial gains, reduce risk to near zero</td>
                  </tr>
                  <tr className="border-b border-[#222]">
                    <td className="px-3 py-1.5 text-white">1/3 position</td>
                    <td className="px-3 py-1.5">3-5x entry price</td>
                    <td className="px-3 py-1.5">Capture the bulk of the squeeze move</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1.5 text-white">1/3 runner</td>
                    <td className="px-3 py-1.5">Trail stop or thesis invalidation</td>
                    <td className="px-3 py-1.5">Let the runner catch outlier moves (GME-type scenarios)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Failed Squeeze Exit Plan">
            <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
              <li>If volume dies back to normal and the price stalls &mdash; <strong className="text-white">exit immediately</strong></li>
              <li>If the company announces a <strong className="text-white">share offering</strong> &mdash; exit (dilution kills squeeze mechanics)</li>
              <li>If the key catalyst disappears (activist sells, earnings miss) &mdash; <strong className="text-white">reassess or exit</strong></li>
              <li>Set a <strong className="text-white">time stop</strong>: if nothing happens in 2-3 weeks after entry, the setup likely failed</li>
            </ul>
          </SubSection>

          <SubSection title="Warning Signs">
            <div className="flex flex-wrap gap-2 mt-2">
              <WarningBadge>Insider selling during rally</WarningBadge>
              <WarningBadge>Share dilution announced</WarningBadge>
              <WarningBadge>Borrow rate dropping</WarningBadge>
              <WarningBadge>Volume returning to normal</WarningBadge>
              <WarningBadge>SI% declining rapidly</WarningBadge>
              <WarningBadge>Broker trading restrictions</WarningBadge>
            </div>
          </SubSection>

          <Tip>
            The best squeeze plays are ones where you&rsquo;d be comfortable holding the stock even if the squeeze
            doesn&rsquo;t happen. CVNA holders who bought for the turnaround thesis profited regardless. BBBY holders
            who bought purely for the squeeze got burned.
          </Tip>
        </Section>

        {/* Back to screener */}
        <div className="flex justify-center pt-2">
          <Link
            href="/squeeze"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm font-medium text-[#5ba3e6] transition-colors hover:bg-[#262626]"
          >
            &larr; Back to Squeeze Screener
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

function MetricCard({
  label,
  levels,
  children,
}: {
  label: string;
  levels: { range: string; desc: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#262626] p-4">
      <p className="mb-1 text-sm font-semibold text-white">{label}</p>
      <p className="text-sm text-[#c0c0c0]">{children}</p>
      <div className="mt-2 space-y-1">
        {levels.map((l) => (
          <div key={l.range} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-red-400">
              {l.range}
            </span>
            <span className="text-[#888]">{l.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseStudy({
  ticker,
  name,
  period,
  move,
  verdict,
  children,
}: {
  ticker: string;
  name: string;
  period: string;
  move: string;
  verdict: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg border border-[#2a2a2a] bg-[#262626] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded bg-red-500/20 px-2 py-0.5 text-sm font-bold text-red-400">
          {ticker}
        </span>
        <span className="text-sm font-medium text-white">{name}</span>
        <span className="text-xs text-[#666]">{period}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        <span className="text-green-400">{move}</span>
        <span className="text-[#888]">&mdash; {verdict}</span>
      </div>
      <div className="text-sm text-[#c0c0c0]">{children}</div>
    </div>
  );
}

function CaseStudyTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-[#333]">
              <td className="px-2 py-1.5 text-[#888] w-36">{label}</td>
              <td className="px-2 py-1.5 text-white">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PresetExplainer({
  name,
  filters,
  desc,
}: {
  name: string;
  filters: string;
  desc: string;
}) {
  return (
    <div className="rounded border border-[#333] bg-[#1a1a1a] p-2.5">
      <p className="text-xs font-semibold text-white">{name}</p>
      <p className="mt-0.5 font-mono text-[10px] text-[#666]">{filters}</p>
      <p className="mt-1 text-xs text-[#888]">{desc}</p>
    </div>
  );
}

function WarningBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-[10px] font-medium text-yellow-400">
      {children}
    </span>
  );
}
