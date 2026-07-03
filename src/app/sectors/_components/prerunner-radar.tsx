"use client";

import { useMemo } from "react";
import type {
  SectorRotationScore,
  RRGQuadrant,
  EnrichedStock,
} from "@/lib/sector-rotation/types";
import type { RotationTrackerResult, LifecycleStage } from "@/lib/sector-rotation/rotation-types";
import {
  getHealth,
  computeLifecycleStage,
  isRegimeAligned,
} from "@/lib/sector-rotation/rotation-helpers";
import type { RegimeData } from "@/lib/sector-rotation/rotation-types";
import { PRERUNNER } from "@/lib/sector-rotation/config";
import { quadrantColor } from "./helpers";
import { CollapsiblePanel } from "./shared";

interface PreRunnerEntry {
  symbol: string;
  name: string;
  price: number;
  type: "TURNAROUND" | "LEADER";
  score: number;
  rsAcceleration: number;
  rsImproving: boolean;
  rsDelta: number;
  sector: string;
  sectorEtf: string;
  sectorQuadrant: RRGQuadrant;
  lifecycle: LifecycleStage | null;
  volumeRatio: number;
  performancePct: number | null;
  aboveSma50: boolean;
  conviction: string;
  regimeAlignment: "aligned" | "headwind" | "neutral";
}

// ── Client-side scoring (mirrors server logic) ──

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function scoreRS(rsAccel: number): number {
  return clamp01(Math.abs(rsAccel) / PRERUNNER.RS_ACCEL_MAX);
}
function scoreVol(volRatio: number): number {
  return clamp01((volRatio - 0.5) / (PRERUNNER.VOL_RATIO_MAX - 0.5));
}
function scoreQuad(q: RRGQuadrant): number {
  return (PRERUNNER.QUADRANT_SCORES[q] ?? 0) / 25;
}
function scoreLc(lc: LifecycleStage): number {
  return (PRERUNNER.LIFECYCLE_SCORES[lc] ?? 0) / 20;
}
function scoreRegimeAlign(a: "aligned" | "headwind" | "neutral"): number {
  return a === "aligned" ? 1 : a === "neutral" ? 0.5 : 0;
}
function scoreConv(c: string): number {
  return c === "HIGH" ? 1 : c === "MEDIUM" ? 0.7 : 0.3;
}

function computeLeaderScore(
  stock: EnrichedStock,
  alignment: "aligned" | "headwind" | "neutral",
): number {
  let s = 0;
  s += scoreRS(stock.rsAccel ?? 0) * PRERUNNER.LEADER_RS_WEIGHT;
  s += scoreQuad(stock.sectorQuadrant) * PRERUNNER.LEADER_SECTOR_WEIGHT;
  s += scoreVol(stock.volRatio) * PRERUNNER.LEADER_VOLUME_WEIGHT;
  s += scoreConv(stock.conviction) * PRERUNNER.LEADER_CONVICTION_WEIGHT;
  s += scoreRegimeAlign(alignment) * PRERUNNER.LEADER_REGIME_WEIGHT;
  if ((stock.rsAccel ?? 0) > 0) s += PRERUNNER.RS_IMPROVING_BONUS;
  return Math.round(Math.min(100, s));
}

function computeTurnaroundScore(
  rsAccel: number,
  rsImproving: boolean,
  volRatio: number,
  quadrant: RRGQuadrant,
  lifecycle: LifecycleStage,
  alignment: "aligned" | "headwind" | "neutral",
): number {
  let s = 0;
  s += scoreRS(rsAccel) * PRERUNNER.TURNAROUND_RS_WEIGHT;
  s += scoreLc(lifecycle) * PRERUNNER.TURNAROUND_LIFECYCLE_WEIGHT;
  s += scoreVol(volRatio) * PRERUNNER.TURNAROUND_VOLUME_WEIGHT;
  s += scoreQuad(quadrant) * PRERUNNER.TURNAROUND_SECTOR_WEIGHT;
  s += scoreRegimeAlign(alignment) * PRERUNNER.TURNAROUND_REGIME_WEIGHT;
  if (rsImproving) s += PRERUNNER.RS_IMPROVING_BONUS;
  return Math.round(Math.min(100, s));
}

