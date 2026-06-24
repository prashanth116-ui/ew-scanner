"use client";

import { useMemo } from "react";
import { ArrowUpCircle, Plus, CheckCircle2 } from "lucide-react";
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
import { quadrantColor } from "./helpers";
import { CollapsiblePanel } from "./shared";

interface EntrySignalSector {
  rotation: ActiveRotationDetail;
  signal: ActionSignal;
  lifecycle: LifecycleStage;
  conviction: ConvictionResult;
  regimeAlignment: "aligned" | "headwind" | "neutral";
  health: { acceleration: number; cmf20: number; quadrant: RRGQuadrant };
  patternStats: RotationPatternStats | undefined;
  topStocks: EnrichedStock[];
}

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
  const entries = useMemo(() => {
    const results: EntrySignalSector[] = [];
    const regime = rotationData.regime;

    for (const rotation of rotationData.activeRotations) {
      const event = rotation.event;
      const health = getHealth(event);
      const lifecycle = computeLifecycleStage(event);
      const conviction = computeConviction(event);
      const alignment = regime ? isRegimeAligned(event.sectorName, regime) : "neutral";
      const signal = computeActionSignal(lifecycle, conviction, alignment);

      if (signal.action !== "ENTER" && signal.action !== "ADD ON PULLBACK") continue;
      if (health.cmf20 <= 0) continue;
      if (health.acceleration <= 0) continue;

      const sectorStocks = enrichedStocks.filter((s) => s.sectorEtf === event.etf);
      const qualityStocks = sectorStocks.filter(
        (s) => (s.conviction === "HIGH" || s.conviction === "MEDIUM") && (s.category === "LEADER" || s.category === "TURNAROUND")
      );

      const hasQualityStock = sectorStocks.some(
        (s) => (s.conviction === "HIGH" || s.conviction === "MEDIUM") && (s.category === "LEADER" || s.category === "TURNAROUND")
      );
      if (!hasQualityStock) continue;

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
      });
    }

    results.sort((a, b) => (a.signal.action === "ENTER" ? 0 : 1) - (b.signal.action === "ENTER" ? 0 : 1));
    return results;
  }, [rotationData, enrichedStocks]);

  const hasEnter = entries.some((e) => e.signal.action === "ENTER");
  const borderColor = entries.length > 0
    ? hasEnter ? "border-green-500/30" : "border-cyan-500/30"
    : "";

  return (
    <CollapsiblePanel
      id="entry-signals"
      title="Entry Signals"
      collapsed={collapsed}
      onToggle={onToggle}
      badge={
        entries.length === 0
          ? <span className="rounded-full border border-[#333] bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-medium text-[#666]">No signals</span>
          : <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${hasEnter ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"}`}>
          {entries.length} {entries.length === 1 ? "signal" : "signals"}
        </span>
      }
      className={borderColor}
    >
      <div className="space-y-3">
        {entries.length === 0 && (
          <div className="space-y-1">
            <p className="text-xs text-[#666]">No active rotations currently pass all entry gates (action signal + CMF + acceleration + stock quality). Check the <a href="/rotation" className="text-[#5ba3e6] hover:underline">Rotation Tracker</a> for current rotation status.</p>
            {rotationData.activeRotations.length > 0 && (
              <div className="text-[11px] text-[#555] space-y-0.5">
                <p>{rotationData.activeRotations.length} active rotation{rotationData.activeRotations.length !== 1 ? "s" : ""} blocked:</p>
                {rotationData.activeRotations.map((r) => {
                  const ev = r.event;
                  const h = getHealth(ev);
                  const lc = computeLifecycleStage(ev);
                  const conv = computeConviction(ev);
                  const regime = rotationData.regime;
                  const alignment = regime ? isRegimeAligned(ev.sectorName, regime) : "neutral";
                  const sig = computeActionSignal(lc, conv, alignment);
                  const blocks: string[] = [];
                  if (sig.action !== "ENTER" && sig.action !== "ADD ON PULLBACK") blocks.push(`action=${sig.action ?? "none"}`);
                  if (h.cmf20 <= 0) blocks.push(`CMF ${h.cmf20.toFixed(3)}`);
                  if (h.acceleration <= 0) blocks.push(`accel ${h.acceleration.toFixed(2)}`);
                  const sectorStocks = enrichedStocks.filter((s) => s.sectorEtf === ev.etf);
                  const hasQuality = sectorStocks.some(
                    (s) => (s.conviction === "HIGH" || s.conviction === "MEDIUM") && (s.category === "LEADER" || s.category === "TURNAROUND")
                  );
                  if (!hasQuality) blocks.push("no quality stocks");
                  return (
                    <p key={ev.etf}><span className="text-[#888]">{ev.sectorName}</span> — {blocks.join(", ")}</p>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {entries.map((entry) => {
          const { rotation, signal, lifecycle, conviction, regimeAlignment, health, patternStats, topStocks } = entry;
          const event = rotation.event;
          const sectorScore = sectors.find((s) => s.sector === event.sectorName);

          return (
            <div
              key={event.etf}
              className={`rounded-lg border ${signal.borderColor} ${signal.bgColor} p-3`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{event.sectorName}</span>
                <span className="text-xs text-[#666]">{event.etf}</span>
                {sectorScore && (
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${quadrantColor(sectorScore.quadrant)}`}>
                    {sectorScore.quadrant}
                  </span>
                )}
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${signal.borderColor} ${signal.bgColor} ${signal.color}`}>
                  {signal.action === "ENTER" ? <><ArrowUpCircle className="mr-1 inline h-3 w-3" />ENTER</> : <><Plus className="mr-1 inline h-3 w-3" />ADD ON PULLBACK</>}
                </span>
                {regimeAlignment === "aligned" && (
                  <span className="rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">Regime Aligned</span>
                )}
              </div>

              <p className="mb-2 text-xs text-[#a0a0a0]">{signal.description}</p>

              <div className="mb-2 flex flex-wrap gap-3 text-xs">
                <span className="text-[#666]">Stage: <span className="text-white">{lifecycle}</span></span>
                <span className="text-[#666]">Day {event.daysActive}{patternStats ? ` / avg ${Math.round(patternStats.avgDurationDays)}d` : ""}</span>
                <span className="text-[#666]">Accel: <span className={health.acceleration > 0 ? "text-green-400" : "text-red-400"}>{health.acceleration > 0 ? "+" : ""}{health.acceleration.toFixed(2)}</span></span>
                <span className="text-[#666]">CMF: <span className={health.cmf20 > 0 ? "text-green-400" : "text-red-400"}>{health.cmf20 > 0 ? "+" : ""}{health.cmf20.toFixed(2)}</span></span>
                <span className="text-[#666]">Conviction: <span className={conviction.level === "HIGH" ? "text-green-400" : conviction.level === "MODERATE" ? "text-cyan-400" : "text-amber-400"}>{conviction.level}</span> ({conviction.score})</span>
              </div>

              <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
                {[
                  { label: `CMF ${health.cmf20 > 0 ? "+" : ""}${health.cmf20.toFixed(2)}`, strong: health.cmf20 > 0.1 },
                  { label: `Accel ${health.acceleration > 0 ? "+" : ""}${health.acceleration.toFixed(2)}`, strong: health.acceleration > 1 },
                  { label: `${conviction.level} Conviction`, strong: conviction.level === "HIGH" },
                  { label: regimeAlignment === "aligned" ? "Regime Aligned" : "Regime Neutral", strong: regimeAlignment === "aligned" },
                ].map((indicator) => (
                  <span key={indicator.label} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ${indicator.strong ? "bg-green-500/10 text-green-400" : "bg-[#2a2a2a] text-[#888]"}`}>
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {indicator.label}
                  </span>
                ))}
              </div>

              {topStocks.length > 0 && (
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
              )}
            </div>
          );
        })}
      </div>
    </CollapsiblePanel>
  );
}
