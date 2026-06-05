/**
 * Pure analysis functions for the Daily Market Brief.
 * All computations are deterministic — no side effects, no fetching.
 */

import type {
  SectorRotationResult,
  SectorRotationScore,
  EnrichedStock,
} from "./types";
import type {
  RotationTrackerResult,
  RotationEvent,
  LifecycleStage,
  ConvictionResult,
} from "./rotation-types";
import {
  computeLifecycleStage,
  computeConviction,
  computeActionSignal,
  isRegimeAligned,
  type ActionSignal,
} from "./rotation-helpers";
import { getTradingAction, type TradingAction } from "@/app/sectors/_components";

// ── Types ──

export type MarketPosture = "AGGRESSIVE" | "SELECTIVE" | "DEFENSIVE" | "CASH";

export interface PostureResult {
  posture: MarketPosture;
  reasoning: string;
  color: string;
}

export interface RiskFlag {
  severity: "high" | "medium";
  message: string;
  detail: string;
}

export interface LeadingIndicator {
  sector: string;
  etf: string;
  signals: string[];
}

export interface RotationSummary {
  event: RotationEvent;
  lifecycle: LifecycleStage;
  conviction: ConvictionResult;
  actionSignal: ActionSignal;
  topStocks: { symbol: string; name: string; performancePct: number }[];
}

export interface SectorTiers {
  actionable: SectorRotationScore[];
  watch: SectorRotationScore[];
  avoid: SectorRotationScore[];
}

// ── Market Posture ──

export function computeMarketPosture(
  data: SectorRotationResult,
  rotationData: RotationTrackerResult | null
): PostureResult {
  const regime = data.regime;
  const activeRotations = rotationData?.activeRotations ?? [];

  // Compute conviction for each active rotation
  const convictions = activeRotations.map((r) => computeConviction(r.event));
  const highModerate = convictions.filter(
    (c) => c.level === "HIGH" || c.level === "MODERATE"
  );
  const positiveConviction = convictions.filter((c) => c.level !== "EXIT");

  const leadingImproving = data.sectors.filter(
    (s) => s.quadrant === "LEADING" || s.quadrant === "IMPROVING"
  );
  const weakeningLagging = data.sectors.filter(
    (s) => s.quadrant === "WEAKENING" || s.quadrant === "LAGGING"
  );

  const isRiskOn = regime?.regime === "RISK_ON";
  const isRiskOff = regime?.regime === "RISK_OFF";
  const vixRising = regime?.vixSlope === "rising";
  const vixHigh = (regime?.vix ?? 0) > 30;

  // CASH: RISK_OFF + VIX>30 + 0 active rotations with positive conviction
  if (isRiskOff && vixHigh && positiveConviction.length === 0) {
    return {
      posture: "CASH",
      reasoning:
        "Risk-off regime with elevated VIX and no active rotations showing positive conviction. Capital preservation is priority.",
      color: "red",
    };
  }

  // DEFENSIVE: RISK_OFF OR VIX rising + majority sectors WEAKENING/LAGGING
  if (
    isRiskOff ||
    (vixRising && weakeningLagging.length > leadingImproving.length)
  ) {
    return {
      posture: "DEFENSIVE",
      reasoning: isRiskOff
        ? "Risk-off macro regime. Favor defensive sectors, reduce equity exposure."
        : "VIX rising with majority of sectors weakening or lagging. Reduce risk.",
      color: "amber",
    };
  }

  // AGGRESSIVE: RISK_ON + ≥2 active rotations with HIGH/MODERATE + dispersion > 5
  if (
    isRiskOn &&
    highModerate.length >= 2 &&
    data.dispersionIndex > 5
  ) {
    return {
      posture: "AGGRESSIVE",
      reasoning: `Risk-on regime with ${highModerate.length} high-conviction rotations and elevated sector dispersion (${data.dispersionIndex.toFixed(1)}). Lean into strongest sectors.`,
      color: "green",
    };
  }

  // SELECTIVE: RISK_ON/MIXED + ≥1 active rotation with MODERATE+ OR ≥3 sectors LEADING/IMPROVING
  if (
    (isRiskOn || regime?.regime === "MIXED") &&
    (highModerate.length >= 1 || leadingImproving.length >= 3)
  ) {
    return {
      posture: "SELECTIVE",
      reasoning:
        highModerate.length >= 1
          ? `${highModerate.length} rotation(s) with moderate+ conviction. Be selective — focus on highest-conviction sectors.`
          : `${leadingImproving.length} sectors in leading/improving quadrant. Opportunities exist but be disciplined.`,
      color: "cyan",
    };
  }

  // Default SELECTIVE for anything else
  return {
    posture: "SELECTIVE",
    reasoning:
      "Mixed market conditions. Focus on individual sector strength rather than broad exposure.",
    color: "cyan",
  };
}

