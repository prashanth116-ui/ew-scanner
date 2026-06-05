"use client";

import { useState, useEffect, useMemo } from "react";
import { RefreshCw, ArrowLeft, AlertTriangle, TrendingUp, Shield, Banknote, Crosshair } from "lucide-react";
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

export default function DailyBriefPage() {
  const { data, loading, error, fetchData, rotationData } = useSectorData();
  const [collapsed, toggle] = useCollapsedPanels("ew-brief-collapsed-v1");
  const [macroEvents, setMacroEvents] = useState<CatalystCalendarEvent[]>([]);
  const [macroLoading, setMacroLoading] = useState(true);

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
    () => (data ? computeSectorTiers(data.sectors) : null),
    [data]
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

function StockTable({ stocks }: { stocks: EnrichedStock[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-[#666]">
            <th className="pb-1.5 pr-3">Symbol</th>
            <th className="pb-1.5 pr-3">Sector</th>
            <th className="pb-1.5 pr-3 text-right">Price</th>
            <th className="pb-1.5 pr-3">Phase</th>
            <th className="pb-1.5 pr-3">Category</th>
            <th className="pb-1.5 pr-3 text-right">RS Accel</th>
            <th className="pb-1.5 text-right">Vol Ratio</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => {
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
