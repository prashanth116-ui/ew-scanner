"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, AlertTriangle, TrendingUp, Zap, Target, Shield, Layers, ChevronDown, ChevronUp, ClipboardList, Database, Sparkles, Activity } from "lucide-react";

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
                    <td className="py-1.5">&ge;20% below ATH</td>
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
              18 Criteria (max 40 pts + sector modifier)
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
                    { l: "D", name: "Earnings Inflection", max: 3, s0: "Declining rev", s1: "Growth or near earn", s2: "Accel rev + earn <60d" },
                    { l: "E", name: "Inst. Under-Ownership", max: 2, s0: "Inst >70%", s1: "Inst 40-70%", s2: "Inst <40%" },
                    { l: "F", name: "Volume Accumulation", max: 3, s0: "Distribution", s1: "Neutral", s2: "3: base 2 + OBV-price divergence + VP divergence" },
                    { l: "G", name: "Index Inclusion", max: 2, s0: "N/A", s1: "Possible", s2: "Plausible <18mo" },
                    { l: "H", name: "Insider Buying", max: 2, s0: "None 90d", s1: "1 recent buy", s2: "2+ in 45d or 3+ in 90d" },
                    { l: "I", name: "Options Flow", max: 2, s0: "P/C >1.0", s1: "P/C 0.5-1.0", s2: "P/C <0.5 (bullish)" },
                    { l: "J", name: "Rel. Strength vs Sector", max: 2, s0: "Under by >5%", s1: "Within 5%", s2: "Over by >5%" },
                    { l: "K", name: "Breakout Proximity", max: 2, s0: ">10% below resist", s1: "5-10% below", s2: "<5% (coiling)" },
                    { l: "L", name: "Higher Lows", max: 2, s0: "No HL pattern", s1: "2 of 3 swing lows higher", s2: "3 consecutive higher lows" },
                    { l: "M", name: "EMA Reclaim", max: 2, s0: "Below both EMAs", s1: "Above one EMA", s2: "Above 21+50 EMA, crossed <20d" },
                    { l: "M2", name: "EMA Timing", max: 2, s0: "Bearish EMA alignment", s1: "EMA10>EMA20 or price above both", s2: "Bullish cross + above both + <5 bars" },
                    { l: "N", name: "Range Coil", max: 2, s0: "No coiling", s1: "Near top OR ATR contracting", s2: "Near top + ATR contracting" },
                    { l: "O", name: "Failed Breakdown Recovery", max: 2, s0: "No breakdown event", s1: "Wick test + held", s2: "Broke below + recovered <3 bars" },
                    { l: "P", name: "Analyst Revision Trend", max: 2, s0: "Declining estimates", s1: "Stable estimates", s2: "Analysts upgrading" },
                    { l: "Q", name: "Short Squeeze Probability", max: 2, s0: "<2 signals", s1: "2 of 4 signals", s2: "3+ signals (SI+turnover+insider+options)" },
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
              Time decay: Bases &gt;2 years (104 weeks) halve score A. B &amp; C expanded to 0-3 (highest predictive signal). F expanded to 0-3 with OBV-price divergence and volume-price divergence bonus.
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
                <p className="text-xs text-[#c0c0c0]">&ge;19 + earn &lt;14d</p>
              </div>
              <div className="rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-green-400">KEEP</p>
                <p className="text-xs text-[#c0c0c0]">&ge;19</p>
              </div>
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-amber-400">WATCH</p>
                <p className="text-xs text-[#c0c0c0]">&ge;14</p>
              </div>
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-red-400">DISCARD</p>
                <p className="text-xs text-[#c0c0c0]">&lt;14 or gate fail</p>
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
              passDesc="Stock is 20%+ below its 52-week high. Sitting in a base with room to run."
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

        {/* 15 Criteria */}
        <Section icon={Layers} title="Layer 2: Eighteen Criteria (max 40 Points + Sector Modifier)">
          <p>
            Each criterion scores 0-2 (B, C, D expanded to 0-3 for higher
            predictive weight; F expanded to 0-3 with OBV-price divergence/VP leading indicators).
            Total possible: 40 points + sector momentum
            modifier (&plusmn;1). Criteria A, B, C are highest weight. Criteria L-O
            power the &ldquo;Stage 1&rarr;2 / base breakout&rdquo; preset for identifying
            stocks transitioning from accumulation to markup. M2 adds
            EMA timing confirmation with selectable timeframe (15m, 1h, 4h, 12h, 1d, 1wk, 1mo).
            Criteria P-Q capture analyst consensus shifts and composite squeeze signals.
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
              weight="MEDIUM (0-3)"
              score3="Base 2 + OBV-price divergence AND bullish volume-price divergence. Stealth accumulation signal."
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
              score2="2+ insider purchases in last 45 days (early cluster) OR 3+ in last 90 days. Strong conviction signal."
              score1="1 insider purchase in last 45 days, or 1-2 in 90 days. Some insider interest."
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
            <CriterionRow
              letter="L"
              label="Higher Lows"
              weight="MEDIUM"
              score2="Last 3 swing lows are each higher than the prior. Clear upward structure within the base."
              score1="2 of last 3 swing lows are higher. Partial structure forming."
              score0="No higher lows pattern or lower lows present. Base not constructive."
            />
            <CriterionRow
              letter="M"
              label="EMA Reclaim"
              weight="MEDIUM"
              score2="Price above both 21 EMA and 50 EMA, having crossed above within last 20 trading days."
              score1="Above one EMA (21 or 50), or above both but crossover was more than 20 days ago."
              score0="Price below both the 21 EMA and 50 EMA. Still in downtrend."
            />
            <CriterionRow
              letter="M2"
              label="EMA Timing (Multi-Timeframe)"
              weight="MEDIUM"
              score2="EMA-10 > EMA-20, price above both, and bullish crossover within last 5 bars. Active momentum."
              score1="Bullish EMA alignment (EMA-10 > EMA-20) or price above both EMAs."
              score0="Bearish alignment — EMA-10 below EMA-20 and price below both. No momentum confirmation."
            />
            <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3">
              <p className="text-xs font-medium text-purple-400 mb-1">Multi-Timeframe M2 Table</p>
              <p className="text-xs text-[#a0a0a0]">
                The <strong className="text-white">Early Mover</strong> preset auto-enables a multi-timeframe M2 view.
                After the base scan (Phase 1), a second pass fetches EMA 10/20 signals at 15m, 1h, 4h, 12h, 1d, 1wk, and 1mo
                for candidates that pass the criteria gates. The resulting table shows which timeframes confirm bullish
                momentum per stock — stocks with high M2 scores across multiple timeframes have the strongest timing signal.
                Toggle the &ldquo;Multi-TF&rdquo; button manually for any preset.
              </p>
            </div>
            <CriterionRow
              letter="N"
              label="Range Coil / Tight Closes Near Top"
              weight="MEDIUM"
              score2="Last 5 closes in upper 25% of 13-week range AND daily ATR contracting (5d ATR < 20d ATR)."
              score1="Closes near top of range OR ATR contracting, but not both."
              score0="Closes scattered across range, no coiling evidence."
            />
            <CriterionRow
              letter="O"
              label="Failed Breakdown Recovery"
              weight="MEDIUM"
              score2="Price broke below 50-day SMA within last 20 days but recovered above it within 3 candles — and held."
              score1="Price tested but didn't close below 50-day SMA (wick only), and recovered."
              score0="No failed breakdown, or breakdown occurred and has not recovered."
            />
            <CriterionRow
              letter="P"
              label="Analyst Revision Trend"
              weight="MEDIUM"
              score2="Analysts upgrading estimates. Bullish consensus shift not yet fully priced in."
              score1="Estimates stable — no meaningful revision activity."
              score0="Analysts declining/downgrading estimates. Negative sentiment."
            />
            <CriterionRow
              letter="Q"
              label="Short Squeeze Probability"
              weight="MEDIUM"
              score2="3+ of 4 composite signals: SI% ≥15, float turnover ≥0.8x, insider buys, and bullish P/C ratio."
              score1="2 of 4 composite signals present. Some squeeze ingredients."
              score0="Fewer than 2 signals. Squeeze unlikely."
            />
          </div>
          <p className="mt-3 text-xs text-[#666]">
            <strong className="text-[#a0a0a0]">Time decay:</strong> Bases older than 2 years (104 weeks) have score A halved — dead money that&apos;s been dead too long loses energy.
            <br />
            <strong className="text-[#a0a0a0]">Sector modifier:</strong> +1 if sector ETF 20d return &gt; +5% (tailwind), -1 if &lt; -5% (headwind).
            <br />
            <strong className="text-[#a0a0a0]">Stage 1&rarr;2 / Base breakout:</strong> Criteria L-O are designed to identify stocks transitioning from Stage 1 (accumulation/base) to Stage 2 (markup). The &ldquo;Early Mover&rdquo; preset enforces M2&ge;1, L&ge;1, F&ge;1 (EMA timing + higher lows + volume accumulation) as the core breakout signals, with A, M, K scores visible in the UI for manual confirmation. Multi-TF M2 is auto-enabled.
            <br />
            <strong className="text-[#a0a0a0]">Stealth Accumulation:</strong> Requires OBV-price divergence OR VP divergence plus M2&ge;1 EMA timing. Catches institutional buying when price is flat but volume signals accumulation.
            <br />
            <strong className="text-[#a0a0a0]">Aggressive Early:</strong> Requires M2&ge;1 + N&ge;1 (range coil) + divergence. Lowest score threshold (10) catches pre-breakout setups 1-2 weeks before the move.
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
                Score ≥19 + earnings within 14 days + all gates pass. Highest
                probability window — hard catalyst imminent.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3">
              <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold text-green-400">
                KEEP
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score ≥19 + all gates pass. Strong setup, actively track and
                size a position.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
              <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-bold text-yellow-400">
                WATCH
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score 14-18 + all gates pass. Interesting but needs more
                confirmation. Monitor for improvement.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
              <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400">
                DISCARD
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score &lt;14 OR any gate fails. Does not meet criteria. Move on.
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
                  <td className="py-1.5 pr-3">A, E, F, G, I, J, K, L, M, N, O</td>
                  <td className="py-1.5">Quote summary, 3mo chart (OHLC for EMA, swing lows, ATR, SMA50, OBV, VP divergence), institutional %, float shares, options chain</td>
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

        {/* Universe & Sector Buckets */}
        <Section icon={Zap} title="Universe &amp; Sector Buckets">
          <p>
            The scan universe covers <strong className="text-white">~1,390 stocks</strong> sourced
            from the squeeze universe (S&amp;P 500 + S&amp;P 400 MidCap + S&amp;P 600 SmallCap highlights).
            Each stock is mapped to one of 13 GICS sectors, with unmapped stocks in an &ldquo;Other&rdquo; bucket.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-[#666]">
                  <th className="py-1.5 pr-3 text-left font-medium">Sector</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Stocks</th>
                  <th className="py-1.5 text-left font-medium">Benchmark ETF</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                {[
                  { name: "Semiconductors", count: "~76", etf: "SMH" },
                  { name: "Software & Cloud", count: "~172", etf: "IGV" },
                  { name: "Biotech", count: "~78", etf: "XBI" },
                  { name: "Health Care", count: "~117", etf: "XLV" },
                  { name: "Financials", count: "~174", etf: "XLF" },
                  { name: "Consumer Discretionary", count: "~174", etf: "XLY" },
                  { name: "Communication Services", count: "~62", etf: "XLC" },
                  { name: "Industrials", count: "~206", etf: "XLI" },
                  { name: "Consumer Staples", count: "~62", etf: "XLP" },
                  { name: "Energy", count: "~68", etf: "XLE" },
                  { name: "Utilities", count: "~45", etf: "XLU" },
                  { name: "Real Estate", count: "~78", etf: "XLRE" },
                  { name: "Materials", count: "~67", etf: "XLB" },
                  { name: "Other", count: "~700", etf: "SPY" },
                ].map((b) => (
                  <tr key={b.name} className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-3 font-medium text-white whitespace-nowrap">{b.name}</td>
                    <td className="py-1.5 pr-3 text-right text-[#5ba3e6]">{b.count}</td>
                    <td className="py-1.5">{b.etf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[#666]">
            Sector ETFs power criterion J (relative strength) and the sector
            momentum modifier (&plusmn;1). The scanner compares each stock&apos;s 20-day
            return against its sector ETF. Stocks in &ldquo;Other&rdquo; use SPY as the benchmark.
          </p>
        </Section>

        {/* Presets */}
        <Section icon={Target} title="Presets at a Glance">
          <p>
            Presets configure filters and criteria thresholds in one click. Select a preset from the sidebar to apply.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-[#666]">
                  <th className="py-1.5 pr-3 text-left font-medium">Preset</th>
                  <th className="py-1.5 pr-3 text-right font-medium">ATH%</th>
                  <th className="py-1.5 pr-3 text-right font-medium">SI%</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Score</th>
                  <th className="py-1.5 text-left font-medium">Best For</th>
                </tr>
              </thead>
              <tbody className="text-[#c0c0c0]">
                {[
                  { name: "SNDK", ath: "40%", si: "15%", score: "18", use: "Classic multi-bagger: deep base + high SI. Catches early base formation." },
                  { name: "Early Mover", ath: "25%", si: "Any", score: "14", use: "Stage 1\u21922: EMA timing + higher lows + volume accumulation (M2/L/F\u22651). Multi-TF enabled." },
                  { name: "Pullback Buy", ath: "20\u201340%", si: "Any", score: "15", use: "20-40% pullback with higher lows + M2 timing + volume confirmation (M2/F/L\u22651)" },
                  { name: "Leading", ath: "Any*", si: "Any", score: "12", use: "RRG LEADING/IMPROVING sectors with EMA confirmation (M\u22651). Skips ATH + base gates." },
                  { name: "Stealth", ath: "20%", si: "Any", score: "11", use: "OBV or VP divergence + EMA timing (M2\u22651). Institutional buying while price stays flat." },
                  { name: "Aggressive Early", ath: "20%", si: "Any", score: "10", use: "Volume divergence + range coil + EMA timing (M2/N\u22651). Pre-breakout detection." },
                  { name: "VCP Breakout", ath: "Any", si: "Any", score: "65", use: "Institutional VCP mode: uptrend + compression + tight base near pivot (separate 0-100 engine)" },
                  { name: "Inst. Acceleration", ath: "Any", si: "Any", score: "\u2014", use: "Large-cap institutional runners \u2014 RS acceleration, volume accumulation, structure analysis (separate 0-100 engine)" },
                ].map((p) => (
                  <tr key={p.name} className="border-b border-[#2a2a2a]/50">
                    <td className="py-1.5 pr-3 font-medium text-white whitespace-nowrap">{p.name}</td>
                    <td className="py-1.5 pr-3 text-right text-[#5ba3e6]">{p.ath}</td>
                    <td className="py-1.5 pr-3 text-right text-[#5ba3e6]">{p.si}</td>
                    <td className="py-1.5 pr-3 text-right text-[#5ba3e6]">{p.score}</td>
                    <td className="py-1.5">{p.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[#666]">
            <strong className="text-[#a0a0a0]">Default filters:</strong> 20% from ATH, score &ge;11.
            Presets override only the values shown &mdash; unspecified filters use defaults.
            <br />
            <strong className="text-[#a0a0a0]">*Leading preset:</strong> Skips Gate 1 (ATH distance) and Gate 3 (base forming) to include sector leaders near all-time highs. Uses totalScore instead of finalScore since gates are bypassed. Requires <Link href="/sectors" className="underline hover:text-[#5ba3e6]">/sectors</Link> data for RRG quadrant filtering.
          </p>
        </Section>

        {/* VCP Breakout Scanner */}
        <Section icon={Activity} title="Institutional VCP Breakout Scanner">
          <p>
            A separate view mode that targets the opposite profile from the standard scanner:
            institutional-quality stocks in confirmed uptrends forming tight volatility contractions
            near breakout pivots. Select the <strong className="text-white">Inst. VCP Breakout</strong> preset
            to activate this mode.
          </p>

          {/* VCP Gates */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              6 Institutional Quality Gates (all must pass)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Gate</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Rule</th>
                    <th className="py-1.5 text-left font-medium">Threshold</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  {[
                    { gate: "G1", rule: "Price above $10", threshold: "Price \u2265 $10" },
                    { gate: "G2", rule: "Average volume liquidity", threshold: "50d avg volume \u2265 500K shares" },
                    { gate: "G3", rule: "Dollar volume liquidity", threshold: "Avg dollar volume \u2265 $20M/day" },
                    { gate: "G4", rule: "Market capitalization", threshold: "Market cap \u2265 $1B" },
                    { gate: "G5", rule: "Above 200-day SMA", threshold: "Price > 200 SMA (confirmed uptrend)" },
                    { gate: "G6", rule: "Above 50-day SMA", threshold: "Price > 50 SMA (intermediate trend)" },
                  ].map((g) => (
                    <tr key={g.gate} className="border-b border-[#2a2a2a]/50">
                      <td className="py-1.5 pr-3 font-medium text-white">{g.gate}</td>
                      <td className="py-1.5 pr-3">{g.rule}</td>
                      <td className="py-1.5 text-[#5ba3e6]">{g.threshold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10px] text-[#666]">
              If any gate fails, the total score is forced to 0 and the stock is classified as IGNORE.
              These gates ensure only liquid, institutional-grade, uptrending stocks are scored.
            </p>
          </div>

          {/* VCP Scoring Categories */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              5 Scoring Categories (max 100 points)
            </h3>
            <div className="space-y-3">
              {[
                {
                  cat: "Trend",
                  max: 25,
                  color: "text-emerald-400",
                  bg: "bg-emerald-500/10 border-emerald-500/20",
                  details: [
                    "+5 above 50 SMA",
                    "+5 above 200 SMA",
                    "+5 golden cross (50 SMA > 200 SMA)",
                    "+5 within 25% of 52w high (+3 bonus within 15%)",
                    "-3 penalty if extended >10% above 50 SMA",
                  ],
                },
                {
                  cat: "Volume",
                  max: 20,
                  color: "text-cyan-400",
                  bg: "bg-cyan-500/10 border-cyan-500/20",
                  details: [
                    "0-8 pts for dry volume days (days with vol < 60% of 20d avg)",
                    "0-6 pts for up/down volume ratio (\u22651.5x = 6, \u22651.2x = 4)",
                    "0-6 pts for volume contraction (10d avg / 50d avg declining)",
                  ],
                },
                {
                  cat: "Compression",
                  max: 25,
                  color: "text-purple-400",
                  bg: "bg-purple-500/10 border-purple-500/20",
                  details: [
                    "+5 ATR contracting (5d ATR < 20d ATR)",
                    "+5 range nesting (5d range < 10d < 20d)",
                    "+5 tight closes (last 5 candles close spread < 1.5%)",
                    "+5 inside bars (2+ in last 5 bars)",
                    "+5 ATR% < 2% of price",
                  ],
                },
                {
                  cat: "Relative Strength",
                  max: 15,
                  color: "text-amber-400",
                  bg: "bg-amber-500/10 border-amber-500/20",
                  details: [
                    "0-8 pts RS vs SPY (>10% = 8, >5% = 6, >0% = 3)",
                    "0-7 pts RS vs sector ETF (>5% = 7, >0% = 4)",
                  ],
                },
                {
                  cat: "Risk Quality",
                  max: 15,
                  color: "text-rose-400",
                  bg: "bg-rose-500/10 border-rose-500/20",
                  details: [
                    "0-5 pts tight stop (ATR% < 2% = 5, < 3% = 3)",
                    "0-5 pts not extended (0-5% above 50 SMA = 5, 5-10% = 3)",
                    "0-5 pts liquidity ($100M+/day = 5, $50M+ = 3, $20M+ = 1)",
                  ],
                },
              ].map((c) => (
                <div key={c.cat} className={`rounded-lg border ${c.bg} px-4 py-3`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${c.color}`}>{c.cat}</span>
                    <span className="text-xs text-[#666]">/{c.max} pts</span>
                  </div>
                  <ul className="space-y-0.5">
                    {c.details.map((d, i) => (
                      <li key={i} className="text-xs text-[#a0a0a0]">{d}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* VCP Phase Classification */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              Phase Classification
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-emerald-400">FOCUS LIST</p>
                <p className="text-xs text-[#c0c0c0]">&ge;85 pts</p>
              </div>
              <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-cyan-400">WATCHLIST</p>
                <p className="text-xs text-[#c0c0c0]">75&ndash;84 pts</p>
              </div>
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-amber-400">EARLY SETUP</p>
                <p className="text-xs text-[#c0c0c0]">65&ndash;74 pts</p>
              </div>
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-red-400">IGNORE</p>
                <p className="text-xs text-[#c0c0c0]">&lt;65 or gate fail</p>
              </div>
            </div>
          </div>

          {/* Risk Calculator */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              Built-in Risk Calculator
            </h3>
            <p className="text-xs text-[#a0a0a0] mb-2">
              Each VCP card includes a risk calculator row with auto-computed entry, stop, and R-targets.
              Adjust account size and risk % in the sidebar to recalculate live without re-scanning.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Field</th>
                    <th className="py-1.5 text-left font-medium">Calculation</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  {[
                    { field: "Entry", calc: "Pivot high + $0.10" },
                    { field: "Stop", calc: "Entry \u2212 1.5 \u00d7 ATR(14)" },
                    { field: "Risk/Share", calc: "Entry \u2212 Stop" },
                    { field: "Shares", calc: "Account \u00d7 Risk% \u00f7 Risk/Share (capped at 25% of account)" },
                    { field: "2R\u201310R Targets", calc: "Entry + N \u00d7 Risk/Share" },
                    { field: "10 SMA Exit", calc: "Trailing exit when price closes below 10 SMA" },
                  ].map((r) => (
                    <tr key={r.field} className="border-b border-[#2a2a2a]/50">
                      <td className="py-1.5 pr-3 font-medium text-white whitespace-nowrap">{r.field}</td>
                      <td className="py-1.5">{r.calc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alert Conditions */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              Alert Condition Badges
            </h3>
            <p className="text-xs text-[#a0a0a0] mb-2">
              Each VCP card displays condition badges at the bottom to highlight actionable signals:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label: "VCP Compression", desc: "Range nesting + ATR contracting", color: "text-purple-400 border-purple-500/20" },
                { label: "Breakout Trigger", desc: "Price > pivot high", color: "text-green-400 border-green-500/20" },
                { label: "Tight Closes", desc: "5-candle close spread < 1.5%", color: "text-cyan-400 border-cyan-500/20" },
                { label: "Dry Volume", desc: "3+ days below 60% of avg volume", color: "text-amber-400 border-amber-500/20" },
                { label: "Below 10 SMA", desc: "Exit signal: price < 10 SMA", color: "text-red-400 border-red-500/20" },
              ].map((a) => (
                <div key={a.label} className={`rounded border ${a.color} bg-[#141414] px-3 py-2`}>
                  <p className={`text-xs font-medium ${a.color.split(" ")[0]}`}>{a.label}</p>
                  <p className="text-[10px] text-[#666]">{a.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Institutional Acceleration Scanner */}
        <Section icon={Activity} title="Institutional Acceleration Scanner">
          <p>
            A separate view mode targeting <strong className="text-white">large-cap institutional-quality runners</strong> with
            relative strength acceleration, volume accumulation, and clean price structure. Select the{" "}
            <strong className="text-white">Inst. Acceleration</strong> preset to activate. Designed to identify
            setups like NOW, AVGO, NVDA before they accelerate.
          </p>

          {/* Gates */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              4 Institutional Quality Gates (all must pass)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Gate</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Rule</th>
                    <th className="py-1.5 text-left font-medium">Threshold</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  {[
                    { gate: "G1", rule: "Price above $20", threshold: "Price \u2265 $20" },
                    { gate: "G2", rule: "Market cap", threshold: "Market cap \u2265 $20B" },
                    { gate: "G3", rule: "Dollar volume liquidity", threshold: "Avg dollar volume \u2265 $100M/day" },
                    { gate: "G4", rule: "Share volume liquidity", threshold: "Avg share volume \u2265 1.5M/day" },
                  ].map((g) => (
                    <tr key={g.gate} className="border-b border-[#2a2a2a]/50">
                      <td className="py-1.5 pr-3 font-medium text-white">{g.gate}</td>
                      <td className="py-1.5 pr-3">{g.rule}</td>
                      <td className="py-1.5 text-[#5ba3e6]">{g.threshold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10px] text-[#666]">
              All gates must pass. If any gate fails, composite score is forced to 0. These gates ensure only
              liquid, large-cap, institutional-grade stocks are scored.
            </p>
          </div>

          {/* Scoring Categories */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              4 Scoring Categories (max 100 composite)
            </h3>
            <div className="space-y-3">
              {[
                {
                  cat: "Institutional Score",
                  color: "text-emerald-400",
                  bg: "bg-emerald-500/10 border-emerald-500/20",
                  details: [
                    "RS acceleration vs SPY (5-session momentum change)",
                    "RS acceleration vs QQQ",
                    "Institutional ownership % (quarterly filings)",
                    "Volume accumulation signals",
                  ],
                },
                {
                  cat: "Execution Score",
                  color: "text-cyan-400",
                  bg: "bg-cyan-500/10 border-cyan-500/20",
                  details: [
                    "Distance from EMA20 in ATR units (proximity = better)",
                    "Gap % analysis (overnight institutional activity)",
                    "Entry trigger quality and proximity",
                  ],
                },
                {
                  cat: "Risk Score",
                  color: "text-rose-400",
                  bg: "bg-rose-500/10 border-rose-500/20",
                  details: [
                    "Beta (lower beta = lower risk = higher score)",
                    "ATR in dollar terms (position sizing feasibility)",
                    "Inverted: 100 = lowest risk, 0 = highest risk",
                  ],
                },
                {
                  cat: "Discipline Score",
                  color: "text-amber-400",
                  bg: "bg-amber-500/10 border-amber-500/20",
                  details: [
                    "Price structure quality (higher lows, trend integrity)",
                    "EMA alignment and reclaim signals",
                    "Range coil / tight base formation",
                  ],
                },
              ].map((c) => (
                <div key={c.cat} className={`rounded-lg border ${c.bg} px-4 py-3`}>
                  <span className={`text-sm font-bold ${c.color}`}>{c.cat}</span>
                  <ul className="mt-1.5 space-y-0.5">
                    {c.details.map((d, i) => (
                      <li key={i} className="text-xs text-[#a0a0a0]">{d}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Classification */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              12 Classifications
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">Classification</th>
                    <th className="py-1.5 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  {[
                    { name: "Continuation Leader", desc: "Strong trend + RS acceleration + institutional flow. Best-in-class momentum." },
                    { name: "Recovery Leader", desc: "Recovering from pullback with improving RS and accumulation." },
                    { name: "Fresh Rotation", desc: "New institutional money rotating in. Early-stage acceleration." },
                    { name: "Inst. Accumulation", desc: "Volume signals institutional buying. Structure forming for breakout." },
                    { name: "Tight Base", desc: "Low volatility consolidation near highs. Coiling for potential move." },
                    { name: "Constructive Setup", desc: "Positive structure building but not yet fully confirmed." },
                    { name: "Oversold Reversal", desc: "Oversold bounce with improving indicators." },
                    { name: "Neutral Hold", desc: "No clear edge. Not actionable, not avoidable." },
                    { name: "Too Extended", desc: "Overbought / too far from support for new entries." },
                    { name: "Avoid: Distribution", desc: "Institutional selling pressure detected." },
                    { name: "Avoid: Choppy", desc: "No trend, erratic price action." },
                    { name: "Avoid: Low Quality", desc: "Poor structure, weak RS, no accumulation signals." },
                  ].map((c) => (
                    <tr key={c.name} className="border-b border-[#2a2a2a]/50">
                      <td className="py-1.5 pr-3 font-medium text-white whitespace-nowrap">{c.name}</td>
                      <td className="py-1.5">{c.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tier System */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              Shortlist Tier System
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-green-400">SHORTLIST</p>
                <p className="text-xs text-[#c0c0c0]">Top-tier actionable</p>
              </div>
              <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-yellow-400">WATCHLIST</p>
                <p className="text-xs text-[#c0c0c0]">Monitor for improvement</p>
              </div>
              <div className="rounded-md border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-orange-400">SPECULATIVE</p>
                <p className="text-xs text-[#c0c0c0]">Higher risk, early stage</p>
              </div>
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-center">
                <p className="text-[10px] font-bold text-red-400">AVOID</p>
                <p className="text-xs text-[#c0c0c0]">No tier (distribution/choppy)</p>
              </div>
            </div>
          </div>

          {/* Entry Quality + Triggers */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              Entry Quality &amp; Triggers
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-white mb-1.5">Entry Quality</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-bold text-green-400">HIGH</span>
                    <span className="text-[#a0a0a0]">Strong setup, immediate entry potential</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">MOD</span>
                    <span className="text-[#a0a0a0]">Decent setup, needs confirmation</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">LOW</span>
                    <span className="text-[#a0a0a0]">Poor entry timing, wait for pullback</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-white mb-1.5">Entry Triggers</p>
                <div className="space-y-1 text-xs text-[#a0a0a0]">
                  <p><span className="text-white">Breakout</span> &mdash; Price above pivot high</p>
                  <p><span className="text-white">Higher Low</span> &mdash; Holding above prior swing low</p>
                  <p><span className="text-white">EMA Reclaim</span> &mdash; Reclaimed key EMA from below</p>
                  <p><span className="text-white">PB to EMA20</span> &mdash; Pullback to 20 EMA support</p>
                  <p><span className="text-white">Gap &amp; Go</span> &mdash; Gap up with continuation</p>
                  <p><span className="text-white">Range BO</span> &mdash; Breaking out of consolidation range</p>
                </div>
              </div>
            </div>
          </div>

          {/* Inline Filters */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5ba3e6] mb-2">
              Inline Filter Bar (11 Controls)
            </h3>
            <p className="text-xs text-[#a0a0a0] mb-2">
              Filters appear inline above the results grid (no sidebar filters in this mode). All filters
              combine with AND logic. Filters persist across page reloads via localStorage.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-[#666]">
                    <th className="py-1.5 pr-3 text-left font-medium">#</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Filter</th>
                    <th className="py-1.5 pr-3 text-left font-medium">Default</th>
                    <th className="py-1.5 text-left font-medium">Options</th>
                  </tr>
                </thead>
                <tbody className="text-[#c0c0c0]">
                  {[
                    { n: 1, filter: "Min Score", def: "All", opts: "All, 40+, 50+, 60+, 70+, 80+" },
                    { n: 2, filter: "Classification", def: "All", opts: "All + 12 classification types" },
                    { n: 3, filter: "Tier", def: "Shortlist", opts: "All Tiers, Shortlist, Watchlist, Speculative, All Actionable" },
                    { n: 4, filter: "Sector", def: "All", opts: "All + dynamic sector list" },
                    { n: 5, filter: "Min Cap", def: "Any", opts: "Any, >$1B, >$10B, >$20B, >$50B, >$100B, >$200B, >$500B, >$1T" },
                    { n: 6, filter: "Entry Quality", def: "All", opts: "All, HIGH, MOD, LOW" },
                    { n: 7, filter: "Trigger", def: "All", opts: "All + 7 trigger types" },
                    { n: 8, filter: "RS Accel", def: "All", opts: "All, Positive (>0), Strong (\u22652), Negative, Improving (\u2191), Fast Improving (\u2191\u2191)" },
                    { n: 9, filter: "RRG Quadrant", def: "All", opts: "All, LEADING, IMPROVING, WEAKENING, LAGGING" },
                    { n: 10, filter: "OBV Div", def: "Off", opts: "Toggle: stealth accumulation (OBV near high, price not)" },
                    { n: 11, filter: "VP Div", def: "Off", opts: "Toggle: seller exhaustion (lower lows + declining sell vol)" },
                  ].map((r) => (
                    <tr key={r.n} className="border-b border-[#2a2a2a]/50">
                      <td className="py-1.5 pr-3 text-[#5ba3e6]">{r.n}</td>
                      <td className="py-1.5 pr-3 font-medium text-white whitespace-nowrap">{r.filter}</td>
                      <td className="py-1.5 pr-3">{r.def}</td>
                      <td className="py-1.5">{r.opts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10px] text-[#666]">
              RRG Quadrant requires sector rotation data from{" "}
              <Link href="/sectors" className="underline hover:text-[#5ba3e6]">/sectors</Link>.
              The Reset button appears when any filter is non-default and resets all to defaults while staying in institutional mode.
            </p>
          </div>

          {/* Best Selection Criteria */}
          <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-xs font-medium text-emerald-400 mb-2">Quick-Pick Presets (clickable above results)</p>
            <div className="space-y-2 text-xs text-[#a0a0a0]">
              <p>
                <strong className="text-white">High Conviction:</strong> Tier = <span className="text-green-400">Shortlist</span>,
                Entry Quality = <span className="text-green-400">HIGH</span>, RS Accel = <span className="text-green-400">Positive</span>,
                Score = <span className="text-green-400">60+</span>.
                Highest-conviction stocks with good entry timing, improving RS, and strong composite score.
              </p>
              <p>
                <strong className="text-white">Fresh Momentum:</strong> RS Accel = <span className="text-cyan-400">Strong (&ge;2)</span>,
                Score = <span className="text-cyan-400">50+</span>, Tier = <span className="text-cyan-400">All Actionable</span>.
                Catches institutional money accelerating into names across all actionable classifications.
              </p>
              <p>
                <strong className="text-white">Sector Aligned:</strong> RRG Quadrant = <span className="text-amber-400">LEADING + IMPROVING</span>,
                OBV Div = <span className="text-amber-400">ON</span>, VP Div = <span className="text-amber-400">ON</span>.
                Stocks in favorable sector rotation with double volume divergence confirmation.
              </p>
              <p>
                <strong className="text-white">Pullback Entry:</strong> Trigger = <span className="text-purple-400">PB to EMA20</span>,
                Entry Quality = <span className="text-purple-400">HIGH</span>. Best risk/reward when buying dips in confirmed uptrends.
              </p>
              <p>
                <strong className="text-white">Tight Base:</strong> Classification = <span className="text-blue-400">TIGHT_BASE</span>.
                Low-volatility consolidation near highs &mdash; coiling for potential breakout move.
              </p>
              <p>
                <strong className="text-white">Stealth Accum:</strong> OBV Div = <span className="text-indigo-400">ON</span>,
                VP Div = <span className="text-indigo-400">ON</span>, Tier = <span className="text-indigo-400">All Actionable</span>.
                Institutional buying when price is flat but both volume signals confirm accumulation.
              </p>
              <p>
                <strong className="text-white">Emerging Momentum:</strong> RS Accel = <span className="text-orange-400">Improving (&uarr;)</span>,
                Score = <span className="text-orange-400">40+</span>, Tier = <span className="text-orange-400">All</span>.
                Catches stocks where RS acceleration is trending positive day over day &mdash; the trajectory is improving even if the current value is still negative.
                Designed to detect setups like TSLA approaching institutional quality before they arrive.
              </p>
            </div>
          </div>
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
