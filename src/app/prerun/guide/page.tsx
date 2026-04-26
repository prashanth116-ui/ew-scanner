"use client";

import Link from "next/link";
import { BookOpen, AlertTriangle, TrendingUp, Zap, Target, Shield, Layers } from "lucide-react";

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
  score2,
  score1,
  score0,
}: {
  label: string;
  letter: string;
  weight: string;
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

        {/* 7 Criteria */}
        <Section icon={Layers} title="Layer 2: Seven Criteria (0-14 Points)">
          <p>
            Each criterion scores 0 (absent), 1 (partial), or 2 (strong). Total
            possible: 14 points. Criteria A, B, C are highest weight — these
            are the core setup ingredients.
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
              label="Short Interest ≥15% Float"
              weight="HIGH"
              score2="Short float ≥15% and market cap under $20B. Maximum squeeze fuel."
              score1="Short float 8-15% OR large cap with 15%+. Some fuel but less explosive."
              score0="Short float under 8%. Not enough fuel for a squeeze-driven move."
            />
            <CriterionRow
              letter="C"
              label="Narrative Catalyst"
              weight="HIGH"
              score2="Structural change confirmed but not yet consensus. The market hasn't priced it in."
              score1="Speculative or unconfirmed catalyst. Early-stage trend, could go either way."
              score0="No catalyst or already fully priced in. Nothing to drive re-rating."
            />
            <CriterionRow
              letter="D"
              label="Earnings Inflection"
              weight="MEDIUM"
              score2="Revenue growth >20% YoY AND earnings within 60 days. Hard catalyst incoming."
              score1="Revenue growth >0% OR earnings within 60 days. Some positive momentum."
              score0="Revenue declining OR no near-term earnings. No inflection visible."
            />
            <CriterionRow
              letter="E"
              label="Institutional Under-Ownership"
              weight="MEDIUM"
              score2="Less than 10 analysts covering. Room for discovery — wall street hasn't noticed yet."
              score1="10-20 analysts. Moderate coverage, some discovery potential remains."
              score0="More than 20 analysts. Fully covered, nothing to discover."
            />
            <CriterionRow
              letter="F"
              label="Volume Accumulation"
              weight="MEDIUM"
              score2="Heavy volume on up days, light on down days — clear 4+ week pattern of smart money buying."
              score1="Some evidence but inconsistent. Mixed signals."
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
          </div>
        </Section>

        {/* Verdict Tiers */}
        <Section icon={Target} title="Verdict Tiers">
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-3">
              <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-bold text-purple-400">
                PRIORITY
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score ≥9 + earnings within 14 days + all gates pass. Highest
                probability window — hard catalyst imminent.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3">
              <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold text-green-400">
                KEEP
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score ≥10 + all gates pass. Strong setup, actively track and
                size a position.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
              <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-bold text-yellow-400">
                WATCH
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score 7-9 + all gates pass. Interesting but needs more
                confirmation. Monitor for improvement.
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
              <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400">
                DISCARD
              </span>
              <span className="text-sm text-[#c0c0c0]">
                Score &lt;7 OR any gate fails. Does not meet criteria. Move on.
              </span>
            </div>
          </div>
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
              "AI Optical/Connectivity Semis",
              "Advanced Packaging/Test",
              "SiC/GaN Power Semis",
              "Beaten-Down Cloud/SaaS",
              "Beaten-Down Biotech",
              "Energy/LNG Turnarounds",
              "Nuclear/Power Neoclouds",
              "Rare Earth/Critical Minerals",
              "EV/Hydrogen Turnarounds",
              "High Short Interest",
              "Rental/Travel",
            ].map((b) => (
              <div
                key={b}
                className="rounded border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-xs text-[#a0a0a0]"
              >
                {b}
              </div>
            ))}
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
