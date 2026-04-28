"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, AlertTriangle, TrendingUp, Zap, Target, Shield, Layers, ChevronDown, ChevronUp, ClipboardList, Database, Sparkles } from "lucide-react";

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
        <Icon className="h-5 w-5 text-[#5ba3e6]" />
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-[#c0c0c0]">
        {children}
      </div>
    </section>
  );
}

function CaseStudy({
  ticker,
  name,
  gain,
  children,
}: {
  ticker: string;
  name: string;
  gain: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-sm font-bold text-white">{ticker}</span>
        <span className="text-xs text-[#a0a0a0]">{name}</span>
        <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
          +{gain}
        </span>
      </div>
      <div className="text-xs leading-relaxed text-[#a0a0a0]">{children}</div>
    </div>
  );
}

function GateRow({
  gate,
  label,
  passDesc,
  failDesc,
}: {
  gate: string;
  label: string;
  passDesc: string;
  failDesc: string;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-[#185FA5]/20 px-2 py-0.5 text-xs font-bold text-[#5ba3e6]">
          {gate}
        </span>
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="font-medium text-green-400">PASS:</span>{" "}
          <span className="text-[#a0a0a0]">{passDesc}</span>
        </div>
        <div>
          <span className="font-medium text-red-400">FAIL:</span>{" "}
          <span className="text-[#a0a0a0]">{failDesc}</span>
        </div>
      </div>
    </div>
  );
}

function CriterionRow({
  label,
  letter,
  weight,
  score3,
  score2,
  score1,
  score0,
}: {
  label: string;
  letter: string;
  weight: string;
  score3?: string;
  score2: string;
  score1: string;
  score0: string;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-purple-500/20 text-xs font-bold text-purple-400">
          {letter}
        </span>
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-[#666]">
          {weight}
        </span>
      </div>
      <div className="space-y-1 text-xs">
        {score3 && (
          <div className="flex items-start gap-2">
            <span className="w-4 shrink-0 font-bold text-emerald-400">3</span>
            <span className="text-[#a0a0a0]">{score3}</span>
          </div>
        )}
        <div className="flex items-start gap-2">
          <span className="w-4 shrink-0 font-bold text-green-400">2</span>
          <span className="text-[#a0a0a0]">{score2}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-4 shrink-0 font-bold text-yellow-400">1</span>
          <span className="text-[#a0a0a0]">{score1}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-4 shrink-0 font-bold text-red-400">0</span>
          <span className="text-[#a0a0a0]">{score0}</span>
        </div>
      </div>
    </div>
  );
}

function QuickReferenceCard() {
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-lg border border-[#5ba3e6]/30 bg-[#1a1a1a] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <ClipboardList className="h-5 w-5 text-[#5ba3e6]" />
          Quick Reference
        </h2>
        {open ? (
          <ChevronUp className="h-5 w-5 text-[#666]" />
        ) : (
          <ChevronDown className="h-5 w-5 text-[#666]" />
        )}
      </button>

      {open && (
        <div className="border-t border-[#2a2a2a] px-6 pb-6 pt-4 space-y-5">
          {/* Gates Table */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              3 Hard Gates (all must pass)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Gate</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Rule</th>
                    <th className="py-1.5 text-left font-medium">Pass</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-3 font-medium text-white">G1</td>
                    <td className="py-1.5 pr-3">Not already run</td>
                    <td className="py-1.5">&ge;40% below ATH</td>
                  </tr>
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-3 font-medium text-white">G2</td>
                    <td className="py-1.5 pr-3">No existential risk</td>
                    <td className="py-1.5">No DOJ/SEC/delisting (manual)</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 font-medium text-white">G3</td>
                    <td className="py-1.5 pr-3">Base forming</td>
                    <td className="py-1.5">Price &gt; SMA20 &times; 0.92</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Criteria Table */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              11 Criteria (max 24 pts + sector modifier)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-2 text-left font-medium w-6"></th>
                    <th className="py-1.5 pr-3 text-left font-medium">Criterion</th>
                    <th className="py-1.5 pr-2 text-center font-medium">Max</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Score 0</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Score 1</th>
                    <th className="py-1.5 text-left font-medium">Score 2 (or 3)</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  {[
                    { l: "A", name: "Dead Money Base", max: 2, s0: "No discount", s1: "25%+ / 8+ wks", s2: "40%+ / 13+ wks" },
                    { l: "B", name: "Short Interest", max: 3, s0: "SI <5%", s1: "SI 5-15%", s2: "3: SI>20% + small cap" },
                    { l: "C", name: "Narrative Catalyst", max: 3, s0: "No catalyst", s1: "Speculative", s2: "3: Multiple catalysts" },
                    { l: "D", name: "Earnings Inflection", max: 2, s0: "Declining rev", s1: "Growth or near earn", s2: "Accel rev + earn <60d" },
                    { l: "E", name: "Inst. Under-Ownership", max: 2, s0: "Inst >70%", s1: "Inst 40-70%", s2: "Inst <40%" },
                    { l: "F", name: "Volume Accumulation", max: 2, s0: "Distribution", s1: "Neutral", s2: "Up/Down >1.3x or float turnover" },
                    { l: "G", name: "Index Inclusion", max: 2, s0: "N/A", s1: "Possible", s2: "Plausible <18mo" },
                    { l: "H", name: "Insider Buying", max: 2, s0: "None 90d", s1: "1-2 buys", s2: "3+ cluster buys" },
                    { l: "I", name: "Options Flow", max: 2, s0: "P/C >1.0", s1: "P/C 0.5-1.0", s2: "P/C <0.5 (bullish)" },
                    { l: "J", name: "Rel. Strength vs Sector", max: 2, s0: "Under by >5%", s1: "Within 5%", s2: "Over by >5%" },
                    { l: "K", name: "Breakout Proximity", max: 2, s0: ">10% below resist", s1: "5-10% below", s2: "<5% (coiling)" },
                  ].map((c) => (
                    <tr key={c.l} className="border-b border-[#2a2a2a]/50">
                      <td className="py-1.5 pr-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-purple-500/20 text-[10px] font-bold text-purple-400">
                          {c.l}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 font-medium text-white whitespace-nowrap">{c.name}</td>
                      <td className="py-1.5 pr-2 text-center text-[#5ba3e6]">{c.max}</td>
                      <td className="py-1.5 pr-3 text-red-400/70">{c.s0}</td>
                      <td className="py-1.5 pr-3 text-amber-400/70">{c.s1}</td>
                      <td className="py-1.5 text-green-400/70">{c.s2}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-[#5ba3e6]/20 text-[10px] font-bold text-[#5ba3e6]">
                        +
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 font-medium text-white whitespace-nowrap">Sector Momentum</td>
                    <td className="py-1.5 pr-2 text-center text-[#5ba3e6]">&plusmn;1</td>
                    <td className="py-1.5 pr-3 text-red-400/70">-1 if sector &lt;-5%</td>
                    <td className="py-1.5 pr-3 text-[#c0c0c0]">0 (neutral)</td>
                    <td className="py-1.5 text-green-400/70">+1 if sector &gt;+5%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10px] text-[#666]">
              Time decay: Bases &gt;2 years (104 weeks) halve score A. B &amp; C expanded to 0-3 (highest predictive signal).
            </p>
          </div>

          {/* Verdict Thresholds */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              Verdict Thresholds
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-purple-400">PRIORITY</p>
                <p className="text-xs text-[#c0c0c0]">&ge;15 + earn &lt;14d</p>
              </div>
              <div className="rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-green-400">KEEP</p>
                <p className="text-xs text-[#c0c0c0]">&ge;15</p>
              </div>
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-amber-400">WATCH</p>
                <p className="text-xs text-[#c0c0c0]">&ge;11</p>
              </div>
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-red-400">DISCARD</p>
                <p className="text-xs text-[#c0c0c0]">&lt;11 or gate fail</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function PreRunGuidePage() {
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/prerun/webhook/tradingview`
      : "https://ew-scanner.vercel.app/api/prerun/webhook/tradingview";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Pre-Run Scanner Framework
        </h1>
        <p className="mt-2 text-[#a0a0a0]">
          Identifying stocks in the early accumulation phase before a major
          multi-bagger run. Modeled on what SNDK, CAR, and CVNA looked like{" "}
          <em>before</em> their runs.
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/prerun"
            className="rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#185FA5]/80"
          >
            Open Scanner
          </Link>
          <Link
            href="/prerun/watchlist"
            className="rounded-md border border-[#2a2a2a] px-4 py-2 text-sm font-medium text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
          >
            View Watchlist
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        {/* Quick Reference Card */}
        <QuickReferenceCard />

        {/* Case Studies */}
        <Section icon={TrendingUp} title="Case Studies: What Multi-Baggers Looked Like Before the Run">
          <p>
            Every stock that made a 3x-20x move shared a specific pattern in the
            months before. The Pre-Run framework identifies these patterns
            systematically.
          </p>
          <div className="space-y-3 pt-2">
            <CaseStudy ticker="SNDK" name="Western Digital Spinoff" gain="900%">
              <p>
                Dead money at $30-40 for 18 months while market ignored the
                flash storage transition. Short interest at 18%. Then enterprise
                SSD demand inflected, revenue accelerated 3 quarters in a row,
                and the stock ran from $40 to $400.
              </p>
              <p className="mt-1 font-medium text-[#5ba3e6]">
                Pattern: Long base + high SI + structural demand shift + earnings
                inflection = explosive move.
              </p>
            </CaseStudy>
            <CaseStudy ticker="CAR" name="Avis Budget Group" gain="264% in 30 days">
              <p>
                Rental car fleet depleted during COVID. Post-pandemic travel
                surge + chip shortage meant zero new cars available. Short
                interest at 24%. When earnings showed pricing power, shorts
                scrambled and stock went from $100 to $364 in one month.
              </p>
              <p className="mt-1 font-medium text-[#5ba3e6]">
                Pattern: Supply shock + high SI + narrative shift from &ldquo;dead
                industry&rdquo; to &ldquo;pricing power&rdquo; = short squeeze + fundamental
                re-rate.
              </p>
            </CaseStudy>
            <CaseStudy ticker="CVNA" name="Carvana" gain="2,000%+ from lows">
              <p>
                Written off as bankrupt at $3.55. Debt restructuring + used car
                market recovery + operational turnaround. Short interest &gt;30%.
                Stock ran from $3.55 to $260+ as bears were forced to cover on
                every earnings beat.
              </p>
              <p className="mt-1 font-medium text-[#5ba3e6]">
                Pattern: Max pessimism + turnaround catalyst + extreme SI =
                relentless squeeze over months.
              </p>
            </CaseStudy>
          </div>
        </Section>

        {/* Hard Gates */}
        <Section icon={Shield} title="Layer 1: Hard Gates (All Must Pass)">
          <p>
            Three binary gates. Fail any one and the stock is automatically
            DISCARD. These filter out stocks where the thesis is structurally
            broken.
          </p>
          <div className="space-y-3 pt-2">
            <GateRow
              gate="G1"
              label="Has the run already happened?"
              passDesc="Stock is 40%+ below its 52-week high. Sitting in a multi-month base with room to run."
              failDesc="Already up 4x+ from base and near all-time highs. The move you wanted to catch already happened."
            />
            <GateRow
              gate="G2"
              label="Existential risk to company survival?"
              passDesc="No company-level criminal indictment, no SEC enforcement, no delisting notice."
              failDesc="Active DOJ/SEC against the company itself, confirmed delisting. Note: Individual indictments (not company) don't auto-fail but cap verdict at WATCH."
            />
            <GateRow
              gate="G3"
              label="Base forming, not freefall?"
              passDesc="Price above 20-day MA (or within 8%) OR higher lows forming over 4+ weeks. Selling exhaustion visible."
              failDesc="Straight-line freefall, breaking all MAs, accelerating downside volume. Knife is still falling."
            />
          </div>
        </Section>

        {/* 11 Criteria */}
        <Section icon={Layers} title="Layer 2: Eleven Criteria (max 24 Points + Sector Modifier)">
          <p>
            Each criterion scores 0-2 (B and C expanded to 0-3 for higher
            predictive weight). Total possible: 24 points + sector momentum
            modifier (&plusmn;1). Criteria A, B, C are highest weight.
          </p>
          <div className="space-y-3 pt-2">
            <CriterionRow
              letter="A"
              label="Dead Money Base"
              weight="HIGH"
              score2="40-80% below ATH AND 6+ months in base. Market has forgotten this stock."
              score1="25-40% below highs OR less than 6 months base. Some discount but not deep enough."
              score0="Near highs or less than 3 months base. No discount, no setup."
            />
            <CriterionRow
              letter="B"
              label="Short Interest"
              weight="HIGH (0-3)"
              score3="Short float ≥20% and small cap (<$20B). Extreme squeeze potential."
              score2="Short float ≥15% and market cap under $20B. Maximum squeeze fuel."
              score1="Short float 5-15%. Some fuel but less explosive."
              score0="Short float under 5%. Not enough fuel for a squeeze-driven move."
            />
            <CriterionRow
              letter="C"
              label="Narrative Catalyst"
              weight="HIGH (0-3)"
              score3="Multiple converging catalysts — structural shift + near-term trigger + sector tailwind."
              score2="Structural change confirmed but not yet consensus. The market hasn't priced it in."
              score1="Speculative or unconfirmed catalyst. Early-stage trend, could go either way."
              score0="No catalyst or already fully priced in. Nothing to drive re-rating."
            />
            <CriterionRow
              letter="D"
              label="Earnings Inflection"
              weight="MEDIUM"
              score2="Accelerating YoY revenue + earnings within 60 days + beat streak ≥2. Hard catalyst with momentum."
              score1="Revenue growing OR earnings within 60 days OR beat streak. Some positive signal."
              score0="Revenue declining, no near-term earnings, no beat streak. No inflection visible."
            />
            <CriterionRow
              letter="E"
              label="Institutional Under-Ownership"
              weight="MEDIUM"
              score2="Institutional ownership <40%. Under-owned — room for fund inflows as thesis develops."
              score1="Institutional ownership 40-70%. Moderate ownership, some discovery potential."
              score0="Institutional ownership >70%. Fully owned — limited incremental buying power."
            />
            <CriterionRow
              letter="F"
              label="Volume Accumulation"
              weight="MEDIUM"
              score2="Up/down volume ratio >1.3x OR float turnover >1x in 20 days. Clear smart money accumulation."
              score1="Some volume evidence but inconsistent. Mixed signals or moderate float turnover."
              score0="Distribution pattern (heavy selling) or no pattern. No accumulation visible."
            />
            <CriterionRow
              letter="G"
              label="Index Inclusion Potential"
              weight="LOW / BONUS"
              score2="S&P 500 or Nasdaq-100 inclusion plausible within 18 months. The afterburner."
              score1="Possible but not near-term. Size or profitability not quite there yet."
              score0="N/A or years away. Not a factor in the thesis."
            />
            <CriterionRow
              letter="H"
              label="Insider Buying"
              weight="MEDIUM"
              score2="3+ insider purchases in last 90 days. Cluster buying = strong conviction."
              score1="1-2 insider purchases. Some insider interest."
              score0="No insider buys in last 90 days."
            />
            <CriterionRow
              letter="I"
              label="Options Flow (Put/Call)"
              weight="MEDIUM"
              score2="Put/Call OI ratio < 0.5. Heavy call accumulation — bullish smart money flow."
              score1="Put/Call ratio 0.5-1.0. Neutral."
              score0="Put/Call ratio > 1.0. Bears in control."
            />
            <CriterionRow
              letter="J"
              label="Relative Strength vs Sector"
              weight="MEDIUM"
              score2="Stock 20-day return outperforming sector ETF by > 5%. Leading the sector."
              score1="Within 5% of sector. Moving in-line."
              score0="Underperforming sector by > 5%. Lagging — something wrong."
            />
            <CriterionRow
              letter="K"
              label="Breakout Proximity"
              weight="MEDIUM"
              score2="Within 5% of 3-month base high (resistance). Coiling near breakout."
              score1="5-10% below resistance. Getting close."
              score0="More than 10% below resistance. Not ready yet."
            />
          </div>
          <p className="mt-3 text-xs text-[#666]">
            <strong className="text-[#a0a0a0]">Time decay:</strong> Bases older than 2 years (104 weeks) have score A halved — dead money that&apos;s been dead too long loses energy.
            <br />
            <strong className="text-[#a0a0a0]">Sector modifier:</strong> +1 if sector ETF 20d return &gt; +5% (tailwind), -1 if &lt; -5% (headwind).
          </p>
        </Section>

        {/* Verdict Tiers */}
        <Section icon={Target} title="Verdict Tiers">
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3">
              <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-bold text-purple-400">
                PRIORITY
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score ≥15 + earnings within 14 days + all gates pass. Highest
                probability window — hard catalyst imminent.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3">
              <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold text-green-400">
                KEEP
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score ≥15 + all gates pass. Strong setup, actively track and
                size a position.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
              <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-bold text-yellow-400">
                WATCH
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score 11-14 + all gates pass. Interesting but needs more
                confirmation. Monitor for improvement.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
              <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400">
                DISCARD
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score &lt;11 OR any gate fails. Does not meet criteria. Move on.
              </span>
            </div>
          </div>
        </Section>

        {/* Pattern Matching */}
        <Section icon={Sparkles} title="Historical Pattern Matching">
          <p>
            Each scanned stock is compared against 5 historical runner templates
            to identify similarities. When a match exceeds 50% similarity, a
            badge appears on the scanner (e.g., &ldquo;Similar to: CVNA 2023 (82%)&rdquo;).
          </p>
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-white">Templates:</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { t: "SNDK 2013", d: "Long base, moderate SI, mid-cap semi" },
                { t: "CAR 2021", d: "Extreme SI, short base, rapid squeeze" },
                { t: "CVNA 2023", d: "Max pessimism, very high SI, small cap turnaround" },
                { t: "GME 2021", d: "Ultra-high SI, micro cap, retail-driven" },
                { t: "SMCI 2024", d: "Deep discount, low SI, large cap AI theme" },
              ].map((p) => (
                <div
                  key={p.t}
                  className="rounded border border-[#2a2a2a] bg-[#141414] px-3 py-2"
                >
                  <p className="text-xs font-bold text-[#5ba3e6]">{p.t}</p>
                  <p className="text-[10px] text-[#666]">{p.d}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#666]">
              Matching uses range-based similarity across 5 features: ATH drop %,
              base weeks, short interest, market cap, and volume ratio. A perfect
              match doesn&apos;t guarantee the same outcome — it means the setup
              shares structural characteristics.
            </p>
          </div>
        </Section>

        {/* Data Sources */}
        <Section icon={Database} title="Data Sources">
          <p>
            The scanner pulls data from multiple free APIs. All new fields are
            nullable — if an API call fails, the criterion scores 0 instead of
            blocking the scan.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-[#666]">
                  <th className="py-1.5 pr-3 text-left font-medium">Source</th>
                  <th className="py-1.5 pr-3 text-left font-medium">Powers</th>
                  <th className="py-1.5 text-left font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                <tr className="border-b border-[#2a2a2a]/50">
                  <td className="py-1.5 pr-3 font-medium text-white">Yahoo Finance</td>
                  <td className="py-1.5 pr-3">A, E, F, G, I, J, K</td>
                  <td className="py-1.5">Quote summary, 3mo chart, institutional %, float shares, options chain (P/C ratio)</td>
                </tr>
                <tr className="border-b border-[#2a2a2a]/50">
                  <td className="py-1.5 pr-3 font-medium text-white">Finnhub</td>
                  <td className="py-1.5 pr-3">D (beat streak), H</td>
                  <td className="py-1.5">Earnings calendar + surprises, insider transactions (90d window)</td>
                </tr>
                <tr className="border-b border-[#2a2a2a]/50">
                  <td className="py-1.5 pr-3 font-medium text-white">SEC EDGAR</td>
                  <td className="py-1.5 pr-3">D (revenue)</td>
                  <td className="py-1.5">XBRL company facts — quarterly revenue for YoY growth calculation</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 font-medium text-white">Sector ETFs</td>
                  <td className="py-1.5 pr-3">J, Sector Mod</td>
                  <td className="py-1.5">Sector ETF 20d return via Yahoo chart (cached 5min per sector)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[#666]">
            <strong className="text-[#a0a0a0]">Nightly auto-scoring:</strong>{" "}
            The cron job runs a full scan nightly and automatically fires AI
            catalyst analysis (Claude Sonnet) for the top 5 scoring stocks.
            Results are sent to Telegram.
          </p>
        </Section>

        {/* Sector Buckets */}
        <Section icon={Zap} title="Sector Buckets">
          <p>
            The scan universe is organized into 11 sector buckets. Each bucket
            represents a structural theme where multi-bagger setups tend to
            cluster.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { name: "AI Optical/Connectivity Semis", etf: "SMH" },
              { name: "Advanced Packaging/Test", etf: "SMH" },
              { name: "SiC/GaN Power Semis", etf: "SMH" },
              { name: "Beaten-Down Cloud/SaaS", etf: "IGV" },
              { name: "Beaten-Down Biotech", etf: "XBI" },
              { name: "Energy/LNG Turnarounds", etf: "XLE" },
              { name: "Nuclear/Power Neoclouds", etf: "ICLN" },
              { name: "Rare Earth/Critical Minerals", etf: "XME" },
              { name: "EV/Hydrogen Turnarounds", etf: "IDRV" },
              { name: "High Short Interest", etf: "IWM" },
              { name: "Rental/Travel", etf: "PEJ" },
            ].map((b) => (
              <div
                key={b.name}
                className="rounded border border-[#2a2a2a] bg-[#141414] px-3 py-2"
              >
                <p className="text-xs text-[#a0a0a0]">{b.name}</p>
                <p className="text-[10px] text-[#5ba3e6]">ETF: {b.etf}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-[#666]">
            Sector ETFs power criterion J (relative strength) and the sector
            momentum modifier (&plusmn;1). The scanner compares each stock&apos;s 20-day
            return against its sector ETF.
          </p>
          <p className="mt-1 text-xs text-[#666]">
            <strong className="text-[#a0a0a0]">Note:</strong> These 11 buckets are
            thematic groups built for multi-bagger screening, not the standard 13
            GICS sectors. Some GICS sectors (e.g., Utilities, Real Estate) are
            excluded because they rarely produce the explosive setups this scanner
            targets, while others are split into sub-themes (e.g., Semiconductors
            has 3 buckets for AI Optical, Packaging, and Power Semis).
          </p>
        </Section>

        {/* Common Mistakes */}
        <Section icon={AlertTriangle} title="Common Mistakes">
          <ul className="list-disc space-y-2 pl-5 text-[#a0a0a0]">
            <li>
              <strong className="text-white">Buying the freefall.</strong> Gate 3
              exists for a reason. Wait for the base to form before entering.
            </li>
            <li>
              <strong className="text-white">Ignoring stop losses.</strong> Every
              watchlist position must have a defined stop. No exceptions.
            </li>
            <li>
              <strong className="text-white">Chasing after the run starts.</strong>{" "}
              If a stock has already run 100%+ from its base, the setup is done.
              Gate 1 catches this.
            </li>
            <li>
              <strong className="text-white">
                Over-weighting narrative without data.
              </strong>{" "}
              Criterion C (catalyst) is manual for a reason — be honest about
              whether the narrative is real or hopium.
            </li>
            <li>
              <strong className="text-white">
                Ignoring the MXL/AOSL lesson.
              </strong>{" "}
              When one stock in a sector bucket runs 40%+ and yours doesn&apos;t,
              the sector rotation is telling you something. Reassess.
            </li>
          </ul>
        </Section>

        {/* TradingView Webhooks */}
        <Section icon={BookOpen} title="Setting up TradingView Alerts">
          <p>
            You can send TradingView alerts directly into the Pre-Run scanner
            for stop-loss monitoring, breakout alerts, and volume surge
            notifications.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <h3 className="mb-1 text-sm font-medium text-white">
                1. Webhook URL
              </h3>
              <p className="mb-2 text-xs text-[#a0a0a0]">
                Copy this URL and paste it into TradingView&apos;s alert webhook
                field:
              </p>
              <div className="flex items-center gap-2 rounded border border-[#2a2a2a] bg-[#141414] px-3 py-2">
                <code className="flex-1 text-xs text-[#5ba3e6] break-all">
                  {webhookUrl}?secret=YOUR_TRADINGVIEW_WEBHOOK_SECRET
                </code>
              </div>
              <p className="mt-1 text-[10px] text-[#555]">
                Replace <code className="text-[#5ba3e6]">YOUR_TRADINGVIEW_WEBHOOK_SECRET</code> with
                the value of the <code className="text-[#5ba3e6]">TRADINGVIEW_WEBHOOK_SECRET</code> environment
                variable configured in your Vercel project settings (Settings &rarr; Environment Variables).
              </p>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-medium text-white">
                2. Alert Message Templates
              </h3>
              <p className="mb-2 text-xs text-[#a0a0a0]">
                Paste these into TradingView&apos;s alert message field:
              </p>

              <div className="space-y-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-yellow-400">
                    Stop Loss Breach
                  </p>
                  <pre className="rounded border border-[#2a2a2a] bg-[#141414] p-2 text-xs text-[#a0a0a0] overflow-x-auto">
{`{"ticker":"{{ticker}}","price":{{close}},"alert":"stop_loss","message":"{{ticker}} closed below stop loss at {{close}}"}`}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-green-400">
                    Price Breakout
                  </p>
                  <pre className="rounded border border-[#2a2a2a] bg-[#141414] p-2 text-xs text-[#a0a0a0] overflow-x-auto">
{`{"ticker":"{{ticker}}","price":{{close}},"alert":"breakout","message":"{{ticker}} breakout above resistance at {{close}}"}`}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-[#5ba3e6]">
                    Volume Surge
                  </p>
                  <pre className="rounded border border-[#2a2a2a] bg-[#141414] p-2 text-xs text-[#a0a0a0] overflow-x-auto">
{`{"ticker":"{{ticker}}","price":{{close}},"alert":"volume_surge","message":"{{ticker}} volume surge at {{close}}, vol={{volume}}"}`}
                  </pre>
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-medium text-white">
                3. View Alerts
              </h3>
              <p className="text-xs text-[#a0a0a0]">
                All incoming webhook alerts appear in the Alerts panel on the{" "}
                <Link
                  href="/prerun/watchlist"
                  className="text-[#5ba3e6] hover:underline"
                >
                  watchlist page
                </Link>
                .
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
