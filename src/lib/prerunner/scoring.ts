/**
 * Pre-Runner Radar scoring engine.
 * SERVER-ONLY: Combines rotation tracker turnarounds + enrichment pipeline leaders.
 *
 * Two pipelines:
 * 1. LEADERs: from enrichedStocks.passed[] with category=LEADER + HIGH/MEDIUM conviction
 * 2. TURNAROUNDs: from rotationTracker.activeRotations[].stocks[] with isTurnaroundCandidate=true
 *
 * Each is scored on a 0-100 scale with different weight distributions, then merged.
 */

import "server-only";

import { calculateSectorRotation } from "@/lib/sector-rotation/sector-rotation";
import { calculateRotationTracker } from "@/lib/sector-rotation/rotation-tracker";
import {
  computeLifecycleStage,
  isRegimeAligned,
} from "@/lib/sector-rotation/rotation-helpers";
import { PRERUNNER } from "@/lib/sector-rotation/config";
import type { SectorRotationScore, EnrichedStock, RRGQuadrant } from "@/lib/sector-rotation/types";
import type { RotationTrackerResult, ActiveRotationDetail, LifecycleStage, RegimeData } from "@/lib/sector-rotation/rotation-types";
import type { PreRunnerCandidate, PreRunnerResult } from "./types";

// ── Score component helpers ──

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function scoreRSAccel(rsAccel: number): number {
  // Normalize 0..RS_ACCEL_MAX → 0..1
  return clamp01(Math.abs(rsAccel) / PRERUNNER.RS_ACCEL_MAX);
}

function scoreVolume(volRatio: number): number {
  return clamp01((volRatio - 0.5) / (PRERUNNER.VOL_RATIO_MAX - 0.5));
}

function scoreSectorQuadrant(quadrant: RRGQuadrant): number {
  return (PRERUNNER.QUADRANT_SCORES[quadrant] ?? 0) / 25;
}

function scoreLifecycle(lifecycle: LifecycleStage): number {
  return (PRERUNNER.LIFECYCLE_SCORES[lifecycle] ?? 0) / 20;
}

function scoreRegime(alignment: "aligned" | "headwind" | "neutral"): number {
  if (alignment === "aligned") return 1;
  if (alignment === "neutral") return 0.5;
  return 0;
}

function scoreConviction(conviction: string): number {
  if (conviction === "HIGH") return 1;
  if (conviction === "MEDIUM") return 0.7;
  return 0.3;
}

// ── Leader scoring (enrichment pipeline) ──

function scoreLeader(
  stock: EnrichedStock,
  sectorScore: SectorRotationScore | undefined,
  regime: RegimeData | null,
): number {
  const rsComponent = scoreRSAccel(stock.rsAccel ?? 0) * PRERUNNER.LEADER_RS_WEIGHT;
  const sectorComponent = scoreSectorQuadrant(stock.sectorQuadrant) * PRERUNNER.LEADER_SECTOR_WEIGHT;
  const volumeComponent = scoreVolume(stock.volRatio) * PRERUNNER.LEADER_VOLUME_WEIGHT;
  const convictionComponent = scoreConviction(stock.conviction) * PRERUNNER.LEADER_CONVICTION_WEIGHT;

  const alignment = regime
    ? isRegimeAligned(stock.sector, regime)
    : "neutral";
  const regimeComponent = scoreRegime(alignment) * PRERUNNER.LEADER_REGIME_WEIGHT;

  let score = rsComponent + sectorComponent + volumeComponent + convictionComponent + regimeComponent;

  // RS improving bonus
  if (stock.rsAccel != null && stock.rsAccel > 0) {
    score += PRERUNNER.RS_IMPROVING_BONUS;
  }

  return Math.round(Math.min(100, score));
}

// ── Turnaround scoring (rotation tracker) ──

function scoreTurnaround(
  stock: ActiveRotationDetail["stocks"][number],
  event: ActiveRotationDetail["event"],
  sectorScore: SectorRotationScore | undefined,
  regime: RegimeData | null,
  lifecycle: LifecycleStage,
): number {
  const rsComponent = scoreRSAccel(stock.rsAcceleration) * PRERUNNER.TURNAROUND_RS_WEIGHT;
  const lifecycleComponent = scoreLifecycle(lifecycle) * PRERUNNER.TURNAROUND_LIFECYCLE_WEIGHT;
  const volumeComponent = scoreVolume(stock.volumeVsAvg) * PRERUNNER.TURNAROUND_VOLUME_WEIGHT;

  const quadrant = sectorScore?.quadrant ?? "LAGGING";
  const sectorComponent = scoreSectorQuadrant(quadrant) * PRERUNNER.TURNAROUND_SECTOR_WEIGHT;

  const alignment = regime
    ? isRegimeAligned(event.sectorName, regime)
    : "neutral";
  const regimeComponent = scoreRegime(alignment) * PRERUNNER.TURNAROUND_REGIME_WEIGHT;

  let score = rsComponent + lifecycleComponent + volumeComponent + sectorComponent + regimeComponent;

  // RS improving bonus
  if (stock.rsImproving) {
    score += PRERUNNER.RS_IMPROVING_BONUS;
  }

  return Math.round(Math.min(100, score));
}