export function PreRunnerRadar({
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
  const candidates = useMemo(() => {
    const regime = rotationData.regime as RegimeData | null;
    const sectorMap = new Map<string, SectorRotationScore>();
    for (const s of sectors) {
      sectorMap.set(s.sector, s);
      sectorMap.set(s.etf, s);
    }

    const result = new Map<string, PreRunnerEntry>();

    // Leaders from enrichment
    for (const stock of enrichedStocks) {
      if (stock.category !== "LEADER") continue;
      if (stock.conviction !== "HIGH" && stock.conviction !== "MEDIUM") continue;

      const alignment = regime ? isRegimeAligned(stock.sector, regime) : "neutral";
      const score = computeLeaderScore(stock, alignment);
      if (score < PRERUNNER.MIN_SCORE) continue;

      result.set(stock.symbol, {
        symbol: stock.symbol,
        name: stock.shortName,
        price: stock.price,
        type: "LEADER",
        score,
        rsAcceleration: stock.rsAccel ?? 0,
        rsImproving: (stock.rsAccel ?? 0) > 0,
        rsDelta: 0,
        sector: stock.sector,
        sectorEtf: stock.sectorEtf,
        sectorQuadrant: stock.sectorQuadrant,
        lifecycle: null,
        volumeRatio: stock.volRatio,
        performancePct: stock.ret20d,
        aboveSma50: stock.above50ma,
        conviction: stock.conviction,
        regimeAlignment: alignment,
      });
    }

    // Turnarounds from rotation tracker
    for (const rotation of rotationData.activeRotations) {
      const event = rotation.event;
      const lifecycle = computeLifecycleStage(event);
      const sectorScore = sectorMap.get(event.etf) ?? sectorMap.get(event.sectorName);
      const quadrant = sectorScore?.quadrant ?? "LAGGING";

      for (const stock of rotation.stocks) {
        if (!stock.isTurnaroundCandidate) continue;

        const alignment = regime ? isRegimeAligned(event.sectorName, regime) : "neutral";
        const score = computeTurnaroundScore(
          stock.rsAcceleration,
          stock.rsImproving,
          stock.volumeVsAvg,
          quadrant,
          lifecycle,
          alignment,
        );
        if (score < PRERUNNER.MIN_SCORE) continue;

        const existing = result.get(stock.symbol);
        if (existing && existing.score >= score) continue;

        result.set(stock.symbol, {
          symbol: stock.symbol,
          name: stock.name,
          price: stock.priceNow,
          type: "TURNAROUND",
          score,
          rsAcceleration: stock.rsAcceleration,
          rsImproving: stock.rsImproving,
          rsDelta: stock.rsDelta,
          sector: event.sectorName,
          sectorEtf: event.etf,
          sectorQuadrant: quadrant,
          lifecycle,
          volumeRatio: stock.volumeVsAvg,
          performancePct: stock.performancePct,
          aboveSma50: stock.aboveSma50,
          conviction: lifecycle === "EARLY" ? "HIGH" : lifecycle === "MATURING" ? "MEDIUM" : "LOW",
          regimeAlignment: alignment,
        });
      }
    }

    return [...result.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, PRERUNNER.MAX_UI_CANDIDATES);
  }, [rotationData, enrichedStocks, sectors]);

  const turnaroundCount = candidates.filter((c) => c.type === "TURNAROUND").length;
  const leaderCount = candidates.filter((c) => c.type === "LEADER").length;

  return (
    <CollapsiblePanel
      id="prerunner-radar"
      title="Pre-Runner Radar"
      collapsed={collapsed}
      onToggle={onToggle}
      badge={
        candidates.length === 0
          ? <span className="rounded-full border border-[#333] bg-[#1a1a1a] px-2 py-0.5 text-[10px] font-medium text-[#666]">No signals</span>
          : <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
              {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
              {turnaroundCount > 0 && leaderCount > 0
                ? ` (${turnaroundCount}T + ${leaderCount}L)`
                : turnaroundCount > 0
                  ? ` (${turnaroundCount} turnaround)`
                  : ` (${leaderCount} leader)`}
            </span>
      }
      className={candidates.length > 0 ? "border-purple-500/20" : ""}
    >
      {candidates.length === 0 ? (
        <p className="text-xs text-[#666]">
          No pre-runner candidates detected. Rotations must be active with qualified stocks, or leaders must have sufficient RS acceleration.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a2a2a] text-left text-[10px] font-medium uppercase tracking-wide text-[#666]">
                <th className="px-2 py-1.5">Symbol</th>
                <th className="px-2 py-1.5">Type</th>
                <th className="px-2 py-1.5">Score</th>
                <th className="px-2 py-1.5">RS Accel</th>
                <th className="px-2 py-1.5">Sector</th>
                <th className="px-2 py-1.5">Stage</th>
                <th className="px-2 py-1.5">Vol Ratio</th>
                <th className="hidden px-2 py-1.5 sm:table-cell">Perf %</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.symbol} className="border-b border-[#1a1a1a] hover:bg-[#111]">
                  <td className="px-2 py-1.5">
                    <a
                      href={`https://finance.yahoo.com/quote/${c.symbol}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#5ba3e6] hover:underline"
                    >
                      {c.symbol}
                    </a>
                    <span className="ml-1.5 text-[10px] text-[#555]">{c.name}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      c.type === "TURNAROUND"
                        ? "bg-purple-500/10 text-purple-400"
                        : "bg-green-500/10 text-green-400"
                    }`}>
                      {c.type === "TURNAROUND" ? "Turnaround" : "Leader"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[#2a2a2a]">
                        <div
                          className={`h-full rounded-full ${c.score >= 70 ? "bg-green-500" : c.score >= 55 ? "bg-cyan-500" : "bg-amber-500"}`}
                          style={{ width: `${c.score}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-white">{c.score}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={c.rsAcceleration > 0 ? "text-green-400" : "text-red-400"}>
                      {c.rsAcceleration > 0 ? "+" : ""}{c.rsAcceleration.toFixed(1)}
                    </span>
                    <span className="ml-0.5 text-[10px]">{c.rsImproving ? "\u2191" : "\u2193"}</span>
                    {c.rsDelta !== 0 && (
                      <span className={`ml-1 text-[10px] ${c.rsDelta > 0 ? "text-green-400/60" : "text-red-400/60"}`}>
                        ({c.rsDelta > 0 ? "+" : ""}{c.rsDelta.toFixed(1)})
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="text-[#a0a0a0]">{c.sector}</span>
                    <span className={`ml-1.5 rounded-full border px-1 py-0.5 text-[9px] ${quadrantColor(c.sectorQuadrant)}`}>
                      {c.sectorQuadrant}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {c.lifecycle ? (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        c.lifecycle === "EARLY"
                          ? "bg-green-500/10 text-green-400"
                          : c.lifecycle === "MATURING"
                            ? "bg-cyan-500/10 text-cyan-400"
                            : c.lifecycle === "LATE"
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-red-500/10 text-red-400"
                      }`}>
                        {c.lifecycle}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#555]">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={c.volumeRatio >= 1.2 ? "text-green-400" : c.volumeRatio >= 0.8 ? "text-[#a0a0a0]" : "text-red-400"}>
                      {c.volumeRatio.toFixed(1)}x
                    </span>
                  </td>
                  <td className="hidden px-2 py-1.5 sm:table-cell">
                    {c.performancePct != null ? (
                      <span className={c.performancePct >= 0 ? "text-green-400" : "text-red-400"}>
                        {c.performancePct > 0 ? "+" : ""}{c.performancePct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[#555]">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsiblePanel>
  );
}
