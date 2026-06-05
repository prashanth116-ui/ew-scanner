"use client";

import { useState, useEffect, useMemo } from "react";
import { RefreshCw, ArrowLeft, AlertTriangle, TrendingUp, Shield, Banknote, Crosshair, BookOpen } from "lucide-react";
import Link from "next/link";
import { DataAgeBadge } from "@/components/data-age-badge";
import { useSectorData } from "../_use-sector-data";
import {
  CollapsiblePanel,
  useCollapsedPanels,
  RegimeBanner,
  TradingActionBadge,
  quadrantColor,
  CONVICTION_STYLE,
  CATEGORY_STYLE,
} from "../_components";
import { phaseBadge } from "@/lib/phase-utils";
import type { CatalystCalendarEvent } from "@/lib/catalyst/types";
import type { SectorRotationScore, EnrichedStock } from "@/lib/sector-rotation/types";
import type { LifecycleStage } from "@/lib/sector-rotation/rotation-types";
import {
  computeMarketPosture,
  computeSectorTiers,
  computeRiskFlags,
  computeLeadingIndicators,
  computeRotationSummaries,
  type MarketPosture,
  type PostureResult,
  type RiskFlag,
  type LeadingIndicator,
  type RotationSummary,
  type SectorTiers,
} from "@/lib/sector-rotation/brief";

// ── Posture color mapping ──

const POSTURE_STYLES: Record<MarketPosture, { bg: string; border: string; text: string; icon: typeof TrendingUp }> = {
  AGGRESSIVE: { bg: "bg-green-500/10", border: "border-green-500/40", text: "text-green-400", icon: TrendingUp },
  SELECTIVE: { bg: "bg-cyan-500/10", border: "border-cyan-500/40", text: "text-cyan-400", icon: Crosshair },
  DEFENSIVE: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-400", icon: Shield },
  CASH: { bg: "bg-red-500/10", border: "border-red-500/40", text: "text-red-400", icon: Banknote },
};

// ── Lifecycle badge styling ──

const LIFECYCLE_STYLE: Record<LifecycleStage, { bg: string; text: string }> = {
  EARLY: { bg: "bg-green-500/15", text: "text-green-400" },
  MATURING: { bg: "bg-cyan-500/15", text: "text-cyan-400" },
  LATE: { bg: "bg-amber-500/15", text: "text-amber-400" },
  EXHAUSTING: { bg: "bg-red-500/15", text: "text-red-400" },
};

type TabView = "brief" | "guide";

