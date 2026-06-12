"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, RefreshCw, AlertTriangle, TrendingUp, Shield, Banknote, Crosshair, BookOpen, ArrowRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
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
import { loadHistory } from "@/lib/sector-rotation/history";
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

  // Fetch macro events
  useEffect(() => {
    fetch("/api/macro-events")
      .then((res) => (res.ok ? res.json() : []))
      .then((events: CatalystCalendarEvent[]) => setMacroEvents(events))
      .catch(() => setMacroEvents([]))
      .finally(() => setMacroLoading(false));
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
    // Find most recent snapshot that ISN'T today
    return history.find((s) => s.date !== today) ?? null;
  }, []);

  // Load yesterday's posture from localStorage
  const previousPosture = useMemo(() => loadPreviousPosture(), []);

  // Compute what changed
  const whatChanged = useMemo<WhatChangedResult | null>(
    () =>
      data && posture
        ? computeWhatChanged(data, posture.posture, previousSnapshot, previousPosture)
        : null,
    [data, posture, previousSnapshot, previousPosture]
  );

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
            <TierTable label="Actionable" sectors={tiers.actionable} labelColor="text-green-400" />
            <TierTable label="Watch" sectors={tiers.watch} labelColor="text-amber-400" />
            <TierTable label="Avoid" sectors={tiers.avoid} labelColor="text-red-400" />
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

function TierTable({ label, sectors, labelColor }: { label: string; sectors: SectorRotationScore[]; labelColor: string }) {
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
            {sectors.map((s) => (
              <tr key={s.etf} className="border-t border-[#1a1a1a]">
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
            ))}
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
                <td className="py-2.5 pr-4">Raw data &mdash; 26 ETF scores (14 sectors + 7 sub-sectors + 5 cross-asset), quadrants, RRG chart, regime, correlations</td>
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
            description="Automated detection of 7 different risk conditions that require attention."
            details={[
              { label: "Leading + Negative Accel", desc: "A sector in LEADING quadrant is losing momentum. May soon transition to WEAKENING." },
              { label: "Declining Signals", desc: "An active rotation's signal count is dropping. Conviction is fading." },
              { label: "VIX Rising", desc: "Implied volatility is increasing. Market uncertainty growing." },
              { label: "Low Data Quality", desc: "A sector has < 50% of its composite factors backed by real data." },
              { label: "False Start", desc: "A recently ended rotation lasted < 5 days. Likely not a real rotation." },
              { label: "Correlation Breakdown", desc: "Cross-sector correlations have broken down. Unusual stress or regime change." },
              { label: "Panic Rotation", desc: "High dispersion + risk-off regime. Panic selling in cyclicals." },
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
          <li><strong className="text-white">Check posture first.</strong> If DEFENSIVE or CASH, reduce exposure regardless of individual sector strength.</li>
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
