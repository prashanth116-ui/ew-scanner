"use client";

import { useMemo } from "react";
import { ArrowUpCircle, Plus, Shield, TrendingUp } from "lucide-react";
import type {
  SectorRotationScore,
  RRGQuadrant,
  EnrichedStock,
} from "@/lib/sector-rotation/types";
import type { RotationTrackerResult, ActiveRotationDetail, RotationPatternStats, LifecycleStage, ConvictionResult } from "@/lib/sector-rotation/rotation-types";
import {
  getHealth,
  computeLifecycleStage,
  computeConviction,
  computeActionSignal,
  isRegimeAligned,
  type ActionSignal,
} from "@/lib/sector-rotation/rotation-helpers";
import { ROTATION } from "@/lib/sector-rotation/config";
import { quadrantColor } from "./helpers";
import { CollapsiblePanel } from "./shared";

// ── Timing Classification ──

type SignalTiming = "EARLY" | "CONFIRMED" | "DELAYED";

const TIMING_STYLE: Record<SignalTiming, { bg: string; border: string; text: string; label: string }> = {
  EARLY: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400", label: "Early" },
  CONFIRMED: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400", label: "Confirmed" },
  DELAYED: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", label: "Delayed" },
};

const TIMING_RANK: Record<SignalTiming, number> = { EARLY: 0, CONFIRMED: 1, DELAYED: 2 };

function classifyTiming(daysActive: number, health: { acceleration: number; cmf20: number }): SignalTiming {
  const hasHealthConfirmation = health.cmf20 > 0 && health.acceleration > 0;

  if (daysActive <= ROTATION.EARLY_TIMING_DAYS) return "EARLY";
  if (daysActive <= 10 && !hasHealthConfirmation) return "EARLY";
  if (daysActive <= ROTATION.DELAYED_TIMING_DAYS) return "CONFIRMED";
  return "DELAYED";
}

function isSignalSustained(signalHistory: { date: string; signalCount: number; close: number }[]): boolean {
  if (signalHistory.length < 3) return false;
  const avgSignal = signalHistory.reduce((sum, h) => sum + h.signalCount, 0) / signalHistory.length;
  return avgSignal >= ROTATION.MIN_AVG_SIGNAL_COUNT;
}

// ── Types ──

interface EntrySignalSector {
  rotation: ActiveRotationDetail;
  signal: ActionSignal;
  lifecycle: LifecycleStage;
  conviction: ConvictionResult;
  regimeAlignment: "aligned" | "headwind" | "neutral";
  health: { acceleration: number; cmf20: number; quadrant: RRGQuadrant };
  patternStats: RotationPatternStats | undefined;
  topStocks: EnrichedStock[];
  timing: SignalTiming;
}

// ── Component ──