export default function DailyBriefPage() {
  const { data, loading, error, fetchData, rotationData } = useSectorData();
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

  const leadingIndicators = useMemo<LeadingIndicator[]>(
    () => (data ? computeLeadingIndicators(data.sectors) : []),
    [data]
  );

  const rotationSummaries = useMemo<RotationSummary[]>(
    () => computeRotationSummaries(rotationData, data?.regime),
    [rotationData, data?.regime]
  );

  // Loading state
  if (loading && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="flex items-center justify-center gap-3 text-[#888]">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading sector data...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-2 text-red-400">{error}</p>
          <button onClick={() => fetchData(true)} className="mt-4 rounded-lg bg-[#222] px-4 py-2 text-sm text-white hover:bg-[#333]">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const upcomingEvents = macroEvents.filter((e) => e.daysAway <= 7);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/sectors" className="rounded-lg border border-[#333] p-2 text-[#888] hover:bg-[#1a1a1a] hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Daily Market Brief</h1>
            <p className="text-xs text-[#666]">Rule-based synthesis of sector rotation data</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DataAgeBadge calculatedAt={data.calculatedAt} />
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

      {/* Market Posture Banner */}
      {posture && <PostureBanner posture={posture} />}

      {/* Upcoming Events */}
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
                      <span className="rounded-full bg-[#222] border border-[#333] px-2 py-0.5 text-[10px] text-[#888] uppercase">{e.type.replace("_", " ")}</span>
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

      {/* Regime Overview */}
      <CollapsiblePanel
        id="regime"
        title="Regime Overview"
        collapsed={collapsed.has("regime")}
        onToggle={toggle}
      >
        <div className="space-y-3">
          <RegimeBanner regime={data.regime} />
          {data.crossSectorPairs && (
            <div className="flex flex-wrap gap-4 pt-2">
              <div className="text-sm">
                <span className="text-xs text-[#888]">XLY/XLP</span>
                <div className="text-[#ccc]">{data.crossSectorPairs.xlyXlp.ratio.toFixed(3)} <span className="text-[10px] text-[#666]">{data.crossSectorPairs.xlyXlp.trend}</span></div>
              </div>
              <div className="text-sm">
                <span className="text-xs text-[#888]">XLK/XLU</span>
                <div className="text-[#ccc]">{data.crossSectorPairs.xlkXlu.ratio.toFixed(3)} <span className="text-[10px] text-[#666]">{data.crossSectorPairs.xlkXlu.trend}</span></div>
              </div>
              <div className="text-sm">
                <span className="text-xs text-[#888]">Dispersion</span>
                <div className="text-[#ccc]">{data.dispersionIndex.toFixed(1)}</div>
              </div>
              <div className="text-sm">
                <span className="text-xs text-[#888]">Sector Spread</span>
                <div className="text-[#ccc]">{data.sectorSpread.toFixed(1)}%</div>
              </div>
            </div>
          )}
        </div>
      </CollapsiblePanel>

      {/* Sector Tiers */}
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

      {/* Active Rotations */}
      <CollapsiblePanel
        id="rotations"
        title="Active Rotations"
        collapsed={collapsed.has("rotations")}
        onToggle={toggle}
        badge={
          <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">
            {rotationSummaries.length} active
          </span>
        }
      >
        {rotationSummaries.length === 0 ? (
          <p className="text-sm text-[#666]">No active rotations detected.</p>
        ) : (
          <div className="space-y-3">
            {rotationSummaries.map((r) => (
              <RotationCard key={r.event.sectorId} summary={r} />
            ))}
          </div>
        )}
      </CollapsiblePanel>

      {/* Leading Indicators */}
      <CollapsiblePanel
        id="leading"
        title="Leading Indicators"
        collapsed={collapsed.has("leading")}
        onToggle={toggle}
        badge={
          <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">
            {leadingIndicators.length} sectors
          </span>
        }
      >
        {leadingIndicators.length === 0 ? (
          <p className="text-sm text-[#666]">No early rotation signals detected.</p>
        ) : (
          <div className="space-y-2">
            {leadingIndicators.map((li) => (
              <div key={li.etf} className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{li.sector}</span>
                  <span className="text-xs text-[#666]">{li.etf}</span>
                  <span className="rounded-full bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 text-[10px] text-purple-400">
                    {li.signals.length} signal{li.signals.length > 1 ? "s" : ""}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {li.signals.map((s, i) => (
                    <li key={i} className="text-xs text-[#999]">• {s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CollapsiblePanel>

      {/* Stock Picks */}
      {data.enrichedStocks && (
        <CollapsiblePanel
          id="picks"
          title="Stock Picks"
          collapsed={collapsed.has("picks")}
          onToggle={toggle}
          badge={
            <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">
              {data.enrichedStocks.passed.length} stocks
            </span>
          }
        >
          <StockPicksSection stocks={data.enrichedStocks.passed} pullbacks={data.enrichedStocks.pullbackWatch} />
        </CollapsiblePanel>
      )}

      {/* Risk Flags */}
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

      {/* Recently Ended Rotations */}
      {rotationData && rotationData.recentlyEndedRotations.length > 0 && (
        <CollapsiblePanel
          id="ended"
          title="Recently Ended Rotations"
          collapsed={collapsed.has("ended")}
          onToggle={toggle}
          badge={
            <span className="rounded-full bg-[#222] px-2 py-0.5 text-[10px] text-[#888]">
              {rotationData.recentlyEndedRotations.length}
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-[#666]">
                  <th className="pb-2 pr-4">Sector</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2 pr-4">Performance</th>
                  <th className="pb-2">End Date</th>
                </tr>
              </thead>
              <tbody>
                {rotationData.recentlyEndedRotations.map((e) => (
                  <tr key={`${e.sectorId}-${e.startDate}`} className="border-t border-[#222]">
                    <td className="py-1.5 pr-4 text-white">{e.sectorName}</td>
                    <td className={`py-1.5 pr-4 ${e.daysActive < 5 ? "text-red-400" : "text-[#ccc]"}`}>
                      {e.daysActive}d{e.daysActive < 5 ? " (false start)" : ""}
                    </td>
                    <td className={`py-1.5 pr-4 font-medium ${e.etfPerformancePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {e.etfPerformancePct >= 0 ? "+" : ""}{e.etfPerformancePct.toFixed(1)}%
                    </td>
                    <td className="py-1.5 text-[#999]">{e.endDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsiblePanel>
      )}

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
                  {s.breadthPct != null ? `${s.breadthPct.toFixed(0)}%` : "—"}
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

function RotationCard({ summary }: { summary: RotationSummary }) {
  const { event, lifecycle, conviction, actionSignal, topStocks } = summary;
  const lcStyle = LIFECYCLE_STYLE[lifecycle];

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-white">{event.sectorName}</span>
        <span className="text-xs text-[#666]">{event.etf}</span>
        <span className="text-xs text-[#888]">{event.daysActive}d active</span>
        <span className={`text-xs font-medium ${event.etfPerformancePct >= 0 ? "text-green-400" : "text-red-400"}`}>
          {event.etfPerformancePct >= 0 ? "+" : ""}{event.etfPerformancePct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className={`inline-flex rounded-full border border-[#333] px-2 py-0.5 text-[10px] font-semibold ${lcStyle.bg} ${lcStyle.text}`}>
          {lifecycle}
        </span>
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
          conviction.level === "HIGH" ? "bg-green-500/10 border-green-500/30 text-green-400" :
          conviction.level === "MODERATE" ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" :
          conviction.level === "LOW" ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
          "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>
          {conviction.level}
        </span>
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${actionSignal.bgColor} ${actionSignal.borderColor} ${actionSignal.color}`}>
          {actionSignal.action}
        </span>
      </div>
      {topStocks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3">
          {topStocks.map((s) => (
            <span key={s.symbol} className="text-xs">
              <span className="text-[#ccc]">{s.symbol}</span>
              <span className={`ml-1 ${s.performancePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                {s.performancePct >= 0 ? "+" : ""}{s.performancePct.toFixed(1)}%
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StockPicksSection({ stocks, pullbacks }: { stocks: EnrichedStock[]; pullbacks: import("@/lib/sector-rotation/types").PullbackWatchStock[] }) {
  const highConviction = stocks.filter((s) => s.conviction === "HIGH");
  const medConviction = stocks.filter((s) => s.conviction === "MEDIUM");
  const nearEntry = pullbacks.filter((p) => p.tier === "NEAR_ENTRY");

  return (
    <div className="space-y-4">
      {highConviction.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-green-400 mb-2">HIGH Conviction ({highConviction.length})</h3>
          <StockTable stocks={highConviction} />
        </div>
      )}
      {medConviction.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-400 mb-2">MEDIUM Conviction ({medConviction.length})</h3>
          <StockTable stocks={medConviction} />
        </div>
      )}
      {nearEntry.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-cyan-400 mb-2">Pullback Watch — Near Entry ({nearEntry.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[#666]">
                  <th className="pb-1.5 pr-3">Symbol</th>
                  <th className="pb-1.5 pr-3">Sector</th>
                  <th className="pb-1.5 pr-3 text-right">Price</th>
                  <th className="pb-1.5 pr-3 text-right">% from 200MA</th>
                  <th className="pb-1.5 pr-3 text-right">% from 50MA</th>
                  <th className="pb-1.5 text-right">Vol Ratio</th>
                </tr>
              </thead>
              <tbody>
                {nearEntry.map((s) => (
                  <tr key={s.symbol} className="border-t border-[#1a1a1a]">
                    <td className="py-1.5 pr-3 text-white font-medium">{s.symbol}</td>
                    <td className="py-1.5 pr-3 text-[#888]">{s.sector}</td>
                    <td className="py-1.5 pr-3 text-right text-[#ccc]">${s.price.toFixed(2)}</td>
                    <td className="py-1.5 pr-3 text-right text-[#ccc]">{s.pctFrom200ma.toFixed(1)}%</td>
                    <td className="py-1.5 pr-3 text-right text-[#ccc]">{s.pctFrom50ma.toFixed(1)}%</td>
                    <td className={`py-1.5 text-right ${s.volRatio >= 1.5 ? "text-green-400" : "text-[#ccc]"}`}>{s.volRatio.toFixed(2)}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {highConviction.length === 0 && medConviction.length === 0 && nearEntry.length === 0 && (
        <p className="text-sm text-[#666]">No enriched stock data available.</p>
      )}
    </div>
  );
}

type StockSortKey = "symbol" | "sector" | "price" | "phase" | "category" | "rsAccel" | "volRatio";

function StockTable({ stocks }: { stocks: EnrichedStock[] }) {
  const [sortKey, setSortKey] = useState<StockSortKey>("rsAccel");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: StockSortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "symbol" || key === "sector" || key === "category");
    }
  };

  const sorted = useMemo(() => {
    const copy = [...stocks];
    const dir = sortAsc ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortKey) {
        case "symbol": return dir * a.symbol.localeCompare(b.symbol);
        case "sector": return dir * a.sector.localeCompare(b.sector);
        case "price": return dir * (a.price - b.price);
        case "phase": return dir * a.phase.localeCompare(b.phase);
        case "category": return dir * a.category.localeCompare(b.category);
        case "rsAccel": return dir * ((a.rsAccel ?? 0) - (b.rsAccel ?? 0));
        case "volRatio": return dir * (a.volRatio - b.volRatio);
        default: return 0;
      }
    });
    return copy;
  }, [stocks, sortKey, sortAsc]);

  const arrow = (key: StockSortKey) =>
    sortKey === key ? (sortAsc ? " \u25B2" : " \u25BC") : "";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-[#666]">
            <th className="pb-1.5 pr-3 cursor-pointer hover:text-white select-none" onClick={() => handleSort("symbol")}>Symbol{arrow("symbol")}</th>
            <th className="pb-1.5 pr-3 cursor-pointer hover:text-white select-none" onClick={() => handleSort("sector")}>Sector{arrow("sector")}</th>
            <th className="pb-1.5 pr-3 text-right cursor-pointer hover:text-white select-none" onClick={() => handleSort("price")}>Price{arrow("price")}</th>
            <th className="pb-1.5 pr-3 cursor-pointer hover:text-white select-none" onClick={() => handleSort("phase")}>Phase{arrow("phase")}</th>
            <th className="pb-1.5 pr-3 cursor-pointer hover:text-white select-none" onClick={() => handleSort("category")}>Category{arrow("category")}</th>
            <th className="pb-1.5 pr-3 text-right cursor-pointer hover:text-white select-none" onClick={() => handleSort("rsAccel")}>RS Accel{arrow("rsAccel")}</th>
            <th className="pb-1.5 text-right cursor-pointer hover:text-white select-none" onClick={() => handleSort("volRatio")}>Vol Ratio{arrow("volRatio")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const phase = phaseBadge(
              s.phase === "P1_BASING" ? "basing" :
              s.phase === "P2_TURNAROUND" ? "turnaround" :
              s.phase === "P3_TRENDING" ? "trending" :
              s.phase === "P4_EXHAUSTING" ? "exhausting" : "neutral"
            );
            return (
              <tr key={s.symbol} className="border-t border-[#1a1a1a]">
                <td className="py-1.5 pr-3 text-white font-medium">{s.symbol}</td>
                <td className="py-1.5 pr-3 text-[#888]">{s.sector}</td>
                <td className="py-1.5 pr-3 text-right text-[#ccc]">${s.price.toFixed(2)}</td>
                <td className="py-1.5 pr-3">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${phase.className}`}>{phase.label}</span>
                </td>
                <td className="py-1.5 pr-3">
                  <span className={`text-[10px] font-semibold ${CATEGORY_STYLE[s.category] ?? "text-[#666]"}`}>{s.category.replace("_", " ")}</span>
                </td>
                <td className={`py-1.5 pr-3 text-right ${(s.rsAccel ?? 0) > 0 ? "text-green-400" : (s.rsAccel ?? 0) < 0 ? "text-red-400" : "text-[#666]"}`}>
                  {s.rsAccel != null ? (s.rsAccel > 0 ? "+" : "") + s.rsAccel.toFixed(2) : "—"}
                </td>
                <td className={`py-1.5 text-right ${s.volRatio >= 1.5 ? "text-green-400" : "text-[#ccc]"}`}>{s.volRatio.toFixed(2)}x</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Guide Component ──

function BriefGuide() {
  return (
    <div className="space-y-6 pb-8">
      {/* Overview */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-5">
        <h2 className="text-lg font-bold text-white mb-3">What is the Daily Brief?</h2>
        <p className="text-sm text-[#ccc] leading-relaxed">
          The Daily Brief synthesizes raw sector rotation data into an opinionated, actionable summary. While the
          Sectors Dashboard shows you <em>all</em> the data and the Rotation Tracker shows <em>event history</em>,
          the Brief answers one question: <strong className="text-white">&quot;What should I do today?&quot;</strong>
        </p>
        <p className="mt-3 text-sm text-[#ccc] leading-relaxed">
          All analysis is <strong className="text-cyan-400">100% rule-based</strong> — deterministic formulas with
          no AI interpretation. The same inputs always produce the same outputs. You can trace every recommendation
          back to specific data points.
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
                <td className="py-2.5 pr-4">Raw data — 14 sector scores, quadrants, RRG chart, correlations, all enriched stocks</td>
                <td className="py-2.5 text-[#888]">The spreadsheet</td>
              </tr>
              <tr className="border-b border-[#1a1a1a]">
                <td className="py-2.5 pr-4 text-white font-medium">Rotation Tracker</td>
                <td className="py-2.5 pr-4">Event timeline — when rotations started/ended, signal count history, duration, performance</td>
                <td className="py-2.5 text-[#888]">The activity log</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-white font-medium">Daily Brief</td>
                <td className="py-2.5 pr-4">Synthesized opinion — posture, tiers, action signals, risk flags, leading indicators</td>
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
              { label: "AGGRESSIVE", desc: "Risk-on regime + 2+ high-conviction rotations + elevated dispersion. Lean into strongest sectors with full sizing." },
              { label: "SELECTIVE", desc: "Risk-on/mixed regime with some rotation activity. Opportunities exist but be disciplined — focus on highest-conviction setups only." },
              { label: "DEFENSIVE", desc: "Risk-off regime OR VIX rising with majority sectors weakening. Favor defensive sectors, reduce equity exposure." },
              { label: "CASH", desc: "Risk-off + VIX above 30 + zero positive-conviction rotations. Capital preservation is the priority." },
            ]}
            unique="This classification doesn't exist on any other page. The dashboard shows regime but doesn't translate it into a positioning recommendation."
          />

          {/* Upcoming Events */}
          <GuideSection
            title="Upcoming Events"
            color="text-cyan-400"
            description="Macro catalysts (FOMC, CPI, Jobs, GDP, etc.) in the next 7 days. Events within 1-2 days are highlighted in red/amber."
            details={[
              { label: "Why it matters", desc: "Major macro events cause regime shifts. Knowing FOMC is in 2 days helps you avoid opening new positions into volatility." },
              { label: "Data source", desc: "Pulled from the catalyst calendar API — same data that feeds the earnings calendar, filtered to macro-only events." },
            ]}
            unique="Not available on any other page in the sector rotation suite."
          />

          {/* Regime Overview */}
          <GuideSection
            title="Regime Overview"
            color="text-cyan-400"
            description="The current macro regime (RISK_ON / RISK_OFF / MIXED) plus cross-sector ratio pairs and dispersion metrics."
            details={[
              { label: "XLY/XLP ratio", desc: "Consumer Discretionary vs Staples. Rising = risk appetite. Falling = defensive rotation." },
              { label: "XLK/XLU ratio", desc: "Tech vs Utilities. Rising = growth favored. Falling = safety bid." },
              { label: "Dispersion Index", desc: "How spread apart sectors are. High dispersion = rotational opportunity. Low = correlated market." },
              { label: "Sector Spread", desc: "Difference between best and worst sector composite scores." },
            ]}
            unique="Same regime banner is on the dashboard, but the Brief adds cross-sector pairs and dispersion context in a compact layout."
          />

          {/* Sector Tiers */}
          <GuideSection
            title="Sector Tiers"
            color="text-green-400"
            description="All 14 sectors classified into three actionability tiers based on composite score, quadrant, and acceleration."
            details={[
              { label: "Actionable", desc: "TRADE/BUILD action + composite >= 60 + LEADING/IMPROVING quadrant. OR: active rotation with HIGH/MODERATE conviction + favorable quadrant (composite threshold waived)." },
              { label: "Watch", desc: "Meets some criteria but not all — either lower composite, WATCH action, or IMPROVING without positive acceleration. Monitor for promotion." },
              { label: "Avoid", desc: "TRIM or AVOID action. Weakening or lagging with poor metrics. Do not initiate new positions." },
            ]}
            unique="The dashboard shows all 14 sectors equally. The Brief pre-classifies them so you don't have to mentally filter."
          />

          {/* Active Rotations */}
          <GuideSection
            title="Active Rotations"
            color="text-cyan-400"
            description="Each active sector rotation with lifecycle, conviction, and an explicit action signal."
            details={[
              { label: "Lifecycle", desc: "EARLY (< 5 days, building), MATURING (5-15 days, established), LATE (15-30 days, may be peaking), EXHAUSTING (30+ days, likely near end)." },
              { label: "Conviction", desc: "HIGH (strong signals + volume), MODERATE (good signals), LOW (weak or mixed), EXIT (signals declining)." },
              { label: "Action Signal", desc: "ENTER (new position), ADD ON PULLBACK (existing position, wait for dip), HOLD-TIGHTEN (raise stops), EXIT (close position)." },
              { label: "Top Stocks", desc: "The 3 best-performing stocks within that rotating sector — candidates for individual stock positions." },
            ]}
            unique="The Rotation Tracker shows lifecycle/conviction separately. The Brief combines them with regime alignment to produce a specific action instruction."
          />

          {/* Leading Indicators */}
          <GuideSection
            title="Leading Indicators"
            color="text-purple-400"
            description="Sectors showing early signs of future rotation — before it shows up in the Rotation Tracker."
            details={[
              { label: "Stealth Accumulation", desc: "Smart money entering (volume + flow signals) while price hasn't broken out yet." },
              { label: "Flow-Price Divergence", desc: "Money flowing into the ETF (positive CMF) while price remains flat. Precedes breakout." },
              { label: "Acceleration Inflection", desc: "Acceleration (rate of change of momentum) is about to flip from negative to positive." },
              { label: "Breadth Divergence", desc: "Individual stocks within the sector are improving before the sector ETF itself. Internal strength building." },
              { label: "Lagging + Positive Accel", desc: "Sector is in LAGGING quadrant but momentum is turning positive. Classic early rotation signal." },
            ]}
            unique="Entirely unique to the Brief. The dashboard doesn't surface these predictive signals, and the Rotation Tracker only detects rotations after they've started."
          />

          {/* Stock Picks */}
          <GuideSection
            title="Stock Picks"
            color="text-green-400"
            description="Enriched stocks that passed the scanner's multi-factor filter, grouped by conviction level."
            details={[
              { label: "HIGH Conviction", desc: "Stocks with strong relative strength acceleration, favorable phase (P2/P3), volume confirmation, and sector alignment." },
              { label: "MEDIUM Conviction", desc: "Pass the filter but with fewer confirming factors. Good candidates on pullbacks." },
              { label: "Pullback Watch", desc: "Stocks in NEAR_ENTRY tier — they were strong, pulled back, and are approaching buy zones near their moving averages." },
              { label: "Key columns", desc: "Phase (basing/turnaround/trending/exhausting), RS Accel (relative strength acceleration vs SPY), Vol Ratio (current vs average volume)." },
            ]}
            unique="Same data as the dashboard's stock scanner, but pre-filtered and grouped by conviction instead of requiring you to sort/filter manually."
          />

          {/* Risk Flags */}
          <GuideSection
            title="Risk Flags"
            color="text-red-400"
            description="Automated detection of 7 different risk conditions that require attention."
            details={[
              { label: "Leading + Negative Accel", desc: "A sector in LEADING quadrant is losing momentum. May soon transition to WEAKENING — tighten stops." },
              { label: "Declining Signals", desc: "An active rotation's signal count is dropping over the last 3 data points. Conviction is fading." },
              { label: "VIX Rising", desc: "Implied volatility is increasing. Market uncertainty growing — reduce position sizes." },
              { label: "Low Data Quality", desc: "A sector has < 50% of its composite factors backed by real data. Signals may be unreliable." },
              { label: "False Start", desc: "A recently ended rotation lasted < 5 days. Likely wasn't a real rotation — be cautious of the next signal from that sector." },
              { label: "Correlation Breakdown", desc: "Cross-sector correlations have broken down. Unusual stress or regime change in progress." },
              { label: "Panic Rotation", desc: "High dispersion + risk-off regime. Sector divergence suggests panic selling in cyclicals." },
            ]}
            unique="Nowhere else surfaces these as alerts. You'd have to manually cross-reference regime, acceleration, signal history, and data quality across multiple panels."
          />

          {/* Recently Ended */}
          <GuideSection
            title="Recently Ended Rotations"
            color="text-[#888]"
            description="Rotations that recently concluded, with their duration and total ETF performance."
            details={[
              { label: "False starts", desc: "Rotations lasting < 5 days are flagged in red. These weren't real — factor this into how you weight future signals from the same sector." },
              { label: "Performance review", desc: "See how much the ETF moved during the rotation period. Helps calibrate expectations for future rotations." },
            ]}
            unique="Also shown on the Rotation Tracker, but the Brief highlights false starts more prominently as a risk consideration."
          />
        </div>
      </div>

      {/* Data flow */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-5">
        <h2 className="text-lg font-bold text-white mb-3">Data Flow</h2>
        <div className="text-sm text-[#ccc] space-y-2">
          <p><span className="text-white font-medium">Source:</span> Same real-time data as the Sectors Dashboard — fetched via <code className="text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded text-cyan-400">useSectorData()</code> hook with 10-minute auto-refresh.</p>
          <p><span className="text-white font-medium">Analysis layer:</span> Pure deterministic functions in <code className="text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded text-cyan-400">brief.ts</code> — no AI, no randomness. Same inputs always produce same outputs.</p>
          <p><span className="text-white font-medium">Macro events:</span> Fetched from <code className="text-xs bg-[#1a1a1a] px-1.5 py-0.5 rounded text-cyan-400">/api/macro-events</code> endpoint (1-hour cache).</p>
          <p><span className="text-white font-medium">Refresh:</span> Click the refresh button to force a new scan. Data age badge shows how fresh the current data is.</p>
        </div>
      </div>

      {/* How to use */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-5">
        <h2 className="text-lg font-bold text-white mb-3">How to Use This Page</h2>
        <ol className="text-sm text-[#ccc] space-y-2 list-decimal list-inside">
          <li><strong className="text-white">Check posture first.</strong> If DEFENSIVE or CASH, reduce exposure regardless of individual sector strength.</li>
          <li><strong className="text-white">Scan risk flags.</strong> Red flags override green signals. Address risks before adding positions.</li>
          <li><strong className="text-white">Review upcoming events.</strong> Avoid opening new positions into FOMC/CPI within 1-2 days.</li>
          <li><strong className="text-white">Check actionable tiers.</strong> These are your sector candidates — look at their trading action (TRADE/BUILD).</li>
          <li><strong className="text-white">Review active rotations.</strong> Follow the action signals (ENTER/ADD/HOLD/EXIT) — they account for lifecycle, conviction, and regime alignment.</li>
          <li><strong className="text-white">Watch leading indicators.</strong> These are your next-week candidates. Start building watchlists for sectors showing multiple signals.</li>
          <li><strong className="text-white">Pick stocks.</strong> Use the HIGH conviction picks as primary candidates, MEDIUM conviction for secondary, and pullback watch for limit orders.</li>
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