// ── Main engine ──

export async function computePreRunnerRadar(): Promise<PreRunnerResult> {
  // Call both upstream pipelines in parallel (both have 15-min caches)
  const [sectorResult, rotationResult] = await Promise.all([
    calculateSectorRotation(),
    calculateRotationTracker(),
  ]);

  const regime = sectorResult.regime as RegimeData | null;
  const sectorMap = new Map<string, SectorRotationScore>();
  for (const s of sectorResult.sectors) {
    sectorMap.set(s.sector, s);
    sectorMap.set(s.etf, s);
  }
  if (sectorResult.subSectorScores) {
    for (const s of sectorResult.subSectorScores) {
      sectorMap.set(s.sector, s);
      sectorMap.set(s.etf, s);
    }
  }

  const candidates = new Map<string, PreRunnerCandidate>();

  // 1. Extract LEADERs from enriched stocks
  const enrichedStocks = sectorResult.enrichedStocks?.passed ?? [];
  for (const stock of enrichedStocks) {
    if (stock.category !== "LEADER") continue;
    if (stock.conviction !== "HIGH" && stock.conviction !== "MEDIUM") continue;

    const sectorScore = sectorMap.get(stock.sectorEtf) ?? sectorMap.get(stock.sector);
    const score = scoreLeader(stock, sectorScore, regime);
    if (score < PRERUNNER.MIN_SCORE) continue;

    const alignment = regime ? isRegimeAligned(stock.sector, regime) : "neutral";

    candidates.set(stock.symbol, {
      symbol: stock.symbol,
      name: stock.shortName,
      price: stock.price,
      type: "LEADER",
      preRunnerScore: score,
      rsAcceleration: stock.rsAccel ?? 0,
      rsImproving: (stock.rsAccel ?? 0) > 0,
      rsDelta: 0, // Not available from enrichment pipeline
      sector: stock.sector,
      sectorEtf: stock.sectorEtf,
      sectorQuadrant: stock.sectorQuadrant,
      sectorComposite: stock.sectorComposite,
      lifecycle: null,
      rotationDaysActive: null,
      volumeRatio: stock.volRatio,
      regimeAlignment: alignment,
      conviction: stock.conviction,
      performancePct: stock.ret20d,
      aboveSma50: stock.above50ma,
      volumeConsistency: null,
      trendAccel: null,
    });
  }

  // 2. Extract TURNAROUNDs from rotation tracker
  for (const rotation of rotationResult.activeRotations) {
    const event = rotation.event;
    const lifecycle = computeLifecycleStage(event);
    const sectorScore = sectorMap.get(event.etf) ?? sectorMap.get(event.sectorName);

    for (const stock of rotation.stocks) {
      if (!stock.isTurnaroundCandidate) continue;

      const score = scoreTurnaround(stock, event, sectorScore, regime, lifecycle);
      if (score < PRERUNNER.MIN_SCORE) continue;

      // Deduplicate: keep higher score
      const existing = candidates.get(stock.symbol);
      if (existing && existing.preRunnerScore >= score) continue;

      const alignment = regime ? isRegimeAligned(event.sectorName, regime) : "neutral";

      candidates.set(stock.symbol, {
        symbol: stock.symbol,
        name: stock.name,
        price: stock.priceNow,
        type: "TURNAROUND",
        preRunnerScore: score,
        rsAcceleration: stock.rsAcceleration,
        rsImproving: stock.rsImproving,
        rsDelta: stock.rsDelta,
        sector: event.sectorName,
        sectorEtf: event.etf,
        sectorQuadrant: sectorScore?.quadrant ?? "LAGGING",
        sectorComposite: sectorScore?.compositeScore ?? 0,
        lifecycle,
        rotationDaysActive: event.daysActive,
        volumeRatio: stock.volumeVsAvg,
        regimeAlignment: alignment,
        conviction: lifecycle === "EARLY" ? "HIGH" : lifecycle === "MATURING" ? "MEDIUM" : "LOW",
        performancePct: stock.performancePct,
        aboveSma50: stock.aboveSma50,
        volumeConsistency: stock.volumeConsistency,
        trendAccel: stock.trendAccel,
      });
    }
  }

  // Sort by score descending
  const sorted = [...candidates.values()].sort(
    (a, b) => b.preRunnerScore - a.preRunnerScore,
  );

  const leaderCount = sorted.filter((c) => c.type === "LEADER").length;
  const turnaroundCount = sorted.filter((c) => c.type === "TURNAROUND").length;
  const activeSectors = [...new Set(sorted.map((c) => c.sector))];

  return {
    calculatedAt: new Date().toISOString(),
    candidates: sorted,
    leaderCount,
    turnaroundCount,
    activeSectors,
    regime: regime?.regime ?? null,
  };
}
