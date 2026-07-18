"use client";

import { Fragment, useState, useEffect, useMemo } from "react";
import { Loader2, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Shield, Banknote, Crosshair, BookOpen, ArrowRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import Link from "next/link";
import { DataAgeBadge } from "@/components/data-age-badge";
import { useSectorData } from "../_use-sector-data";
import {
  CollapsiblePanel,
  useCollapsedPanels,
  TradingActionBadge,
  quadrantColor,
  SectorNav,
  LOADING_PHASES,
} from "../_components";
import type { CatalystCalendarEvent } from "@/lib/catalyst/types";
import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import type { FuturesSnapshot, ChecklistItem, TradingBias, SectorBreadth, VixData, TradingBiasSnapshot } from "@/lib/premarket/types";
import { computeBiasScore } from "@/lib/premarket/scoring";
import { PREMARKET_SCORING } from "@/lib/sector-rotation/config";
import { loadHistory } from "@/lib/sector-rotation/history";
import { SUB_SECTOR_PARENT, subSectorDivergenceTooltip, computeSubSectorDivergences } from "@/lib/sector-rotation/sub-sector-constants";
import type { SubSectorDivergence } from "@/lib/sector-rotation/sub-sector-constants";
import {
  computeMarketPosture,
  computeSectorTiers,
  computeRiskFlags,
  computeWhatChanged,
  savePosture,
  loadPreviousPosture,
  type MarketPosture,
  type PostureResult,
  type RiskFlag,
  type SectorTiers,
  type WhatChangedResult,
} from "@/lib/sector-rotation/brief";
import { computeLeadershipHealth } from "@/lib/sector-rotation/leadership-health";
import type { LeadershipHealth } from "@/lib/sector-rotation/leadership-health";

// ── Posture color mapping ──

const POSTURE_STYLES: Record<MarketPosture, { bg: string; border: string; text: string; icon: typeof TrendingUp }> = {
  AGGRESSIVE: { bg: "bg-green-500/10", border: "border-green-500/40", text: "text-green-400", icon: TrendingUp },
  SELECTIVE: { bg: "bg-cyan-500/10", border: "border-cyan-500/40", text: "text-cyan-400", icon: Crosshair },
  DEFENSIVE: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-400", icon: Shield },
  CASH: { bg: "bg-red-500/10", border: "border-red-500/40", text: "text-red-400", icon: Banknote },
};

type TabView = "brief" | "guide";

export default function DailyBriefPage() {
  const { data, loading, error, fetchData, rotationData, loadingPhase, loadingTimeout, setLoadingTimeout } = useSectorData();
  const [collapsed, toggle] = useCollapsedPanels("ew-brief-collapsed-v1");
  const [macroEvents, setMacroEvents] = useState<CatalystCalendarEvent[]>([]);
  const [macroLoading, setMacroLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabView>("brief");
  const [futures, setFutures] = useState<FuturesSnapshot[]>([]);
  const [sectorBreadth, setSectorBreadth] = useState<SectorBreadth | null>(null);
  const [vixData, setVixData] = useState<VixData | null>(null);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [tradingBias, setTradingBias] = useState<TradingBias | null>(null);
  const [biasSnapshot, setBiasSnapshot] = useState<TradingBiasSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);

  // Fetch macro events + pre-market data in parallel
  useEffect(() => {
    fetch("/api/macro-events")
      .then((res) => (res.ok ? res.json() : []))
      .then((events: CatalystCalendarEvent[]) => setMacroEvents(events))
      .catch(() => setMacroEvents([]))
      .finally(() => setMacroLoading(false));

    const fetchPulse = () => {
      fetch("/api/premarket")
        .then((res) => (res.ok ? res.json() : null))
        .then((result: { futures: FuturesSnapshot[]; sectorBreadth?: SectorBreadth | null; vixData?: VixData | null; tradingBias?: TradingBias | null } | null) => {
          if (result) {
            setFutures(result.futures);
            setSectorBreadth(result.sectorBreadth ?? null);
            setVixData(result.vixData ?? null);
            setTradingBias(result.tradingBias ?? null);
          }
        })
        .catch(() => {})
        .finally(() => setPulseLoading(false));
    };
    fetchPulse();

    // Auto-refresh pre-market data every 2 minutes
    const pulseInterval = setInterval(fetchPulse, 2 * 60 * 1000);

    // One-time fetch of persisted 9 AM trading bias snapshot
    fetch("/api/trading-bias/daily")
      .then((res) => (res.ok ? res.json() : null))
      .then((result: { snapshot: TradingBiasSnapshot | null } | null) => {
        if (result?.snapshot) {
          // Only use snapshot if it matches today in ET timezone
          const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
          if (result.snapshot.snapshot_date === todayET) {
            setBiasSnapshot(result.snapshot);
          }
        }
      })
      .catch(() => {})
      .finally(() => setSnapshotLoading(false));

    return () => clearInterval(pulseInterval);
  }, []);

  // Compute analysis
  const posture = useMemo<PostureResult | null>(
    () => (data ? computeMarketPosture(data, rotationData) : null),
    [data, rotationData]
  );

  const tiers = useMemo<SectorTiers | null>(
    () => (data ? computeSectorTiers(data.sectors, rotationData) : null),
    [data, rotationData]
  );

  const riskFlags = useMemo<RiskFlag[]>(
    () => (data ? computeRiskFlags(data, rotationData) : []),
    [data, rotationData]
  );

  // Load yesterday's snapshot from localStorage
  const previousSnapshot = useMemo(() => {
    const history = loadHistory();
    const today = new Date().toISOString().slice(0, 10);
    // Find most recent snapshot that ISN'T today and is within 3 days
    const match = history.find((s) => s.date !== today) ?? null;
    if (!match) return null;
    const ageMs = Date.now() - new Date(match.date).getTime();
    if (ageMs > 3 * 24 * 60 * 60 * 1000) return null; // stale — more than 3 days old
    return match;
  }, []);

  // Load yesterday's posture from localStorage
  const previousPosture = useMemo(() => loadPreviousPosture(), []);

  // Compute what changed
  const whatChanged = useMemo<WhatChangedResult | null>(
    () =>
      data && posture
        ? computeWhatChanged(data, posture.posture, previousSnapshot, previousPosture, rotationData)
        : null,
    [data, posture, previousSnapshot, previousPosture, rotationData]
  );

  // Compute bias score from pre-market + existing regime/posture data
  const biasResult = useMemo(() => {
    if (!posture || futures.length === 0) return null;
    const regimeData = data?.regime ? {
      regime: data.regime.regime,
      regimeConfidence: data.regime.regimeConfidence,
      vix: data.regime.vix,
      vixSlope: data.regime.vixSlope,
      yield10y: data.regime.yield10y,
      dxy: data.regime.dxy,
      dxyTrend: data.regime.dxyTrend,
      favoredSectors: data.regime.favoredSectors,
      avoidSectors: data.regime.avoidSectors,
      vixBounds: data.regime.vixBounds ?? PREMARKET_SCORING.DEFAULT_VIX_BOUNDS,
    } : null;
    return computeBiasScore(futures, posture, regimeData, sectorBreadth);
  }, [futures, posture, data?.regime, sectorBreadth]);

  // Leadership health
  const leadershipHealth = useMemo(() => {
    if (!data?.leadershipBasketScores?.length) return null;
    return computeLeadershipHealth(
      data.leadershipBasketScores,
      data.crossAssetScores ?? [],
      data.sectors,
      data.subSectorScores ?? [],
    );
  }, [data]);

  // Sub-sector divergences
  const subSectorDivergences = useMemo(() => {
    if (!data?.subSectorScores?.length || !data.sectors.length) return [];
    return computeSubSectorDivergences(data.subSectorScores, data.sectors);
  }, [data]);

  // Persist today's posture (side effect)
  useEffect(() => {
    if (posture) savePosture(posture.posture);
  }, [posture]);

  // Loading state
  if (loading && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#5ba3e6]" />
        <p className="mt-4 text-[#888]">{LOADING_PHASES[loadingPhase]}...</p>
        <div className="mt-2 flex justify-center gap-1.5">
          {LOADING_PHASES.map((_, i) => (
            <div key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i <= loadingPhase ? "bg-[#5ba3e6]" : "bg-[#333]"}`} />
          ))}
        </div>
        {loadingTimeout && (
          <div className="mt-6">
            <p className="text-xs text-amber-400">This is taking longer than expected.</p>
            <button onClick={() => { setLoadingTimeout(false); fetchData(true); }} className="mt-2 rounded-lg bg-[#5ba3e6] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a8fd4]">Retry</button>
          </div>
        )}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-2 text-red-400">Error: {error}</p>
          <button onClick={() => fetchData(true)} className="mt-4 rounded-lg bg-[#222] px-4 py-2 text-sm text-white hover:bg-[#333]">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const upcomingEvents = macroEvents.filter((e) => e.daysAway <= 7);
  const totalChanges = whatChanged
    ? (whatChanged.postureChange ? 1 : 0) +
      whatChanged.quadrantTransitions.length +
      whatChanged.tierChanges.length +
      Math.min(whatChanged.scoreMovers.length, 3) +
      whatChanged.trendFlips.length +
      (whatChanged.dispersionChange ? 1 : 0)
    : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">Daily Market Brief</h1>
            <SectorNav active="brief" />
          </div>
          <p className="mt-1 text-xs text-[#666]">60-second morning check — zero overlap with other pages</p>
        </div>
        <div className="flex items-center gap-3">
          <DataAgeBadge calculatedAt={data.calculatedAt} warnAfterMin={20} />
          <button
            onClick={() => fetchData(true)}
            className="rounded-lg border border-[#333] p-2 text-[#888] hover:bg-[#1a1a1a] hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 rounded-lg border border-[#333] bg-[#111] p-1 w-fit">
        <button
          onClick={() => setActiveTab("brief")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "brief" ? "bg-[#222] text-white" : "text-[#888] hover:text-white"
          }`}
        >
          Brief
        </button>
        <button
          onClick={() => setActiveTab("guide")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "guide" ? "bg-[#222] text-white" : "text-[#888] hover:text-white"
          }`}
        >
          <BookOpen className="h-3 w-3" />
          Guide
        </button>
      </div>

      {/* Guide Tab */}
      {activeTab === "guide" && <BriefGuide />}

      {/* Brief Content */}
      {activeTab === "brief" && <>

      {/* 0. Pre-Market Pulse */}
      <CollapsiblePanel
        id="pulse"
        title={`Pre-Market Pulse \u2014 ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })}`}
        collapsed={collapsed.has("pulse")}
        onToggle={toggle}
        badge={
          biasResult ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
              biasResult.score >= 2 ? "bg-green-500/10 border-green-500/30 text-green-400"
                : biasResult.score <= -2 ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
            }`}>
              {tradingBias?.bias ?? biasResult.label} ({biasResult.score > 0 ? "+" : ""}{biasResult.score})
            </span>
          ) : pulseLoading ? (
            <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">Loading...</span>
          ) : null
        }
      >
        <PreMarketPulseContent
          futures={futures}
          regime={data?.regime ?? null}
          biasResult={biasResult}
          loading={pulseLoading}
          subSectorScores={data?.subSectorScores ?? []}
        />
      </CollapsiblePanel>

      {/* 0.5 Pre-Market Trading Bias */}
      <TradingBiasCard bias={tradingBias} loading={pulseLoading} snapshot={biasSnapshot} snapshotLoading={snapshotLoading} />

      {/* 0.6 Leadership Health */}
      {leadershipHealth && <LeadershipHealthCard health={leadershipHealth} />}

      {/* 0.7 Policy Pulse */}
      <PolicyPulseWidget />

      {/* 1. Market Posture Banner */}
      {posture && <PostureBanner posture={posture} />}

      {/* 2. What Changed Today */}
      {whatChanged && (
        <CollapsiblePanel
          id="changes"
          title="What Changed Today"
          collapsed={collapsed.has("changes")}
          onToggle={toggle}
          badge={
            whatChanged.noHistory ? (
              <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">First visit</span>
            ) : totalChanges === 0 ? (
              <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">No changes</span>
            ) : (
              <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] text-cyan-400">
                {totalChanges} change{totalChanges > 1 ? "s" : ""}
              </span>
            )
          }
        >
          <WhatChangedPanel whatChanged={whatChanged} />
        </CollapsiblePanel>
      )}

      {/* 3. Risk Flags */}
      <CollapsiblePanel
        id="risks"
        title="Risk Flags"
        collapsed={collapsed.has("risks")}
        onToggle={toggle}
        badge={
          riskFlags.length > 0 ? (
            <span className="rounded-full bg-red-500/10 border border-red-500/30 px-2 py-0.5 text-[10px] text-red-400">
              {riskFlags.length} flag{riskFlags.length > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="rounded-full bg-green-500/10 border border-green-500/30 px-2 py-0.5 text-[10px] text-green-400">
              Clear
            </span>
          )
        }
      >
        {riskFlags.length === 0 ? (
          <p className="text-sm text-green-400">No risk flags detected.</p>
        ) : (
          <div className="space-y-2">
            {riskFlags.map((f, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${f.severity === "high" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${f.severity === "high" ? "bg-red-400" : "bg-amber-400"}`} />
                  <span className={`text-sm font-medium ${f.severity === "high" ? "text-red-400" : "text-amber-400"}`}>{f.message}</span>
                </div>
                <p className="mt-1 text-xs text-[#999]">{f.detail}</p>
              </div>
            ))}
          </div>
        )}
      </CollapsiblePanel>

      {/* 4. Sector Tiers */}
      {tiers && (
        <CollapsiblePanel
          id="tiers"
          title="Sector Tiers"
          collapsed={collapsed.has("tiers")}
          onToggle={toggle}
          badge={
            <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">
              {tiers.actionable.length} actionable
            </span>
          }
        >
          <div className="space-y-4">
            <TierTable label="Actionable" sectors={tiers.actionable} labelColor="text-green-400" subSectorScores={data?.subSectorScores ?? []} />
            <TierTable label="Watch" sectors={tiers.watch} labelColor="text-amber-400" subSectorScores={data?.subSectorScores ?? []} />
            <TierTable label="Avoid" sectors={tiers.avoid} labelColor="text-red-400" subSectorScores={data?.subSectorScores ?? []} />
          </div>
        </CollapsiblePanel>
      )}

      {/* 4.5 Sub-Sector Divergences */}
      {subSectorDivergences.filter((d) => d.signal !== "aligned").length > 0 && (
        <CollapsiblePanel
          id="divergences"
          title="Sub-Sector Divergences"
          collapsed={collapsed.has("divergences")}
          onToggle={toggle}
          badge={
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] text-cyan-400">
              {subSectorDivergences.filter((d) => d.signal !== "aligned").length} active
            </span>
          }
        >
          <p className="text-[10px] text-[#555] mb-3">Sub-sectors diverging from parent GICS sectors — early rotation signals.</p>
          <div className="space-y-2">
            {subSectorDivergences.filter((d) => d.signal !== "aligned").map((d) => (
              <div key={d.subEtf} className={`rounded-lg border p-3 ${d.signal === "leading" ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{d.subEtf}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${quadrantColor(d.subQuadrant)}`}>{d.subQuadrant}</span>
                    <span className="text-[#555]">{"\u2192"}</span>
                    <span className="text-xs text-[#888]">{d.parentEtf}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${quadrantColor(d.parentQuadrant)}`}>{d.parentQuadrant}</span>
                  </div>
                  <span className={`text-xs font-mono ${d.scoreDelta > 0 ? "text-green-400" : "text-red-400"}`}>
                    {d.scoreDelta > 0 ? "+" : ""}{d.scoreDelta}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-[#888]">
                  {d.subName} {d.signal === "leading" ? "leading" : "lagging"} {d.parentName} — {d.context}
                </p>
              </div>
            ))}
          </div>
        </CollapsiblePanel>
      )}

      {/* 5. Upcoming Events */}
      <CollapsiblePanel
        id="events"
        title="Upcoming Events"
        collapsed={collapsed.has("events")}
        onToggle={toggle}
        badge={<span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">{upcomingEvents.length} next 7d</span>}
      >
        {macroLoading ? (
          <p className="text-sm text-[#666]">Loading macro events...</p>
        ) : upcomingEvents.length === 0 ? (
          <p className="text-sm text-[#666]">No macro events in the next 7 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-[#666]">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Event</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 text-right">Days Away</th>
                </tr>
              </thead>
              <tbody>
                {upcomingEvents.map((e, i) => (
                  <tr key={i} className="border-t border-[#222]">
                    <td className="py-1.5 pr-4 text-[#ccc]">{e.date}</td>
                    <td className="py-1.5 pr-4 text-white font-medium">{e.label}</td>
                    <td className="py-1.5 pr-4">
                      <span className="rounded-full bg-[#222] border border-[#333] px-2 py-0.5 text-[10px] text-[#888] uppercase">{e.type.replaceAll("_", " ")}</span>
                    </td>
                    <td className={`py-1.5 text-right font-medium ${e.daysAway <= 1 ? "text-red-400" : e.daysAway <= 2 ? "text-amber-400" : "text-[#ccc]"}`}>
                      {e.daysAway === 0 ? "Today" : e.daysAway === 1 ? "Tomorrow" : `${e.daysAway}d`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsiblePanel>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        <NavCard
          href="/sectors"
          title="Sector Dashboard"
          description="Full 23-ETF scores, RRG chart, regime, correlations"
          stat={`${data.sectors.length} sectors scored`}
        />
        <NavCard
          href="/sectors/picks"
          title="Stock Picks"
          description="Multi-factor stock scanner with filters"
          stat={
            data.enrichedStocks
              ? `${data.enrichedStocks.passed.length} stocks passed`
              : "View picks"
          }
        />
        <NavCard
          href="/sectors/crypto"
          title="Crypto Rotation"
          description="BTC-relative sector rotation for crypto assets"
          stat="10 crypto sectors"
        />
        <NavCard
          href="/rotation"
          title="Rotation Tracker"
          description="Event timeline, sparklines, projections"
          stat={`${rotationData?.activeRotations.length ?? 0} active rotations`}
        />
      </div>

      </>}
    </div>
  );
}

// ── Sub-components ──

// ── Trading Bias Card ──

const BIAS_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  "Strong Bull": { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  "Lean Bull": { bg: "bg-emerald-500/5", border: "border-emerald-500/20", text: "text-emerald-400" },
  Neutral: { bg: "bg-amber-500/5", border: "border-amber-500/20", text: "text-amber-400" },
  "Lean Bear": { bg: "bg-red-500/5", border: "border-red-500/20", text: "text-red-400" },
  "Strong Bear": { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400" },
};

// ── Bias divergence helpers ──

const BIAS_LEVEL: Record<string, number> = {
  "Strong Bear": -2, "Lean Bear": -1, Neutral: 0, "Lean Bull": 1, "Strong Bull": 2,
};

function computeDivergence(snapshotBias: string, liveBias: string): { label: string; color: string } | null {
  const sLevel = BIAS_LEVEL[snapshotBias] ?? 0;
  const lLevel = BIAS_LEVEL[liveBias] ?? 0;
  const diff = Math.abs(sLevel - lLevel);
  if (diff === 0) return null;
  // Opposite sides of neutral (e.g., Lean Bull → Lean Bear)
  if ((sLevel > 0 && lLevel < 0) || (sLevel < 0 && lLevel > 0)) {
    return { label: "Reversed", color: "text-red-400 bg-red-500/10 border-red-500/30" };
  }
  // Strong directional call faded to Neutral (e.g., Strong Bull → Neutral)
  if (lLevel === 0 && Math.abs(sLevel) >= 2) {
    return { label: "Faded", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
  }
  // Directional call degraded to Neutral (e.g., Lean Bull → Neutral)
  if (lLevel === 0 && Math.abs(sLevel) === 1) {
    return { label: "Faded", color: "text-amber-400/70 bg-amber-500/5 border-amber-500/20" };
  }
  // Same side shift of 2+ levels (e.g., Strong Bull → Lean Bull skipping a level, rare)
  if (diff >= 2) {
    return { label: "Shifted", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
  }
  // Minor 1-level same-direction shift (e.g., Strong Bull → Lean Bull)
  return { label: "Adjusted", color: "text-[#666] bg-[#181818] border-[#2a2a2a]" };
}

function TradingBiasCard({ bias, loading, snapshot, snapshotLoading }: {
  bias: TradingBias | null;
  loading: boolean;
  snapshot: TradingBiasSnapshot | null;
  snapshotLoading: boolean;
}) {
  if (loading && !bias) return null;

  const hasSnapshot = !!snapshot;
  const cardTitle = hasSnapshot ? "Live Trading Bias" : "Pre-Market Trading Bias";

  if (!bias) {
    return (
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-4 space-y-3">
        {/* 9 AM Snapshot header */}
        <SnapshotHeader snapshot={snapshot} snapshotLoading={snapshotLoading} liveBias={null} />
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-[#888]">{cardTitle}</h2>
        </div>
        <p className="text-xs text-[#555]">Insufficient data — waiting for futures</p>
      </div>
    );
  }

  const style = BIAS_STYLES[bias.bias] ?? BIAS_STYLES.Neutral;
  const dirColor = bias.preferredDirection === "Long" ? "text-green-400 bg-green-500/10 border-green-500/30"
    : bias.preferredDirection === "Short" ? "text-red-400 bg-red-500/10 border-red-500/30"
    : "text-[#888] bg-[#222] border-[#333]";
  const dayTypeColor = bias.dayType === "Trend Day" ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/30"
    : bias.dayType === "Range Day" ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
    : "text-[#888] bg-[#222] border-[#333]";

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 space-y-3`}>
      {/* 9 AM Snapshot header */}
      <SnapshotHeader snapshot={snapshot} snapshotLoading={snapshotLoading} liveBias={bias.bias} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">{cardTitle}</h2>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${style.text}`}>{bias.bias}</span>
          <span className="text-xs text-[#888]">({bias.confidence}%)</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="h-1.5 rounded-full bg-[#222] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            bias.confidence >= 60 ? "bg-emerald-500" : bias.confidence >= 40 ? "bg-amber-500" : "bg-red-500"
          }`}
          style={{ width: `${bias.confidence}%` }}
        />
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${dirColor}`}>
          {bias.preferredDirection}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${dayTypeColor}`}>
          {bias.dayType}
        </span>
      </div>

      {/* Leadership + VIX row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[#666]">Leading:</span>
            <span className="text-white font-medium">{bias.leadingAsset ?? "\u2014"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#666]">Weakest:</span>
            <span className="text-white font-medium">{bias.weakestAsset ?? "\u2014"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#666]">Best to trade:</span>
            {bias.bestToTrade ? (
              <span className="text-white font-medium">
                {bias.bestToTrade.symbol}{" "}
                <span className={bias.bestToTrade.direction === "long" ? "text-green-400" : "text-red-400"}>
                  ({bias.bestToTrade.direction})
                </span>
              </span>
            ) : (
              <span className="text-white font-medium">{"\u2014"}</span>
            )}
          </div>
          {bias.assetToAvoid && (
            <div className="flex items-center gap-2">
              <span className="text-[#666]">Avoid:</span>
              <span className="text-red-400 font-medium">{bias.assetToAvoid}</span>
            </div>
          )}
        </div>
        <div>
          <span className="text-[#666]">VIX:</span>{" "}
          <span className="text-[#ccc]">{bias.vixInterpretation}</span>
        </div>
      </div>

      {/* Playbook */}
      <div>
        <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Playbook</div>
        <p className="text-xs text-[#ccc] italic leading-relaxed">{bias.playbook}</p>
      </div>

      {/* Why This Bias */}
      {bias.whyThisBias.length > 0 && (
        <div>
          <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Why This Bias</div>
          <ul className="space-y-0.5">
            {bias.whyThisBias.map((reason, i) => (
              <li key={i} className="text-xs text-[#999] flex items-start gap-1.5">
                <span className="text-[#555] mt-0.5 shrink-0">&bull;</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SnapshotHeader({ snapshot, snapshotLoading, liveBias }: {
  snapshot: TradingBiasSnapshot | null;
  snapshotLoading: boolean;
  liveBias: string | null;
}) {
  // Still loading
  if (snapshotLoading) return null;

  // No snapshot for today
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-[#222] bg-[#0d0d0d] px-3 py-2">
        <p className="text-[10px] text-[#555]">9 AM prediction pending</p>
      </div>
    );
  }

  const snapStyle = BIAS_STYLES[snapshot.bias] ?? BIAS_STYLES.Neutral;
  const snapDirColor = snapshot.preferred_direction === "Long" ? "text-green-400"
    : snapshot.preferred_direction === "Short" ? "text-red-400"
    : "text-[#888]";

  // Divergence detection
  const divergence = liveBias ? computeDivergence(snapshot.bias, liveBias) : null;

  return (
    <div className="rounded-lg border border-[#222] bg-[#0d0d0d] px-3 py-2.5 space-y-2">
      {/* Top row: timestamp + bias + confidence + direction + divergence */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 text-[9px] text-[#666] font-mono">
          9:00 AM
        </span>
        <span className={`text-xs font-bold ${snapStyle.text}`}>{snapshot.bias}</span>
        {snapshot.confidence != null && (
          <span className="text-[10px] text-[#666]">({snapshot.confidence}%)</span>
        )}
        {snapshot.preferred_direction && (
          <span className={`text-[10px] font-medium ${snapDirColor}`}>
            {snapshot.preferred_direction}
          </span>
        )}
        {snapshot.day_type && (
          <span className="text-[10px] text-[#555]">{snapshot.day_type}</span>
        )}
        {divergence && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${divergence.color}`}>
            {divergence.label}
          </span>
        )}
      </div>

      {/* Futures snapshot values — only equity futures (bias inputs), not commodities */}
      {snapshot.futures_snapshot && snapshot.futures_snapshot.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
          {snapshot.futures_snapshot
            .filter((f) => ["ES=F", "NQ=F", "YM=F", "RTY=F"].includes(f.symbol))
            .map((f) => {
            const isUp = f.changePct >= 0;
            return (
              <div key={f.symbol} className="flex items-center gap-1 text-[10px]">
                <span className="text-[#666]">{f.symbol.replace("=F", "")}</span>
                <span className={`font-mono font-medium ${isUp ? "text-green-400/70" : "text-red-400/70"}`}>
                  {isUp ? "+" : ""}{f.changePct.toFixed(2)}%
                </span>
              </div>
            );
          })}
          {snapshot.vix != null && (
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-[#666]">VIX</span>
              <span className="text-[#888] font-mono">{snapshot.vix.toFixed(1)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LeadershipHealthCard({ health }: { health: LeadershipHealth }) {
  const barColor = health.score >= 65 ? "bg-emerald-500" : health.score >= 35 ? "bg-amber-500" : "bg-red-500";
  const labelColor = health.score >= 65 ? "text-emerald-400" : health.score >= 35 ? "text-amber-400" : "text-red-400";
  const borderColor = health.score >= 65 ? "border-emerald-500/30" : health.score >= 35 ? "border-amber-500/30" : "border-red-500/30";
  const bgColor = health.score >= 65 ? "bg-emerald-500/5" : health.score >= 35 ? "bg-amber-500/5" : "bg-red-500/5";

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Leadership Health</h2>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${labelColor}`}>{health.score}</span>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-1.5 rounded-full bg-[#222] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${health.score}%` }}
        />
      </div>

      {/* Label */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold ${labelColor}`}>{health.label}</span>
        {health.broadening && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">Broadening</span>
        )}
        {health.megaCapDominant && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">Mega-Cap Led</span>
        )}
        {health.specRiskOn && (
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-400">Spec Risk On</span>
        )}
      </div>

      {/* Summary */}
      <p className="text-xs text-[#ccc] leading-relaxed">{health.summary}</p>

      {/* Bullets */}
      {health.bullets.length > 0 && (
        <ul className="space-y-0.5">
          {health.bullets.map((b, i) => (
            <li key={i} className="text-xs text-[#999] flex items-start gap-1.5">
              <span className="text-[#555] mt-0.5 shrink-0">&bull;</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PostureBanner({ posture }: { posture: PostureResult }) {
  const style = POSTURE_STYLES[posture.posture];
  const Icon = style.icon;
  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-6 w-6 ${style.text}`} />
        <span className={`text-xl font-bold ${style.text}`}>{posture.posture}</span>
      </div>
      <p className="mt-2 text-sm text-[#ccc]">{posture.reasoning}</p>
    </div>
  );
}

// SUB_SECTOR_PARENT and divergence helpers imported from @/lib/sector-rotation/sub-sector-constants

// ── Pre-Market Pulse ──

function generateBiasSummary(bias: { score: number; checklist: ChecklistItem[] }): string {
  const bullish = bias.checklist.filter((i) => i.status === "bullish");
  const bearish = bias.checklist.filter((i) => i.status === "bearish");

  const futuresBull = bullish.some((i) => i.category === "futures");
  const futuresBear = bearish.some((i) => i.category === "futures");
  const lowVol = bullish.some((i) => i.id === "vix");
  const highVol = bearish.some((i) => i.id === "vix");
  const rotationBull = bullish.some((i) => i.category === "sectors");
  const rotationBear = bearish.some((i) => i.category === "sectors");

  const parts: string[] = [];
  if (futuresBull) parts.push("futures are up");
  else if (futuresBear) parts.push("futures are down");
  if (lowVol) parts.push("volatility is low");
  else if (highVol) parts.push("VIX is elevated");
  if (rotationBull) parts.push("rotation favors risk-on");
  else if (rotationBear) parts.push("rotation leans defensive");

  if (bias.score >= 3) {
    const detail = parts.length > 0 ? parts.join(", ") + " — " : "";
    return `${detail}conditions lean bullish.`;
  }
  if (bias.score <= -3) {
    const detail = parts.length > 0 ? parts.join(" and ") + " — " : "";
    return `${detail}caution warranted.`;
  }
  return "Mixed signals across futures, macro, and rotation — no clear directional edge.";
}

const INDEX_FUTURES = new Set(["ES=F", "NQ=F", "RTY=F", "YM=F"]);

function FuturesRow({ items, label }: { items: FuturesSnapshot[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      <span className="text-[10px] text-[#555] font-medium uppercase tracking-wider w-12 shrink-0">{label}</span>
      {items.map((f) => {
        const isUp = f.changePct >= 0;
        return (
          <div key={f.symbol} className="flex items-center gap-1.5 text-xs">
            <span className="text-[#888] font-medium">{f.symbol.replace("=F", "")}</span>
            <span className="text-[#ccc] font-mono">{f.price.toFixed(2)}</span>
            <span className={`flex items-center gap-0.5 font-semibold ${isUp ? "text-green-400" : "text-red-400"}`}>
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isUp ? "+" : ""}{f.changePct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PreMarketPulseContent({
  futures,
  regime,
  biasResult,
  loading,
  subSectorScores,
}: {
  futures: FuturesSnapshot[];
  regime: { vix: number; vixSlope: "rising" | "falling" | "flat"; yield10y: number; dxy: number; dxyTrend: "rising" | "falling" | "flat"; regimeConfidence: number } | null;
  biasResult: { score: number; label: string; checklist: ChecklistItem[] } | null;
  loading: boolean;
  subSectorScores: SectorRotationScore[];
}) {
  if (loading && futures.length === 0) {
    return <p className="text-sm text-[#666]">Loading pre-market data...</p>;
  }

  if (futures.length === 0 && !regime) {
    return <p className="text-sm text-[#666]">Pre-market data unavailable.</p>;
  }

  const trendArrow = (slope: string) =>
    slope === "rising" ? "\u2191" : slope === "falling" ? "\u2193" : "\u2192";

  const indexFutures = futures.filter((f) => INDEX_FUTURES.has(f.symbol));
  const commodities = futures.filter((f) => !INDEX_FUTURES.has(f.symbol));

  // Data timestamp from the most recent futures quote
  const latestTs = futures.reduce((max, f) => Math.max(max, f.timestamp), 0);

  return (
    <div className="space-y-3">
      {/* Bias Gauge */}
      {biasResult && (
        <div className="space-y-1.5">
          <div className="relative h-2.5 rounded-full bg-gradient-to-r from-red-600/40 via-yellow-500/40 to-green-600/40">
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full border-2 border-white/80 shadow-lg transition-all duration-500"
              style={{
                left: `${((biasResult.score + 10) / 20) * 100}%`,
                backgroundColor: biasResult.score >= 2 ? "#22c55e" : biasResult.score <= -2 ? "#ef4444" : "#eab308",
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-[#555]">
            <span>-10</span>
            <span>0</span>
            <span>+10</span>
          </div>
          <p className="text-xs text-[#999] mt-1">{generateBiasSummary(biasResult)}</p>
        </div>
      )}

      {/* Index Futures */}
      <FuturesRow items={indexFutures} label="Index" />
      {indexFutures.length > 0 && (
        <p className="text-[10px] text-[#555] ml-12">S&amp;P 500, Nasdaq, Russell 2000 futures — shows overnight market direction</p>
      )}

      {/* Commodities */}
      <FuturesRow items={commodities} label="Cmdty" />
      {commodities.length > 0 && (
        <p className="text-[10px] text-[#555] ml-12">Oil (economic activity) and gold (safety demand) — context for risk appetite</p>
      )}

      {/* Macro indicators: VIX, 10Y, DXY, Regime Confidence */}
      {regime && (<>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span className="text-[10px] text-[#555] font-medium uppercase tracking-wider w-12 shrink-0">Macro</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[#888]">VIX</span>
            <span className={`font-medium ${regime.vix < 15 ? "text-green-400" : regime.vix > 25 ? "text-red-400" : "text-[#ccc]"}`}>
              {regime.vix.toFixed(1)}
            </span>
            <span className="text-[#666]">{trendArrow(regime.vixSlope)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#888]">10Y</span>
            <span className="text-[#ccc] font-medium">{regime.yield10y.toFixed(2)}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#888]">DXY</span>
            <span className="text-[#ccc] font-medium">{regime.dxy.toFixed(1)}</span>
            <span className="text-[#666]">{trendArrow(regime.dxyTrend)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#888]">Confidence</span>
            <span className={`font-medium ${regime.regimeConfidence >= 70 ? "text-green-400" : regime.regimeConfidence >= 50 ? "text-[#ccc]" : "text-amber-400"}`}>
              {regime.regimeConfidence}%
            </span>
          </div>
        </div>
        <p className="text-[10px] text-[#555] ml-12">{"VIX = fear gauge (< 15 calm, > 25 stressed) · 10Y = bond yields · DXY = US dollar strength"}</p>
      </>)}

      {/* Sub-Sector Rotation */}
      {subSectorScores.length > 0 && (<>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-[10px] text-[#555] font-medium uppercase tracking-wider w-12 shrink-0">Rotatn</span>
          {subSectorScores.map((s) => {
            const qColor = s.quadrant === "LEADING" ? "bg-green-500/20 text-green-400 border-green-500/30"
              : s.quadrant === "IMPROVING" ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
              : s.quadrant === "WEAKENING" ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
              : s.quadrant === "LAGGING" ? "bg-red-500/20 text-red-400 border-red-500/30"
              : "bg-[#222] text-[#888] border-[#333]";
            return (
              <span key={s.etf} className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${qColor}`}>
                {s.etf}
              </span>
            );
          })}
        </div>
        <p className="text-[10px] text-[#555] ml-12">Sub-sector quadrants — leading indicators that move before broad GICS sectors. Divergence from parent = early rotation signal.</p>
      </>)}

      {/* Data timestamp */}
      {latestTs > 0 && (
        <p className="text-[10px] text-[#444]">
          As of {new Date(latestTs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" })}
        </p>
      )}
    </div>
  );
}

function TierTable({ label, sectors, labelColor, subSectorScores }: { label: string; sectors: SectorRotationScore[]; labelColor: string; subSectorScores: SectorRotationScore[] }) {
  // Build lookup: parent ETF → matching sub-sector scores
  const childrenByParent = new Map<string, SectorRotationScore[]>();
  for (const sub of subSectorScores) {
    const parent = SUB_SECTOR_PARENT[sub.etf];
    if (!parent) continue;
    const list = childrenByParent.get(parent) ?? [];
    list.push(sub);
    childrenByParent.set(parent, list);
  }

  if (sectors.length === 0) {
    return (
      <div>
        <h3 className={`text-sm font-semibold ${labelColor} mb-1`}>{label}</h3>
        <p className="text-xs text-[#666]">None</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className={`text-sm font-semibold ${labelColor} mb-2`}>{label} ({sectors.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[#666]">
              <th className="pb-1.5 pr-3">Sector</th>
              <th className="pb-1.5 pr-3">ETF</th>
              <th className="pb-1.5 pr-3">Quadrant</th>
              <th className="pb-1.5 pr-3 text-right">Composite</th>
              <th className="pb-1.5 pr-3 text-right">Accel</th>
              <th className="pb-1.5 pr-3 text-right">CMF</th>
              <th className="pb-1.5 pr-3 text-right">Breadth</th>
              <th className="pb-1.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => {
              const children = childrenByParent.get(s.etf) ?? [];
              return (
                <Fragment key={s.etf}>
                  <tr className="border-t border-[#1a1a1a]">
                    <td className="py-1.5 pr-3 text-white font-medium">{s.sector}</td>
                    <td className="py-1.5 pr-3 text-[#888]">{s.etf}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${quadrantColor(s.quadrant)}`}>
                        {s.quadrant}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right text-[#ccc]">{s.compositeScore}</td>
                    <td className={`py-1.5 pr-3 text-right ${s.acceleration > 0 ? "text-green-400" : s.acceleration < 0 ? "text-red-400" : "text-[#666]"}`}>
                      {s.acceleration > 0 ? "+" : ""}{s.acceleration.toFixed(2)}
                    </td>
                    <td className={`py-1.5 pr-3 text-right ${s.cmf20 > 0 ? "text-green-400" : s.cmf20 < 0 ? "text-red-400" : "text-[#666]"}`}>
                      {s.cmf20.toFixed(3)}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-[#ccc]">
                      {s.breadthPct != null ? `${s.breadthPct.toFixed(0)}%` : "\u2014"}
                    </td>
                    <td className="py-1.5">
                      <TradingActionBadge sector={s} />
                    </td>
                  </tr>
                  {children.map((c) => {
                    const diverging = s.quadrant !== c.quadrant;
                    return (
                      <tr key={c.etf} className="border-t border-[#111]">
                        <td className="py-1 pr-3 pl-4 text-[#999] text-[11px]">
                          <span className="text-[#444] mr-1">{"\u2514"}</span>{c.sector}
                        </td>
                        <td className="py-1 pr-3 text-[#666] text-[11px]">{c.etf}</td>
                        <td className="py-1 pr-3">
                          <span className={`inline-flex rounded-full border px-1.5 py-0 text-[9px] font-medium ${quadrantColor(c.quadrant)}`}>
                            {c.quadrant}
                          </span>
                          {diverging && (
                            <span className="ml-1 text-[9px] text-amber-400" title={subSectorDivergenceTooltip(c.etf)}>!</span>
                          )}
                        </td>
                        <td className="py-1 pr-3 text-right text-[#888] text-[11px]">{c.compositeScore}</td>
                        <td className={`py-1 pr-3 text-right text-[11px] ${c.acceleration > 0 ? "text-green-400" : c.acceleration < 0 ? "text-red-400" : "text-[#666]"}`}>
                          {c.acceleration > 0 ? "+" : ""}{c.acceleration.toFixed(2)}
                        </td>
                        <td className="py-1 pr-3" colSpan={2} />
                        <td className="py-1" />
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── What Changed Panel ──

const TRANSITION_LABELS: Record<string, { label: string; color: string }> = {
  rotation_starting: { label: "Rotation Starting", color: "text-green-400" },
  breakout_confirmed: { label: "Breakout Confirmed", color: "text-green-400" },
  momentum_fading: { label: "Momentum Fading", color: "text-amber-400" },
  rotation_out: { label: "Rotation Out", color: "text-red-400" },
  other: { label: "Quadrant Shift", color: "text-[#ccc]" },
};

function WhatChangedPanel({ whatChanged }: { whatChanged: WhatChangedResult }) {
  if (whatChanged.noHistory) {
    return (
      <p className="text-sm text-[#666]">
        History builds automatically. Check back tomorrow for daily changes.
      </p>
    );
  }

  const totalChanges =
    (whatChanged.postureChange ? 1 : 0) +
    whatChanged.quadrantTransitions.length +
    whatChanged.tierChanges.length +
    Math.min(whatChanged.scoreMovers.length, 3) +
    whatChanged.trendFlips.length +
    (whatChanged.dispersionChange ? 1 : 0);

  if (totalChanges === 0) {
    return (
      <p className="text-sm text-[#666]">No meaningful changes since last snapshot.</p>
    );
  }

  // Group quadrant transitions by category
  const transitionsByCategory = new Map<string, WhatChangedResult["quadrantTransitions"]>();
  for (const t of whatChanged.quadrantTransitions) {
    const list = transitionsByCategory.get(t.category) ?? [];
    list.push(t);
    transitionsByCategory.set(t.category, list);
  }

  return (
    <div className="space-y-3">
      {/* Posture shift */}
      {whatChanged.postureChange && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-1">Market Posture</div>
          <div className="flex items-center gap-2 text-sm">
            <span className={POSTURE_STYLES[whatChanged.postureChange.from].text + " font-medium"}>
              {whatChanged.postureChange.from}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-[#666]" />
            <span className={POSTURE_STYLES[whatChanged.postureChange.to].text + " font-medium"}>
              {whatChanged.postureChange.to}
            </span>
          </div>
        </div>
      )}

      {/* Quadrant transitions */}
      {whatChanged.quadrantTransitions.length > 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-2">Quadrant Transitions</div>
          <div className="space-y-1.5">
            {Array.from(transitionsByCategory.entries()).map(([category, transitions]) => {
              const style = TRANSITION_LABELS[category];
              return transitions.map((t) => (
                <div key={t.etf} className="flex items-center gap-2 text-xs">
                  <span className={`font-medium ${style.color}`}>{style.label}</span>
                  <span className="text-[#666]">&mdash;</span>
                  <span className="text-white">{t.sector}</span>
                  <span className="text-[#666]">({t.etf})</span>
                  <span className={quadrantColor(t.from) + " rounded-full border px-1.5 py-0 text-[9px]"}>{t.from}</span>
                  <ArrowRight className="h-3 w-3 text-[#555]" />
                  <span className={quadrantColor(t.to) + " rounded-full border px-1.5 py-0 text-[9px]"}>{t.to}</span>
                </div>
              ));
            })}
          </div>
        </div>
      )}

      {/* Tier changes */}
      {whatChanged.tierChanges.length > 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-2">Tier Changes</div>
          <div className="space-y-1">
            {whatChanged.tierChanges.map((tc) => {
              const promoted = TIER_RANK[tc.to] < TIER_RANK[tc.from];
              return (
                <div key={tc.etf} className="flex items-center gap-2 text-xs">
                  {promoted ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
                  )}
                  <span className="text-white">{tc.sector}</span>
                  <span className={promoted ? "text-green-400" : "text-red-400"}>
                    {promoted ? "promoted to" : "demoted to"} {tc.to}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Score movers (top 3) */}
      {whatChanged.scoreMovers.length > 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-2">Biggest Score Movers</div>
          <div className="flex flex-wrap gap-3">
            {whatChanged.scoreMovers.slice(0, 3).map((sm) => (
              <div key={sm.etf} className="text-xs">
                <span className="text-white">{sm.sector}</span>{" "}
                <span className={sm.delta > 0 ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                  {sm.delta > 0 ? "+" : ""}{sm.delta}
                </span>
                <span className="text-[#666]"> ({sm.from}&rarr;{sm.to})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend flips */}
      {whatChanged.trendFlips.length > 0 && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-2">Trend Flips</div>
          <div className="space-y-1">
            {whatChanged.trendFlips.map((tf) => (
              <div key={tf.etf} className="flex items-center gap-2 text-xs">
                <span className="text-white">{tf.sector}</span>
                <TrendArrow trend={tf.from} />
                <ArrowRight className="h-3 w-3 text-[#555]" />
                <TrendArrow trend={tf.to} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dispersion change */}
      {whatChanged.dispersionChange && (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
          <div className="text-xs text-[#888] mb-1">Dispersion Index</div>
          <div className="text-xs">
            <span className="text-[#ccc]">{whatChanged.dispersionChange.from.toFixed(1)}</span>
            <span className="text-[#666]"> &rarr; </span>
            <span className="text-white font-medium">{whatChanged.dispersionChange.to.toFixed(1)}</span>
            <span className={`ml-1 ${whatChanged.dispersionChange.to > whatChanged.dispersionChange.from ? "text-green-400" : "text-red-400"}`}>
              ({whatChanged.dispersionChange.to > whatChanged.dispersionChange.from ? "+" : ""}
              {(whatChanged.dispersionChange.to - whatChanged.dispersionChange.from).toFixed(1)})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const TIER_RANK: Record<string, number> = { actionable: 0, watch: 1, avoid: 2 };

function TrendArrow({ trend }: { trend: "UP" | "DOWN" | "FLAT" }) {
  if (trend === "UP") return <span className="text-green-400 font-medium">UP</span>;
  if (trend === "DOWN") return <span className="text-red-400 font-medium">DOWN</span>;
  return <span className="text-[#888] font-medium">FLAT</span>;
}

// ── Navigation Card ──

function NavCard({ href, title, description, stat }: { href: string; title: string; description: string; stat: string }) {
  return (
    <Link
      href={href}
      className="flex-1 rounded-xl border border-[#2a2a2a] bg-[#141414] p-4 hover:border-[#444] hover:bg-[#1a1a1a] transition-colors group"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <ArrowRight className="h-4 w-4 text-[#666] group-hover:text-white transition-colors" />
      </div>
      <p className="mt-1 text-[11px] text-[#666]">{description}</p>
      <p className="mt-2 text-xs text-cyan-400 font-medium">{stat}</p>
    </Link>
  );
}

// ── Policy Pulse Widget ──

interface PolicyPulseEvent {
  id: number;
  themeId: string;
  themeName: string;
  headline: string;
  publishedAt: string;
  impactScore: number;
  impactedTickers: string[];
}

function PolicyPulseWidget() {
  const [events, setEvents] = useState<PolicyPulseEvent[]>([]);
  const [widgetLoading, setWidgetLoading] = useState(true);

  useEffect(() => {
    fetch("/api/policy-pulse?days=2&minImpact=30")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PolicyPulseEvent[]) => setEvents(data.slice(0, 3)))
      .catch(() => setEvents([]))
      .finally(() => setWidgetLoading(false));
  }, []);

  if (widgetLoading) return null;
  if (events.length === 0) return null;

  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Policy Pulse</h2>
        <span className="text-[10px] text-[#888]">{events.length} recent</span>
      </div>

      <div className="space-y-2">
        {events.map((event) => {
          const badgeColor = event.impactScore >= 75
            ? "text-red-400 bg-red-500/10 border-red-500/30"
            : event.impactScore >= 50
              ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
              : "text-green-400 bg-green-500/10 border-green-500/30";

          const hoursAgo = Math.max(
            1,
            Math.floor(
              (Date.now() - new Date(event.publishedAt).getTime()) / 3_600_000,
            ),
          );
          const timeLabel = hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`;

          return (
            <div key={event.id} className="flex items-start gap-2">
              <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${badgeColor}`}>
                {event.impactScore}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-white truncate">{event.headline}</p>
                <p className="text-[10px] text-[#888]">
                  {event.themeName} · {event.impactedTickers.slice(0, 3).join(", ")} · {timeLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href="/policy-pulse"
        className="flex items-center justify-center gap-1 text-[10px] text-[#5ba3e6] hover:text-white transition-colors"
      >
        View All
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

// ── Guide Component ──

function BriefGuide() {
  return (
    <div className="space-y-6 pb-8">
      {/* Link to full guide */}
      <Link
        href="/sectors/guide"
        className="flex items-center justify-between rounded-lg border border-[#5ba3e6]/30 bg-[#5ba3e6]/5 px-4 py-3 text-sm text-[#5ba3e6] hover:bg-[#5ba3e6]/10 transition-colors"
      >
        <span>Looking for the full Sector Rotation guide? It covers all pages, not just the Brief.</span>
        <ArrowRight className="h-4 w-4 shrink-0 ml-2" />
      </Link>

      {/* Overview */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-5">
        <h2 className="text-lg font-bold text-white mb-3">What is the Daily Brief?</h2>
        <p className="text-sm text-[#ccc] leading-relaxed">
          The Daily Brief is a <strong className="text-white">60-second morning check</strong> that synthesizes
          sector rotation data into five focused panels with zero overlap. Other pages have the raw data and deep
          dives &mdash; the Brief answers one question: <strong className="text-white">&quot;What changed and what should I do today?&quot;</strong>
        </p>
        <p className="mt-3 text-sm text-[#ccc] leading-relaxed">
          All analysis is <strong className="text-cyan-400">100% rule-based</strong> &mdash; deterministic formulas with
          no AI interpretation. The same inputs always produce the same outputs.
        </p>
      </div>

      {/* How it differs */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-5">
        <h2 className="text-lg font-bold text-white mb-3">How is this different from other pages?</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-[#666] border-b border-[#222]">
                <th className="pb-2 pr-4">Page</th>
                <th className="pb-2 pr-4">Shows you</th>
                <th className="pb-2">Analogy</th>
              </tr>
            </thead>
            <tbody className="text-[#ccc]">
              <tr className="border-b border-[#1a1a1a]">
                <td className="py-2.5 pr-4 text-white font-medium">Sectors Dashboard</td>
                <td className="py-2.5 pr-4">Raw data &mdash; 27 ETF scores (14 sectors + 8 sub-sectors + 5 cross-asset), quadrants, RRG chart, regime, correlations</td>
                <td className="py-2.5 text-[#888]">The spreadsheet</td>
              </tr>
              <tr className="border-b border-[#1a1a1a]">
                <td className="py-2.5 pr-4 text-white font-medium">Stock Picks</td>
                <td className="py-2.5 pr-4">Multi-factor stock scanner with filters, sector grouping, entry signals, pullback watch</td>
                <td className="py-2.5 text-[#888]">The stock screener</td>
              </tr>
              <tr className="border-b border-[#1a1a1a]">
                <td className="py-2.5 pr-4 text-white font-medium">Rotation Tracker</td>
                <td className="py-2.5 pr-4">Event timeline &mdash; when rotations started/ended, sparklines, projections, exit warnings</td>
                <td className="py-2.5 text-[#888]">The activity log</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-white font-medium">Daily Brief</td>
                <td className="py-2.5 pr-4">Synthesized opinion &mdash; posture, daily changes, risk flags, sector tiers, macro calendar</td>
                <td className="py-2.5 text-[#888]">The analyst note</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section-by-section breakdown */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-5">
        <h2 className="text-lg font-bold text-white mb-4">Section-by-Section Guide</h2>
        <div className="space-y-5">

          {/* Pre-Market Pulse */}
          <GuideSection
            title="Pre-Market Pulse"
            color="text-cyan-400"
            description="Macro context for the session ahead. Combines index futures, VIX, 10Y yield, USD index, and NYSE internals into a single bias score from -10 (bear) to +10 (bull)."
            details={[
              { label: "Futures", desc: "ES, NQ, RTY — pre-market price and percent change. Green/red coloring based on direction." },
              { label: "Macro", desc: "VIX level and slope, 10-Year yield, Dollar Index (DXY) trend. These drive the regime classification." },
              { label: "Internals", desc: "NYSE TICK, TRIN (Arms Index), Advance-Decline line. Available during market hours only." },
              { label: "Bias Score", desc: "Weighted composite: posture, regime, VIX level, futures direction, and internals readings." },
            ]}
            unique="Consolidates futures + macro + internals into the Brief. Previously required checking multiple external sources."
          />

          {/* Market Posture */}
          <GuideSection
            title="Market Posture"
            color="text-green-400"
            description="A single-word classification of overall market positioning. Combines regime, VIX, active rotation conviction, and sector dispersion."
            details={[
              { label: "AGGRESSIVE", desc: "Risk-on regime + 2+ high/moderate-conviction rotations + elevated dispersion. Lean into strongest sectors with full sizing." },
              { label: "SELECTIVE", desc: "Risk-on/mixed regime with some rotation activity. Opportunities exist but be disciplined." },
              { label: "DEFENSIVE", desc: "Risk-off regime OR VIX rising with majority sectors weakening. Reduce equity exposure." },
              { label: "CASH", desc: "Risk-off + VIX above 30 + zero positive-conviction rotations. Capital preservation is the priority." },
            ]}
            unique="This classification doesn't exist on any other page. The dashboard shows regime but doesn't translate it into a positioning recommendation."
          />

          {/* What Changed Today */}
          <GuideSection
            title="What Changed Today"
            color="text-cyan-400"
            description="Compares today's data against the most recent previous snapshot stored in your browser. Surfaces the most important daily changes."
            details={[
              { label: "Posture shifts", desc: "If the overall market posture changed (e.g., SELECTIVE to DEFENSIVE), this is the first thing you see." },
              { label: "Quadrant transitions", desc: "Sectors that moved between RRG quadrants, categorized: Rotation Starting, Breakout Confirmed, Momentum Fading, Rotation Out." },
              { label: "Tier changes", desc: "Sectors promoted or demoted between Actionable, Watch, and Avoid tiers." },
              { label: "Score movers", desc: "Sectors with composite score changes > 3 points. Shows the biggest movers first." },
              { label: "Trend flips", desc: "Sectors whose trend direction changed (UP/DOWN/FLAT)." },
              { label: "Dispersion", desc: "Flagged when the dispersion index changes by more than 2 points." },
            ]}
            unique="Entirely unique to the Brief. No other page compares today vs. yesterday. History builds automatically from daily visits."
          />

          {/* Risk Flags */}
          <GuideSection
            title="Risk Flags"
            color="text-red-400"
            description="Automated detection of 10 different risk conditions that require attention."
            details={[
              { label: "Leading + Negative Accel", desc: "A sector in LEADING quadrant is losing momentum. May soon transition to WEAKENING." },
              { label: "Declining Signals", desc: "An active rotation's signal count is dropping. Conviction is fading." },
              { label: "VIX Rising", desc: "Implied volatility is increasing. Market uncertainty growing." },
              { label: "Low Data Quality", desc: "A sector has < 50% of its composite factors backed by real data." },
              { label: "False Start", desc: "A recently ended rotation lasted < 5 days. Likely not a real rotation." },
              { label: "Correlation Breakdown", desc: "Cross-sector correlations have broken down. Unusual stress or regime change." },
              { label: "Panic Rotation", desc: "High dispersion + risk-off regime. Panic selling in cyclicals." },
              { label: "Narrow Leadership", desc: "Leadership health score is low or mega-caps dominating — rally breadth too narrow." },
              { label: "Momentum Rollover", desc: "A LEADING sector has high rotation velocity but negative acceleration — may be rapidly exiting." },
              { label: "Cross-Asset Risk-Off", desc: "Gold (GLD) and/or Treasuries (TLT) accelerating — money may be leaving equities for safe havens." },
            ]}
            unique="Nowhere else surfaces these as alerts. You'd have to manually cross-reference multiple panels on the dashboard."
          />

          {/* Sector Tiers */}
          <GuideSection
            title="Sector Tiers"
            color="text-green-400"
            description="All 14 sectors classified into three actionability tiers based on composite score, quadrant, and acceleration."
            details={[
              { label: "Actionable", desc: "TRADE/BUILD/WATCH action + composite >= 60 + LEADING or IMPROVING (with positive acceleration) quadrant. OR: active rotation with HIGH/MODERATE conviction + favorable quadrant." },
              { label: "Watch", desc: "Meets some criteria but not all. Monitor for promotion." },
              { label: "Avoid", desc: "TRIM or AVOID action. Weakening or lagging with poor metrics." },
            ]}
            unique="The dashboard shows all 14 sectors equally. The Brief pre-classifies them so you don't have to mentally filter."
          />

          {/* Upcoming Events */}
          <GuideSection
            title="Upcoming Events"
            color="text-cyan-400"
            description="Macro catalysts (FOMC, CPI, Jobs, OPEX, rebalances) in the next 7 days."
            details={[
              { label: "Why it matters", desc: "Major macro events cause regime shifts. Knowing FOMC is in 2 days helps you avoid opening new positions into volatility." },
              { label: "Data source", desc: "Pulled from the catalyst calendar API, filtered to macro-only events." },
            ]}
            unique="Not available on any other page in the sector rotation suite."
          />
        </div>
      </div>

      {/* Data flow */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-5">
        <h2 className="text-lg font-bold text-white mb-3">Data Flow</h2>
        <div className="text-sm text-[#ccc] space-y-2">
          <p><span className="text-white font-medium">Source:</span> Same real-time data as the Sectors Dashboard &mdash; fetched via <code className="text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded text-cyan-400">useSectorData()</code> hook with 10-minute auto-refresh.</p>
          <p><span className="text-white font-medium">Analysis layer:</span> Pure deterministic functions in <code className="text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded text-cyan-400">brief.ts</code> &mdash; no AI, no randomness.</p>
          <p><span className="text-white font-medium">What Changed:</span> Compares live data against the most recent previous snapshot in <code className="text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded text-cyan-400">localStorage</code>. History accumulates automatically from daily dashboard visits.</p>
          <p><span className="text-white font-medium">Macro events:</span> Fetched from <code className="text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded text-cyan-400">/api/macro-events</code> endpoint (1-hour cache).</p>
        </div>
      </div>

      {/* How to use */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-5">
        <h2 className="text-lg font-bold text-white mb-3">How to Use This Page</h2>
        <ol className="text-sm text-[#ccc] space-y-2 list-decimal list-inside">
          <li><strong className="text-white">Scan pre-market pulse.</strong> Check bias score, futures direction, VIX, and macro indicators for session context.</li>
          <li><strong className="text-white">Check posture.</strong> If DEFENSIVE or CASH, reduce exposure regardless of individual sector strength.</li>
          <li><strong className="text-white">Review what changed.</strong> Posture shifts and quadrant transitions are the highest-signal changes. Act on these first.</li>
          <li><strong className="text-white">Scan risk flags.</strong> Red flags override green signals. Address risks before adding positions.</li>
          <li><strong className="text-white">Check sector tiers.</strong> Actionable sectors are your candidates. Then drill into the full dashboard or picks page.</li>
          <li><strong className="text-white">Review upcoming events.</strong> Avoid opening new positions into FOMC/CPI within 1-2 days.</li>
        </ol>
      </div>
    </div>
  );
}

function GuideSection({ title, color, description, details, unique }: {
  title: string;
  color: string;
  description: string;
  details: { label: string; desc: string }[];
  unique: string;
}) {
  return (
    <div className="border-l-2 border-[#333] pl-4">
      <h3 className={`text-sm font-bold ${color}`}>{title}</h3>
      <p className="mt-1 text-xs text-[#ccc] leading-relaxed">{description}</p>
      <div className="mt-2 space-y-1.5">
        {details.map((d) => (
          <div key={d.label} className="text-xs">
            <span className="text-white font-medium">{d.label}:</span>{" "}
            <span className="text-[#999]">{d.desc}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-[#666] italic">Unique to Brief: {unique}</p>
    </div>
  );
}