export function RotationEntrySignals({
  rotationData,
  enrichedStocks,
  sectors,
  collapsed,
  onToggle,
}: {
  rotationData: RotationTrackerResult;
  enrichedStocks: EnrichedStock[];
  sectors: SectorRotationScore[];
  collapsed: boolean;
  onToggle: (id: string) => void;
}) {
  const { entries, emerging, exiting, unsustained } = useMemo(() => {
    const results: EntrySignalSector[] = [];
    const regime = rotationData.regime;
    let emergingCount = 0;
    let exitingCount = 0;
    let unsustainedCount = 0;

    for (const rotation of rotationData.activeRotations) {
      const event = rotation.event;
      const health = getHealth(event);
      const lifecycle = computeLifecycleStage(event);
      const conviction = computeConviction(event);
      const alignment = regime ? isRegimeAligned(event.sectorName, regime) : "neutral";
      const signal = computeActionSignal(lifecycle, conviction, alignment);

      // Filter EXIT rotations
      if (signal.action === "EXIT") { exitingCount++; continue; }

      // Filter blips (< MIN_ROTATION_DAYS)
      if (event.daysActive < ROTATION.MIN_ROTATION_DAYS) { emergingCount++; continue; }

      // Filter unsustained signals
      if (!isSignalSustained(event.signalHistory ?? [])) { unsustainedCount++; continue; }

      const timing = classifyTiming(event.daysActive, health);

      const sectorStocks = enrichedStocks.filter((s) => s.sectorEtf === event.etf);
      const qualityStocks = sectorStocks.filter(
        (s) => (s.conviction === "HIGH" || s.conviction === "MEDIUM") && (s.category === "LEADER" || s.category === "TURNAROUND")
      );

      const CONVICTION_SORT: Record<string, number> = { HIGH: 0, MEDIUM: 1, WATCH: 2 };
      const topStocks = [...qualityStocks]
        .sort((a, b) => (CONVICTION_SORT[a.conviction] ?? 9) - (CONVICTION_SORT[b.conviction] ?? 9) || (b.rsAccel ?? 0) - (a.rsAccel ?? 0))
        .slice(0, 3);

      const stats = rotationData.patternStats.find((p) => p.etf === event.etf);

      results.push({
        rotation,
        signal,
        lifecycle,
        conviction,
        regimeAlignment: alignment,
        health,
        patternStats: stats,
        topStocks,
        timing,
      });
    }

    // Sort: EARLY first → CONFIRMED → DELAYED; within tier: conviction score desc
    results.sort((a, b) => TIMING_RANK[a.timing] - TIMING_RANK[b.timing] || b.conviction.score - a.conviction.score);

    return { entries: results, emerging: emergingCount, exiting: exitingCount, unsustained: unsustainedCount };
  }, [rotationData, enrichedStocks]);

  // Panel badge color based on best timing
  const bestTiming: SignalTiming | null = entries.length > 0 ? entries[0].timing : null;
  const badgeStyle = bestTiming ? TIMING_STYLE[bestTiming] : null;

  // Group entries by timing tier
  const groups = useMemo(() => {
    const map = new Map<SignalTiming, EntrySignalSector[]>();
    for (const e of entries) {
      const arr = map.get(e.timing) ?? [];
      arr.push(e);
      map.set(e.timing, arr);
    }
    const ordered: { timing: SignalTiming; items: EntrySignalSector[] }[] = [];
    for (const t of ["EARLY", "CONFIRMED", "DELAYED"] as SignalTiming[]) {
      const items = map.get(t);
      if (items && items.length > 0) ordered.push({ timing: t, items });
    }
    return ordered;
  }, [entries]);

  return (
    <CollapsiblePanel
      id="entry-signals"
      title="Rotation Signals"
      collapsed={collapsed}
      onToggle={onToggle}
      badge={
        entries.length === 0
          ? <span className="rounded-full border border-[#333] bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-medium text-[#666]">No signals</span>
          : <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeStyle!.border} ${badgeStyle!.bg} ${badgeStyle!.text}`}>
            {entries.length} {entries.length === 1 ? "signal" : "signals"}
          </span>
      }
      className={entries.length > 0 && badgeStyle ? badgeStyle.border : ""}
    >
      <div className="space-y-3">
        {entries.length === 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-[#666]">No active rotations pass noise filters. Check the <a href="/rotation" className="text-[#5ba3e6] hover:underline">Rotation Tracker</a> for current rotation status.</p>
            <div className="text-[11px] text-[#555] space-y-0.5">
              {emerging > 0 && <p>{emerging} emerging rotation{emerging !== 1 ? "s" : ""} — monitoring for sustained signals</p>}
              {exiting > 0 && <p>{exiting} rotation{exiting !== 1 ? "s" : ""} ending</p>}
              {unsustained > 0 && <p>{unsustained} rotation{unsustained !== 1 ? "s" : ""} with unsustained signals</p>}
            </div>
          </div>
        )}

        {groups.map((group) => {
          const style = TIMING_STYLE[group.timing];
          return (
            <div key={group.timing}>
              {/* Section header */}
              <div className="mb-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-[#2a2a2a]" />
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>
                  {style.label} Signals ({group.items.length})
                </span>
                <div className="h-px flex-1 bg-[#2a2a2a]" />
              </div>

              <div className="space-y-3">
                {group.items.map((entry) => (
                  <SignalCard key={entry.rotation.event.etf} entry={entry} sectors={sectors} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </CollapsiblePanel>
  );
}

// ── Signal Card ──

function SignalCard({ entry, sectors }: { entry: EntrySignalSector; sectors: SectorRotationScore[] }) {
  const { rotation, signal, lifecycle, conviction, regimeAlignment, health, patternStats, topStocks, timing } = entry;
  const event = rotation.event;
  const sectorScore = sectors.find((s) => s.sector === event.sectorName);
  const style = TIMING_STYLE[timing];

  const signalHistory = event.signalHistory ?? [];
  const avgSignalCount = signalHistory.length > 0
    ? signalHistory.reduce((sum, h) => sum + h.signalCount, 0) / signalHistory.length
    : 0;

  // Health indicator colors
  const cmfColor = health.cmf20 > 0 ? "bg-green-500/10 text-green-400 border-green-500/30"
    : health.cmf20 > -0.05 ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
    : "bg-red-500/10 text-red-400 border-red-500/30";
  const accelColor = health.acceleration > 0 ? "bg-green-500/10 text-green-400 border-green-500/30"
    : health.acceleration > -0.3 ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
    : "bg-red-500/10 text-red-400 border-red-500/30";
  const signalColor = avgSignalCount >= 2.5 ? "text-green-400" : avgSignalCount >= 1.5 ? "text-cyan-400" : "text-amber-400";
  const convictionColor = conviction.level === "HIGH" ? "border-green-500/30 bg-green-500/10 text-green-400"
    : conviction.level === "MODERATE" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
    : "border-amber-500/30 bg-amber-500/10 text-amber-400";

  // Action badge
  const actionIcon = signal.action === "ENTER"
    ? <ArrowUpCircle className="mr-1 inline h-3 w-3" />
    : signal.action === "ADD ON PULLBACK"
      ? <Plus className="mr-1 inline h-3 w-3" />
      : <Shield className="mr-1 inline h-3 w-3" />;
  const actionLabel = signal.action === "HOLD — TIGHTEN STOPS" ? "HOLD" : signal.action;

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-3`}>
      {/* Header row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-white">{event.sectorName}</span>
        <span className="text-xs text-[#666]">{event.etf}</span>
        {sectorScore && (
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${quadrantColor(sectorScore.quadrant)}`}>
            {sectorScore.quadrant}
          </span>
        )}
        {/* Timing badge */}
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.border} ${style.bg} ${style.text}`}>
          <TrendingUp className="h-3 w-3" />
          {style.label} (Day {event.daysActive})
        </span>
        {/* Action badge */}
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${signal.borderColor} ${signal.bgColor} ${signal.color}`}>
          {actionIcon}{actionLabel}
        </span>
        {regimeAlignment === "aligned" && (
          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">Regime Aligned</span>
        )}
      </div>

      <p className="mb-2 text-xs text-[#a0a0a0]">{signal.description}</p>

      {/* Stage + Day info */}
      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        <span className="text-[#666]">Stage: <span className="text-white">{lifecycle}</span></span>
        <span className="text-[#666]">Day {event.daysActive}{patternStats ? ` / avg ${Math.round(patternStats.avgDurationDays)}d` : ""}</span>
      </div>

      {/* Health indicator badges */}
      <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 ${cmfColor}`}>
          CMF {health.cmf20 > 0 ? "+" : ""}{health.cmf20.toFixed(2)}
        </span>
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 ${accelColor}`}>
          Accel {health.acceleration > 0 ? "+" : ""}{health.acceleration.toFixed(2)}
        </span>
        <span className={`inline-flex items-center rounded-full border border-[#333] bg-[#1a1a1a] px-1.5 py-0.5`}>
          <span className={signalColor}>{avgSignalCount.toFixed(1)}/3</span><span className="text-[#666] ml-0.5">signals</span>
        </span>
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 ${convictionColor}`}>
          {conviction.level}
        </span>
        {regimeAlignment === "headwind" && (
          <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-red-400">Headwind</span>
        )}
      </div>

      {/* Top picks */}
      {topStocks.length > 0 ? (
        <div className="rounded-md border border-[#2a2a2a] bg-[#0d0d0d] p-2">
          <div className="mb-1 text-[10px] font-medium text-[#666] uppercase tracking-wide">Top Picks</div>
          <div className="space-y-1">
            {topStocks.map((stock) => (
              <div key={stock.symbol} className="flex items-center gap-2 text-xs">
                <a
                  href={`https://finance.yahoo.com/quote/${stock.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#5ba3e6] hover:underline"
                >
                  {stock.symbol}
                </a>
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${stock.conviction === "HIGH" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"}`}>
                  {stock.conviction}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${stock.category === "LEADER" ? "bg-green-500/10 text-green-400" : "bg-purple-500/10 text-purple-400"}`}>
                  {stock.category === "CATCH_UP" ? "Catch-up" : stock.category === "TURNAROUND" ? "Turnaround" : stock.category.charAt(0) + stock.category.slice(1).toLowerCase()}
                </span>
                {stock.rsAccel != null && (
                  <span className={`text-[10px] ${stock.rsAccel > 0 ? "text-green-400" : "text-red-400"}`}>
                    RS {stock.rsAccel > 0 ? "+" : ""}{stock.rsAccel.toFixed(1)}
                  </span>
                )}
                {stock.institutionalPct != null && (
                  <span className="text-[10px] text-[#666]">Inst {stock.institutionalPct.toFixed(0)}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-[#2a2a2a] bg-[#0d0d0d] p-2">
          <p className="text-[10px] text-[#555] italic">No quality stocks yet — monitoring for leaders/turnarounds</p>
        </div>
      )}
    </div>
  );
}