// ── Sector Tiers ──

export function computeSectorTiers(
  sectors: SectorRotationScore[],
  rotationData: RotationTrackerResult | null
): SectorTiers {
  const actionable: SectorRotationScore[] = [];
  const watch: SectorRotationScore[] = [];
  const avoid: SectorRotationScore[] = [];

  // Build a set of ETF tickers with HIGH or MODERATE conviction from active rotations
  const highConvictionETFs = new Set<string>();
  if (rotationData) {
    for (const r of rotationData.activeRotations) {
      const conviction = computeConviction(r.event);
      if (conviction.level === "HIGH" || conviction.level === "MODERATE") {
        highConvictionETFs.add(r.event.etf);
      }
    }
  }

  for (const s of sectors) {
    const action = getTradingAction(s);
    const inFavorableQuadrant =
      s.quadrant === "LEADING" || (s.quadrant === "IMPROVING" && s.acceleration > 0);

    if (action === "TRADE" || action === "BUILD") {
      // Path 1: Original strict criteria (composite >= 60 + favorable quadrant)
      // Path 2: Active rotation with HIGH/MODERATE conviction + favorable quadrant (composite waived)
      if (
        inFavorableQuadrant &&
        (s.compositeScore >= 60 || highConvictionETFs.has(s.etf))
      ) {
        actionable.push(s);
      } else {
        watch.push(s);
      }
    } else if (action === "WATCH") {
      // Promote WATCH sectors to actionable if they have HIGH/MODERATE conviction + favorable quadrant
      if (inFavorableQuadrant && highConvictionETFs.has(s.etf)) {
        actionable.push(s);
      } else {
        watch.push(s);
      }
    } else {
      avoid.push(s);
    }
  }

  // Sort each tier by composite score desc
  actionable.sort((a, b) => b.compositeScore - a.compositeScore);
  watch.sort((a, b) => b.compositeScore - a.compositeScore);
  avoid.sort((a, b) => b.compositeScore - a.compositeScore);

  return { actionable, watch, avoid };
}

// ── Risk Flags ──

