"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Layers,
  Eye,
  Scale,
  AlertTriangle,
  Target,
  Compass,
  Gauge,
  ArrowUpDown,
} from "lucide-react";

const SECTIONS = [
  { id: "what-it-does", label: "What Is It?" },
  { id: "ten-sectors", label: "10 Sectors" },
  { id: "composite-score", label: "Composite Score" },
  { id: "quadrants", label: "4 Quadrants" },
  { id: "regime", label: "Market Regime" },
  { id: "entry-signals", label: "Entry Signals" },
  { id: "token-picks", label: "Token Picks" },
  { id: "btc-dominance", label: "BTC Dominance" },
  { id: "how-to-read", label: "How to Read" },
  { id: "vs-equity", label: "Crypto vs Equity" },
  { id: "limitations", label: "Limitations" },
];

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
    <section id={id} className="scroll-mt-20 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
        {icon}
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-[#c0c0c0]">
        {children}
      </div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4">
      <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
      <div className="space-y-2 text-xs leading-relaxed text-[#a0a0a0]">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#5ba3e6]/30 bg-[#5ba3e6]/5 p-3 text-xs text-[#a0c8f0]">
      {children}
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
      {children}
    </div>
  );
}

export default function CryptoGuidePage() {
  const [, setTick] = useState(0);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTick((t) => t + 1);
  }, []);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Sidebar TOC */}
      <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:h-fit lg:w-48">
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
              href="/sectors/crypto"
              className="block rounded-md px-3 py-1.5 text-xs font-medium text-[#5ba3e6] transition-colors hover:bg-[#1a1a1a]"
            >
              &larr; Back to Crypto Dashboard
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
              <BookOpen className="h-8 w-8 text-[#5ba3e6]" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  Crypto Rotation Guide
                </h1>
                <p className="mt-1 text-[#a0a0a0]">
                  How to interpret crypto sector rotation, composite scores, market regime, and token picks &mdash; all measured relative to BTC.
                </p>
              </div>
            </div>
            <Link
              href="/sectors/crypto"
              className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#a0a0a0] transition-colors hover:text-white hover:border-[#444] shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </div>
        </section>

        {/* Section 1: What Is Crypto Rotation? */}
        <Section
          id="what-it-does"
          title="What Is Crypto Rotation?"
          icon={<TrendingUp className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            <strong className="text-white">Crypto rotation</strong> tracks where capital is flowing
            across 10 narrative-driven crypto sectors. Instead of measuring sectors against the S&amp;P 500
            (like equity rotation), everything here is measured <strong className="text-white">relative to BTC</strong>.
          </p>
          <p>
            When a sector outperforms BTC, money is rotating <em>into</em> that narrative. When it
            underperforms BTC, money is rotating <em>out</em>. This helps you identify which crypto
            themes are gaining momentum before they become consensus.
          </p>

          <SubSection title="Why Relative to BTC?">
            <p>
              BTC is the benchmark of the crypto market &mdash; it&apos;s the asset everything else is priced
              against. A DeFi token going up 5% when BTC is up 10% is actually <em>underperforming</em>.
              Relative strength strips out the overall market move and shows you the real rotation.
            </p>
          </SubSection>

          <SubSection title="What It Tracks">
            <ul className="list-disc pl-4 space-y-1">
              <li>10 crypto sectors, each represented by a proxy token</li>
              <li>Composite scores (0&ndash;100) combining 4 factors</li>
              <li>RRG quadrant positioning (Leading, Weakening, Lagging, Improving)</li>
              <li>Market regime (Risk-On, Risk-Off, Mixed)</li>
              <li>Entry signals for sector rotation trades</li>
              <li>Individual token picks with conviction scoring</li>
            </ul>
          </SubSection>
        </Section>

        {/* Section 2: The 10 Sectors */}
        <Section
          id="ten-sectors"
          title="The 10 Sectors"
          icon={<Layers className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Each sector represents a <strong className="text-white">crypto narrative</strong> &mdash;
            a theme that attracts capital. One proxy token per sector is used for price data, since
            there are no crypto sector ETFs.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
                  <th className="pb-2 pr-3 font-medium">Sector</th>
                  <th className="pb-2 pr-3 font-medium">Proxy</th>
                  <th className="pb-2 pr-3 font-medium">Description</th>
                  <th className="pb-2 font-medium">Key Holdings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                <tr><td className="py-2 pr-3 font-medium text-white">Layer 1</td><td className="py-2 pr-3 text-[#5ba3e6]">ETH</td><td className="py-2 pr-3">Base layer blockchains &mdash; settlement &amp; consensus</td><td className="py-2">ETH, SOL, ADA, AVAX, DOT, NEAR, APT, SUI</td></tr>
                <tr><td className="py-2 pr-3 font-medium text-white">Layer 2</td><td className="py-2 pr-3 text-[#5ba3e6]">POL</td><td className="py-2 pr-3">Scaling solutions and rollups</td><td className="py-2">POL, ARB, OP, MNT, IMX, STRK</td></tr>
                <tr><td className="py-2 pr-3 font-medium text-white">DeFi</td><td className="py-2 pr-3 text-[#5ba3e6]">UNI</td><td className="py-2 pr-3">Decentralized finance &mdash; lending, DEX, derivatives</td><td className="py-2">UNI, AAVE, MKR, CRV, LDO, COMP, PENDLE</td></tr>
                <tr><td className="py-2 pr-3 font-medium text-white">AI &amp; Compute</td><td className="py-2 pr-3 text-[#5ba3e6]">RENDER</td><td className="py-2 pr-3">AI, GPU compute, decentralized intelligence</td><td className="py-2">RENDER, FET, TAO, AKT, AR, THETA, GRT</td></tr>
                <tr><td className="py-2 pr-3 font-medium text-white">Real-World Assets</td><td className="py-2 pr-3 text-[#5ba3e6]">ONDO</td><td className="py-2 pr-3">Tokenized real-world assets and yield</td><td className="py-2">ONDO, MKR, LINK, PENDLE, CFG</td></tr>
                <tr><td className="py-2 pr-3 font-medium text-white">DePin</td><td className="py-2 pr-3 text-[#5ba3e6]">FIL</td><td className="py-2 pr-3">Decentralized physical infrastructure networks</td><td className="py-2">FIL, RENDER, HNT, AKT, AR, IOTX</td></tr>
                <tr><td className="py-2 pr-3 font-medium text-white">Memecoins</td><td className="py-2 pr-3 text-[#5ba3e6]">DOGE</td><td className="py-2 pr-3">Community-driven meme tokens</td><td className="py-2">DOGE, SHIB, PEPE, WIF, BONK, FLOKI</td></tr>
                <tr><td className="py-2 pr-3 font-medium text-white">Gaming</td><td className="py-2 pr-3 text-[#5ba3e6]">IMX</td><td className="py-2 pr-3">Blockchain gaming, metaverse, and NFT platforms</td><td className="py-2">IMX, AXS, SAND, MANA, GALA, ILV, RON</td></tr>
                <tr><td className="py-2 pr-3 font-medium text-white">Exchange Tokens</td><td className="py-2 pr-3 text-[#5ba3e6]">BNB</td><td className="py-2 pr-3">Centralized exchange native tokens</td><td className="py-2">BNB, CRO, OKB, LEO, KCS</td></tr>
                <tr><td className="py-2 pr-3 font-medium text-white">Infrastructure</td><td className="py-2 pr-3 text-[#5ba3e6]">LINK</td><td className="py-2 pr-3">Oracles, indexing, storage, and middleware</td><td className="py-2">LINK, GRT, FIL, PYTH, ENS</td></tr>
              </tbody>
            </table>
          </div>

          <Tip>
            The proxy token is a single liquid representative &mdash; it&apos;s not a perfect sector average,
            but it captures the narrative&apos;s momentum well enough for rotation analysis.
          </Tip>
        </Section>

        {/* Section 3: Composite Score */}
        <Section
          id="composite-score"
          title="Composite Score (0–100)"
          icon={<Gauge className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Each sector gets a single score from 0 to 100 based on 4 weighted factors. Higher means
            more capital is flowing in relative to BTC.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
                  <th className="pb-2 pr-3 font-medium">Factor</th>
                  <th className="pb-2 pr-3 font-medium">Weight</th>
                  <th className="pb-2 font-medium">What It Measures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                <tr>
                  <td className="py-2 pr-3 font-medium text-white">Momentum</td>
                  <td className="py-2 pr-3 text-[#5ba3e6]">30%</td>
                  <td className="py-2">20-day relative return vs BTC &mdash; is the sector outperforming right now?</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-medium text-white">Acceleration</td>
                  <td className="py-2 pr-3 text-[#5ba3e6]">20%</td>
                  <td className="py-2">Rate of change of relative strength &mdash; is momentum speeding up or slowing down?</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-medium text-white">Mansfield RS</td>
                  <td className="py-2 pr-3 text-[#5ba3e6]">25%</td>
                  <td className="py-2">Longer-term relative strength vs BTC (normalized) &mdash; sustained outperformance</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-medium text-white">Chaikin Money Flow</td>
                  <td className="py-2 pr-3 text-[#5ba3e6]">25%</td>
                  <td className="py-2">Volume-weighted buying/selling pressure (20-period) &mdash; is money flowing in?</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SubSection title="How to Interpret">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-green-500/10 border border-green-500/20 p-2">
                <div className="font-semibold text-green-400">70&ndash;100</div>
                <div className="text-[10px] text-green-400/70">Strong rotation in. Multiple factors aligning.</div>
              </div>
              <div className="rounded-md bg-[#5ba3e6]/10 border border-[#5ba3e6]/20 p-2">
                <div className="font-semibold text-[#5ba3e6]">50&ndash;70</div>
                <div className="text-[10px] text-[#5ba3e6]/70">Moderately favored. Watch for acceleration.</div>
              </div>
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2">
                <div className="font-semibold text-amber-400">30&ndash;50</div>
                <div className="text-[10px] text-amber-400/70">Neutral / mixed signals. No clear edge.</div>
              </div>
              <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2">
                <div className="font-semibold text-red-400">0&ndash;30</div>
                <div className="text-[10px] text-red-400/70">Capital rotating out. Underperforming BTC.</div>
              </div>
            </div>
          </SubSection>

          <Tip>
            Unlike the equity composite (which includes breadth and smart-money flow), the crypto composite
            uses only 4 factors because on-chain breadth and institutional flow data aren&apos;t available for
            most tokens.
          </Tip>
        </Section>

        {/* Section 4: The 4 Quadrants */}
        <Section
          id="quadrants"
          title="The 4 Quadrants (RRG)"
          icon={<Compass className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            The <strong className="text-white">Relative Rotation Graph (RRG)</strong> plots each sector
            by its relative strength (x-axis) and momentum of that relative strength (y-axis). Sectors
            rotate clockwise through 4 quadrants:
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-green-500/10 border border-green-500/20 p-3">
              <div className="text-sm font-semibold text-green-400">LEADING (top-right)</div>
              <div className="mt-1 text-xs text-green-400/70">
                Outperforming BTC with rising momentum. This is where you want to be.
              </div>
            </div>
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
              <div className="text-sm font-semibold text-amber-400">WEAKENING (bottom-right)</div>
              <div className="mt-1 text-xs text-amber-400/70">
                Still outperforming BTC, but momentum is fading. Early warning to trim.
              </div>
            </div>
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3">
              <div className="text-sm font-semibold text-red-400">LAGGING (bottom-left)</div>
              <div className="mt-1 text-xs text-red-400/70">
                Underperforming BTC with falling momentum. Avoid these sectors.
              </div>
            </div>
            <div className="rounded-md bg-[#5ba3e6]/10 border border-[#5ba3e6]/20 p-3">
              <div className="text-sm font-semibold text-[#5ba3e6]">IMPROVING (top-left)</div>
              <div className="mt-1 text-xs text-[#5ba3e6]/70">
                Still underperforming, but momentum is turning up. Early rotation signal.
              </div>
            </div>
          </div>

          <SubSection title="Clockwise Rotation">
            <p>
              Sectors tend to rotate clockwise: Improving &rarr; Leading &rarr; Weakening &rarr; Lagging &rarr; Improving.
              The most valuable signal is catching a sector moving from <strong className="text-white">Lagging into
              Improving</strong> &mdash; that&apos;s where the early money goes. Conversely, a sector moving from
              Leading into Weakening is a signal to start taking profits.
            </p>
          </SubSection>

          <Tip>
            A sector in the Improving quadrant with a rising composite score is the strongest
            &quot;early rotation&quot; signal. It means money is beginning to flow in before the sector
            actually starts outperforming.
          </Tip>
        </Section>

        {/* Section 5: Market Regime */}
        <Section
          id="regime"
          title="Market Regime"
          icon={<Scale className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            The regime tells you the overall crypto market environment, derived from BTC volatility
            and the median 20-day return across all 10 sectors.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
                  <th className="pb-2 pr-3 font-medium">Regime</th>
                  <th className="pb-2 pr-3 font-medium">Conditions</th>
                  <th className="pb-2 pr-3 font-medium">Favored</th>
                  <th className="pb-2 font-medium">Avoid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                <tr>
                  <td className="py-2 pr-3">
                    <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">RISK ON</span>
                  </td>
                  <td className="py-2 pr-3">BTC volatility &lt; 60%, median return &gt; 3%</td>
                  <td className="py-2 pr-3 text-green-400">AI, Memes, Gaming, DeFi</td>
                  <td className="py-2 text-[#666]">&mdash;</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400">RISK OFF</span>
                  </td>
                  <td className="py-2 pr-3">BTC volatility &gt; 80%, median return &lt; &minus;3%</td>
                  <td className="py-2 pr-3 text-amber-400">Exchange, Infrastructure</td>
                  <td className="py-2 text-red-400">Memes, Gaming</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">MIXED</span>
                  </td>
                  <td className="py-2 pr-3">Everything in between</td>
                  <td className="py-2 pr-3 text-[#666]">&mdash;</td>
                  <td className="py-2 text-[#666]">&mdash;</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SubSection title="BTC Volatility">
            <p>
              Calculated as the 20-day annualized realized volatility of BTC daily log returns.
              Low volatility (&lt; 60%) means a calm market where altcoins can outperform. High
              volatility (&gt; 80%) means fear &mdash; capital retreats to BTC and stablecoins.
            </p>
          </SubSection>

          <Warning>
            In Risk-Off, even &quot;good&quot; sectors struggle. The regime is a filter &mdash; when
            it&apos;s Risk-Off, reduce position sizes or sit in BTC/stables regardless of sector scores.
          </Warning>
        </Section>

        {/* Section 6: Entry Signals */}
        <Section
          id="entry-signals"
          title="Entry Signals"
          icon={<Target className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Three signals are tracked for each sector. When <strong className="text-white">2 out of 3</strong> fire
            simultaneously, it indicates a rotation event &mdash; capital is actively moving into that sector.
          </p>

          <div className="space-y-3">
            <SubSection title="1. RS Golden Cross">
              <p>
                The 10-day SMA of the sector/BTC relative strength ratio crosses above its 30-day SMA.
                This confirms short-term outperformance is accelerating beyond the longer trend.
              </p>
            </SubSection>

            <SubSection title="2. Volume Surge">
              <p>
                Daily trading volume exceeds 1.5&times; the 20-day average volume. High volume confirms
                conviction &mdash; real money is behind the move, not just a thin pump.
              </p>
            </SubSection>

            <SubSection title="3. Price Breakout">
              <p>
                The proxy token&apos;s price closes above its 50-day simple moving average. Price confirmation
                means the trend has turned &mdash; the sector is no longer in a downtrend.
              </p>
            </SubSection>
          </div>

          <Tip>
            A rotation event is detected when 2+ signals fire after at least 5 consecutive
            &quot;quiet&quot; days. This filters out noise and only flags meaningful regime shifts.
          </Tip>
        </Section>

        {/* Section 7: Token Picks & Conviction */}
        <Section
          id="token-picks"
          title="Token Picks & Conviction"
          icon={<Eye className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Within each sector, individual tokens are scored and filtered. Only tokens that pass
            quality gates get surfaced, with a conviction level reflecting how strong the setup is.
          </p>

          <SubSection title="Conviction Levels">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">HIGH</span>
                <span>3+ signals firing &mdash; strong sector + strong token. Highest conviction entries.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">MEDIUM</span>
                <span>2 signals &mdash; decent setup but not all factors aligned. Smaller size.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#666]/30 px-2 py-0.5 text-[10px] font-semibold text-[#a0a0a0]">WATCH</span>
                <span>0&ndash;1 signals &mdash; on the radar but not actionable yet. Wait for more confirmation.</span>
              </div>
            </div>
          </SubSection>

          <SubSection title="Conviction Signals (up to 7)">
            <ul className="list-disc pl-4 space-y-1">
              <li>Sector in Improving or Leading quadrant</li>
              <li>Sector composite score &ge; 70</li>
              <li>Token classified as Leader or Turnaround</li>
              <li>Relative strength acceleration &ge; 3.0 pts</li>
              <li>Sector showing stealth accumulation</li>
              <li>Volume ratio &ge; 1.2&times;</li>
            </ul>
          </SubSection>

          <SubSection title="Quality Gates">
            <p>Every token must pass these gates to be included:</p>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
                    <th className="pb-2 pr-3 font-medium">Gate</th>
                    <th className="pb-2 pr-3 font-medium">Threshold</th>
                    <th className="pb-2 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a2a]">
                  <tr><td className="py-1.5 pr-3 text-white">Market Cap</td><td className="py-1.5 pr-3">&ge; $50M</td><td className="py-1.5">Minimum viability</td></tr>
                  <tr><td className="py-1.5 pr-3 text-white">Dollar Volume</td><td className="py-1.5 pr-3">&ge; $500K/day</td><td className="py-1.5">Enough liquidity to trade</td></tr>
                  <tr><td className="py-1.5 pr-3 text-white">Volume Spike</td><td className="py-1.5 pr-3">&le; 10&times;</td><td className="py-1.5">Filter outlier pump-and-dumps</td></tr>
                  <tr><td className="py-1.5 pr-3 text-white">Price Extension</td><td className="py-1.5 pr-3">&le; 150% above 200-SMA</td><td className="py-1.5">Avoid extreme overbought</td></tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="Token Categories">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong className="text-white">Leader</strong> &mdash; Above 50-MA, outperforming its sector proxy, strong volume</li>
              <li><strong className="text-white">Catch-Up</strong> &mdash; Above 50-MA but lagging sector peers</li>
              <li><strong className="text-white">Turnaround</strong> &mdash; Below 50-MA but RS acceleration turning positive with volume</li>
              <li><strong className="text-white">Avoid</strong> &mdash; Fails quality gates or shows no positive signals</li>
            </ul>
          </SubSection>

          <Warning>
            Crypto quality gates are wider than equity gates (e.g., $50M market cap vs $2B for equities,
            150% extension vs 80%). This reflects crypto&apos;s higher volatility &mdash; but it also means
            more risk per token.
          </Warning>
        </Section>

        {/* Section 8: BTC Dominance & Alt Season */}
        <Section
          id="btc-dominance"
          title="BTC Dominance & Alt Season"
          icon={<ArrowUpDown className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            BTC dominance measures what percentage of total crypto market cap belongs to BTC.
            It&apos;s a key indicator for whether altcoins (everything besides BTC) are likely to outperform.
          </p>

          <SubSection title="What Rising Dominance Means">
            <p>
              When BTC dominance rises, capital is flowing <em>out</em> of altcoins and <em>into</em> BTC.
              This typically happens during fear events or early bull markets where BTC leads. In this
              environment, sector rotation signals are less reliable because everything is underperforming
              BTC regardless of narrative strength.
            </p>
          </SubSection>

          <SubSection title="What Falling Dominance Means">
            <p>
              When BTC dominance falls, capital is flowing <em>out</em> of BTC and <em>into</em> altcoins.
              This is when sector rotation matters most &mdash; the question shifts from &quot;BTC or
              alts?&quot; to &quot;which alts?&quot;
            </p>
          </SubSection>

          <SubSection title="Alt-Season Signal">
            <p>
              The dashboard uses a proxy for alt-season: when <strong className="text-white">dispersion
              &gt; 8%</strong> across the 10 sectors AND the median 20-day return is positive. High
              dispersion means altcoins are spreading out in performance (some big winners) rather than
              moving in lockstep &mdash; a sign that narrative-specific money is flowing.
            </p>
          </SubSection>

          <Tip>
            Sector rotation is most actionable during alt-season (falling BTC dominance, high dispersion).
            When BTC dominance is rising, the safest play is holding BTC and waiting.
          </Tip>
        </Section>

        {/* Section 9: How to Read the Dashboard */}
        <Section
          id="how-to-read"
          title="How to Read the Dashboard"
          icon={<BarChart3 className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            Here&apos;s a step-by-step workflow for reading the crypto rotation dashboard from top to bottom:
          </p>

          <div className="space-y-3">
            <div className="flex gap-3 rounded-md bg-[#141414] border border-[#2a2a2a] p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">1</div>
              <div>
                <div className="text-xs font-semibold text-white">Check the Market Regime</div>
                <div className="mt-0.5 text-[11px] text-[#a0a0a0]">Risk-On? Proceed. Risk-Off? Be cautious with alt exposure. Mixed? Be selective.</div>
              </div>
            </div>

            <div className="flex gap-3 rounded-md bg-[#141414] border border-[#2a2a2a] p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">2</div>
              <div>
                <div className="text-xs font-semibold text-white">Scan Entry Signals</div>
                <div className="mt-0.5 text-[11px] text-[#a0a0a0]">Look for sectors with 2+ signals firing. These are active rotation events.</div>
              </div>
            </div>

            <div className="flex gap-3 rounded-md bg-[#141414] border border-[#2a2a2a] p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">3</div>
              <div>
                <div className="text-xs font-semibold text-white">Read the Heatmap</div>
                <div className="mt-0.5 text-[11px] text-[#a0a0a0]">Green sectors are outperforming BTC. Bright green = strong. Look for clusters.</div>
              </div>
            </div>

            <div className="flex gap-3 rounded-md bg-[#141414] border border-[#2a2a2a] p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">4</div>
              <div>
                <div className="text-xs font-semibold text-white">Check the RRG Quadrants</div>
                <div className="mt-0.5 text-[11px] text-[#a0a0a0]">Focus on sectors in Improving (early) and Leading (confirmed). Avoid Lagging.</div>
              </div>
            </div>

            <div className="flex gap-3 rounded-md bg-[#141414] border border-[#2a2a2a] p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5ba3e6]/20 text-xs font-bold text-[#5ba3e6]">5</div>
              <div>
                <div className="text-xs font-semibold text-white">Review Token Picks</div>
                <div className="mt-0.5 text-[11px] text-[#a0a0a0]">Within the favored sectors, check individual token conviction levels. HIGH conviction = strongest setups.</div>
              </div>
            </div>
          </div>

          <Tip>
            Don&apos;t skip the regime check. Even a sector with 3 entry signals and a score of 90 is risky
            if the regime is Risk-Off. The regime is your macro filter.
          </Tip>
        </Section>

        {/* Section 10: Crypto vs Equity Rotation */}
        <Section
          id="vs-equity"
          title="Crypto vs Equity Rotation"
          icon={<ArrowUpDown className="h-5 w-5 text-[#5ba3e6]" />}
        >
          <p>
            The crypto rotation scanner shares the same framework as the equity sector rotation scanner,
            but with key differences that reflect the unique nature of crypto markets.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-left text-[#666]">
                  <th className="pb-2 pr-3 font-medium">Aspect</th>
                  <th className="pb-2 pr-3 font-medium">Equity</th>
                  <th className="pb-2 font-medium">Crypto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                <tr><td className="py-2 pr-3 text-white">Benchmark</td><td className="py-2 pr-3">SPY (S&amp;P 500)</td><td className="py-2">BTC</td></tr>
                <tr><td className="py-2 pr-3 text-white">Sector count</td><td className="py-2 pr-3">11 GICS sectors</td><td className="py-2">10 narrative sectors</td></tr>
                <tr><td className="py-2 pr-3 text-white">Score factors</td><td className="py-2 pr-3">6 (includes breadth, smart money)</td><td className="py-2">4 (momentum, accel, Mansfield, CMF)</td></tr>
                <tr><td className="py-2 pr-3 text-white">Market cap gate</td><td className="py-2 pr-3">&ge; $2B</td><td className="py-2">&ge; $50M</td></tr>
                <tr><td className="py-2 pr-3 text-white">Extension filter</td><td className="py-2 pr-3">&le; 80% above 200-SMA</td><td className="py-2">&le; 150% above 200-SMA</td></tr>
                <tr><td className="py-2 pr-3 text-white">Volume spike cap</td><td className="py-2 pr-3">&le; 5&times;</td><td className="py-2">&le; 10&times;</td></tr>
                <tr><td className="py-2 pr-3 text-white">Regime source</td><td className="py-2 pr-3">VIX + yield curve</td><td className="py-2">BTC volatility + median sector return</td></tr>
                <tr><td className="py-2 pr-3 text-white">Market hours</td><td className="py-2 pr-3">9:30&ndash;16:00 ET weekdays</td><td className="py-2">24/7</td></tr>
                <tr><td className="py-2 pr-3 text-white">Sector ETFs</td><td className="py-2 pr-3">Yes (XLK, XLF, etc.)</td><td className="py-2">No &mdash; proxy tokens only</td></tr>
              </tbody>
            </table>
          </div>

          <Tip>
            The wider thresholds for crypto (lower market cap, higher extension) aren&apos;t a flaw &mdash;
            they&apos;re necessary because crypto assets are structurally more volatile. A 100% move above
            the 200-SMA is normal in crypto; in equities it&apos;s extreme.
          </Tip>
        </Section>

        {/* Section 11: Limitations */}
        <Section
          id="limitations"
          title="Limitations"
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
        >
          <div className="space-y-3">
            <SubSection title="Higher Volatility">
              <p>
                Crypto sectors can swing 20&ndash;30% in a day. Rotation signals that work on a weekly
                equity timeframe can fire and reverse within hours in crypto. Always use stops and
                size positions for the volatility.
              </p>
            </SubSection>

            <SubSection title="24/7 Markets">
              <p>
                There&apos;s no opening bell or closing auction. Rotation can happen at 3 AM on a Sunday.
                Signals may shift between when you check and when you trade.
              </p>
            </SubSection>

            <SubSection title="Thinner Liquidity">
              <p>
                Most crypto tokens have a fraction of the liquidity of equity sector ETFs. Slippage
                is real, especially on smaller-cap tokens. The $50M market cap and $500K volume gates
                help, but they don&apos;t eliminate the risk.
              </p>
            </SubSection>

            <SubSection title="Narrative-Driven, Not Fundamental">
              <p>
                Equity sectors rotate based on economic cycles (rates, earnings, GDP). Crypto sectors
                rotate based on narratives (AI hype, L2 season, meme cycles). Narratives can shift
                faster and less predictably than economic fundamentals.
              </p>
            </SubSection>

            <SubSection title="Proxy Token Imprecision">
              <p>
                Each sector is measured by a single proxy token, not a cap-weighted basket. If ETH
                pumps but SOL, ADA, and AVAX don&apos;t, the &quot;Layer 1&quot; sector looks strong
                even though most L1s are lagging. Treat the proxy as directional, not precise.
              </p>
            </SubSection>

            <SubSection title="No On-Chain Data">
              <p>
                The composite score doesn&apos;t include on-chain metrics (TVL, active addresses,
                protocol revenue). It&apos;s purely price/volume-based. On-chain data could provide
                better leading signals but isn&apos;t available in the current data pipeline.
              </p>
            </SubSection>
          </div>

          <Warning>
            Crypto rotation is a directional tool, not a precision instrument. Use it to identify
            which narratives are gaining momentum, then do your own research on specific tokens
            within those sectors.
          </Warning>
        </Section>
      </div>
    </div>
  );
}