export function computeRiskFlags(
  data: SectorRotationResult,
  rotationData: RotationTrackerResult | null
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  // 1. LEADING sector with negative acceleration
  for (const s of data.sectors) {
    if (s.quadrant === "LEADING" && s.acceleration < 0) {
      flags.push({
        severity: "high",
        message: `${s.sector} losing momentum`,
        detail: `Leading sector with negative acceleration (${s.acceleration.toFixed(2)}). May be transitioning to WEAKENING.`,
      });
    }
  }

  // 2. Active rotation with declining signal count (last 3 days)
  if (rotationData) {
    for (const r of rotationData.activeRotations) {
      const hist = r.event.signalHistory ?? [];
      if (hist.length >= 3) {
        const recent = hist.slice(-3);
        if (recent[2].signalCount < recent[0].signalCount) {
          flags.push({
            severity: "medium",
            message: `${r.event.sectorName} signals declining`,
            detail: `Signal count dropped from ${recent[0].signalCount} to ${recent[2].signalCount} over last 3 data points.`,
          });
        }
      }
    }
  }

  // 3. VIX rising
  if (data.regime?.vixSlope === "rising") {
    flags.push({
      severity: "high",
      message: "VIX rising",
      detail: `VIX at ${data.regime.vix.toFixed(1)} with rising slope. Market uncertainty increasing.`,
    });
  }

  // 4. Sector data quality < 50%
  for (const s of data.sectors) {
    if (s.dataQuality < 50) {
      flags.push({
        severity: "medium",
        message: `${s.sector} low data quality`,
        detail: `Only ${s.dataQuality}% of composite factors have real data. Signals may be unreliable.`,
      });
    }
  }

  // 5. Recently ended rotation lasting < 5 days (false start)
  if (rotationData) {
    for (const ended of rotationData.recentlyEndedRotations) {
      if (ended.daysActive < 5) {
        flags.push({
          severity: "medium",
          message: `${ended.sectorName} false start`,
          detail: `Rotation lasted only ${ended.daysActive} day(s) before ending. Likely not a true rotation.`,
        });
      }
    }
  }

  // 6. Correlation break
  if (data.correlationBreak) {
    flags.push({
      severity: "high",
      message: "Correlation breakdown detected",
      detail:
        "Cross-sector correlations have broken down. Unusual market stress or regime change in progress.",
    });
  }

  // 7. High dispersion + regime RISK_OFF (panic rotation)
  if (data.dispersionIndex > 10 && data.regime?.regime === "RISK_OFF") {
    flags.push({
      severity: "high",
      message: "Panic rotation detected",
      detail: `High dispersion (${data.dispersionIndex.toFixed(1)}) in risk-off regime. Sector divergence may indicate panic selling in cyclicals.`,
    });
  }

  return flags;
}

// ── Leading Indicators ──

export function computeLeadingIndicators(
  sectors: SectorRotationScore[]
): LeadingIndicator[] {
  const results: LeadingIndicator[] = [];

  for (const s of sectors) {
    const signals: string[] = [];

    // LAGGING quadrant + positive acceleration (momentum turning)
    if (s.quadrant === "LAGGING" && s.acceleration > 0) {
      signals.push("Momentum turning positive in lagging quadrant");
    }

    // Stealth accumulation
    if (s.stealthAccumulation) {
      signals.push("Stealth accumulation (smart money before breakout)");
    }

    // Flow-price divergence
    if (s.flowPriceDivergence) {
      signals.push("Money flowing in while price flat");
    }

    // Acceleration inflection
    if (s.accelerationInflection) {
      signals.push("Acceleration about to flip positive");
    }

    // Breadth divergence
    if (s.breadthDivergence) {
      signals.push("Internal stocks improving before ETF");
    }

    if (signals.length > 0) {
      results.push({ sector: s.sector, etf: s.etf, signals });
    }
  }

  // Sort by signal count descending
  results.sort((a, b) => b.signals.length - a.signals.length);
  return results;
}

// ── Rotation Summaries ──

export function computeRotationSummaries(
  rotationData: RotationTrackerResult | null,
  regime: SectorRotationResult["regime"]
): RotationSummary[] {
  if (!rotationData) return [];

  const regimeData = regime
    ? {
        regime: regime.regime,
        vix: regime.vix,
        vixSlope: regime.vixSlope,
        yield10y: regime.yield10y,
        dxy: regime.dxy,
        dxyTrend: regime.dxyTrend,
        favoredSectors: regime.favoredSectors,
        avoidSectors: regime.avoidSectors,
      }
    : null;

  return rotationData.activeRotations.map((r) => {
    const lifecycle = computeLifecycleStage(r.event);
    const conviction = computeConviction(r.event);
    const alignment = regimeData
      ? isRegimeAligned(r.event.sectorName, regimeData)
      : "neutral";
    const actionSignal = computeActionSignal(lifecycle, conviction, alignment);

    // Top 3 stocks by performance
    const topStocks = r.stocks
      .slice(0, 3)
      .map((s) => ({
        symbol: s.symbol,
        name: s.name,
        performancePct: s.performancePct,
      }));

    return { event: r.event, lifecycle, conviction, actionSignal, topStocks };
  });
}
