/**
 * Pure analysis functions for the Daily Market Brief.
 * All computations are deterministic — no side effects, no fetching.
 */

import type {
  SectorRotationResult,
  SectorRotationScore,
  RRGQuadrant,
} from "./types";
import type { RotationTrackerResult } from "./rotation-types";
import { computeConviction } from "./rotation-helpers";
import { getTradingAction } from "@/app/sectors/_components";
import type { DailySnapshot, SectorSnapshot } from "./history";
import { computeLeadershipHealth } from "./leadership-health";
import type { LeadershipHealth } from "./leadership-health";
import { COMPOSITE, POSTURE, REGIME as REGIME_CFG, RISK_FLAGS, ROTATION } from "./config";

// ── Types ──

export type MarketPosture = "AGGRESSIVE" | "SELECTIVE" | "DEFENSIVE" | "CASH";

export interface PostureResult {
  posture: MarketPosture;
  reasoning: string;
}

export interface RiskFlag {
  severity: "high" | "medium";
  message: string;
  detail: string;
}

export interface SectorTiers {
  actionable: SectorRotationScore[];
  watch: SectorRotationScore[];
  avoid: SectorRotationScore[];
}

type TransitionCategory =
  | "rotation_starting"
  | "breakout_confirmed"
  | "momentum_fading"
  | "rotation_out"
  | "other";

export interface WhatChangedResult {
  postureChange: { from: MarketPosture; to: MarketPosture } | null;
  quadrantTransitions: {
    sector: string;
    etf: string;
    from: RRGQuadrant;
    to: RRGQuadrant;
    category: TransitionCategory;
  }[];
  tierChanges: {
    sector: string;
    etf: string;
    from: "actionable" | "watch" | "avoid";
    to: "actionable" | "watch" | "avoid";
  }[];
  scoreMovers: {
    sector: string;
    etf: string;
    from: number;
    to: number;
    delta: number;
  }[];
  trendFlips: {
    sector: string;
    etf: string;
    from: "UP" | "DOWN" | "FLAT";
    to: "UP" | "DOWN" | "FLAT";
  }[];
  dispersionChange: { from: number; to: number } | null;
  noHistory: boolean;
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
  const vixHigh = (regime?.vix ?? 0) > REGIME_CFG.VIX_EXTREME;
  // Use adaptive bounds when available — VIX > adaptive high covers sustained
  // elevated-vol regimes (25-29 range) where the static 30 threshold is too rigid.
  const vixAboveAdaptiveHigh = regime?.vixBounds
    ? regime.vix > regime.vixBounds.high
    : vixHigh;

  // CASH: RISK_OFF + elevated VIX + no rotations showing positive direction.
  // Two paths: (1) VIX > 30 (extreme), or (2) VIX > adaptive high + rising
  // (sustained stress). EXIT-conviction rotations now support CASH instead
  // of blocking it — they signal capital is leaving, not entering.
  const nonExitConviction = convictions.filter((c) => c.level !== "EXIT" && c.level !== "LOW");
  if (isRiskOff && nonExitConviction.length === 0 && (vixHigh || (vixAboveAdaptiveHigh && vixRising))) {
    return {
      posture: "CASH",
      reasoning: vixHigh
        ? "Risk-off regime with extreme VIX and no active rotations showing conviction. Capital preservation is priority."
        : "Risk-off regime with VIX above adaptive ceiling and rising. No rotations with conviction — reduce exposure.",
    };
  }

  // DEFENSIVE: RISK_OFF with no conviction OR VIX rising + majority weak.
  // Mild RISK_OFF with high/moderate conviction rotations falls through to
  // SELECTIVE — strong sector momentum can persist even in risk-off regimes.
  if (
    (isRiskOff && nonExitConviction.length === 0) ||
    (!isRiskOff && vixRising && weakeningLagging.length > leadingImproving.length)
  ) {
    return {
      posture: "DEFENSIVE",
      reasoning: isRiskOff
        ? "Risk-off macro regime with no active rotations showing conviction. Favor defensive sectors, reduce equity exposure."
        : "VIX rising with majority of sectors weakening or lagging. Reduce risk.",
    };
  }

  // Compute leadership health for posture modulation
  const leadershipHealth = data.leadershipBasketScores?.length
    ? computeLeadershipHealth(
        data.leadershipBasketScores,
        data.crossAssetScores ?? [],
        data.sectors,
        data.subSectorScores ?? [],
      )
    : null;
  // Hysteresis buffer: leadership must drop clearly below threshold (50 - 3 = 47)
  // to trigger narrow flag. Prevents posture oscillation from 1-2 point noise.
  const narrowLeadership = leadershipHealth && (leadershipHealth.score < (RISK_FLAGS.NARROW_LEADERSHIP - RISK_FLAGS.NARROW_LEADERSHIP_BUFFER) || leadershipHealth.megaCapDominant);

  // AGGRESSIVE: RISK_ON + sufficient rotations + dispersion
  // Capped at SELECTIVE if leadership is narrow (mega-cap dominated or score < 50)
  if (
    isRiskOn &&
    highModerate.length >= POSTURE.AGGRESSIVE_MIN_ROTATIONS &&
    data.dispersionIndex > POSTURE.AGGRESSIVE_MIN_DISPERSION
  ) {
    if (narrowLeadership) {
      return {
        posture: "SELECTIVE",
        reasoning: `Risk-on regime with ${highModerate.length} high-conviction rotations, but leadership is ${leadershipHealth!.label.toLowerCase()} (score ${leadershipHealth!.score}). Rally breadth too narrow for full aggression.`,
      };
    }
    return {
      posture: "AGGRESSIVE",
      reasoning: `Risk-on regime with ${highModerate.length} high-conviction rotations and elevated sector dispersion (${data.dispersionIndex.toFixed(1)}). Lean into strongest sectors.`,
    };
  }

  // SELECTIVE: RISK_ON/MIXED + ≥1 active rotation with MODERATE+ OR ≥3 sectors LEADING/IMPROVING
  if (
    (isRiskOn || regime?.regime === "MIXED") &&
    (highModerate.length >= POSTURE.SELECTIVE_MIN_ROTATIONS || leadingImproving.length >= POSTURE.SELECTIVE_MIN_SECTORS)
  ) {
    return {
      posture: "SELECTIVE",
      reasoning:
        highModerate.length >= 1
          ? `${highModerate.length} rotation(s) with moderate+ conviction. Be selective — focus on highest-conviction sectors.`
          : `${leadingImproving.length} sectors in leading/improving quadrant. Opportunities exist but be disciplined.`,
    };
  }

  // Default SELECTIVE for anything else
  return {
    posture: "SELECTIVE",
    reasoning:
      "Mixed market conditions. Focus on individual sector strength rather than broad exposure.",
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
      // Hysteresis: sectors with positive acceleration get a 2-point buffer on the
      // actionable threshold, reducing tier oscillation from daily composite noise.
      const effectiveThreshold = s.acceleration > 0
        ? COMPOSITE.ACTIONABLE_THRESHOLD - COMPOSITE.ACTIONABLE_HYSTERESIS
        : COMPOSITE.ACTIONABLE_THRESHOLD;
      // Path 1: Composite meets (buffered) threshold + favorable quadrant
      // Path 2: Active rotation with HIGH/MODERATE conviction + favorable quadrant (composite waived)
      if (
        inFavorableQuadrant &&
        (s.compositeScore >= effectiveThreshold || highConvictionETFs.has(s.etf))
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

  // 1. LEADING sector with negative acceleration (skip if flag #9 will cover with more specific rollover flag)
  for (const s of data.sectors) {
    if (s.quadrant === "LEADING" && s.acceleration < 0) {
      if (s.rotationVelocity > RISK_FLAGS.HIGH_ROTATION_VELOCITY && s.acceleration < RISK_FLAGS.ROLLOVER_ACCEL) continue;
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

  // 3. VIX rising (or regime unavailable — flag incomplete risk assessment)
  if (!data.regime) {
    flags.push({
      severity: "medium",
      message: "Regime data unavailable",
      detail: "Cannot assess VIX-based risk flags — macro regime fetch failed. Risk assessment is incomplete.",
    });
  } else if (data.regime.vixSlope === "rising") {
    flags.push({
      severity: "high",
      message: "VIX rising",
      detail: `VIX at ${data.regime.vix.toFixed(1)} with rising slope. Market uncertainty increasing.`,
    });
  }

  // 4. Sector data quality below threshold
  for (const s of data.sectors) {
    if (s.dataQuality < RISK_FLAGS.LOW_DATA_QUALITY) {
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
      if (ended.daysActive < ROTATION.MIN_ROTATION_DAYS) {
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
  // Only checks when regime is available — already flagged above when missing.
  if (data.regime && data.dispersionIndex > RISK_FLAGS.PANIC_DISPERSION && data.regime.regime === "RISK_OFF") {
    flags.push({
      severity: "high",
      message: "Panic rotation detected",
      detail: `High dispersion (${data.dispersionIndex.toFixed(1)}) in risk-off regime. Sector divergence may indicate panic selling in cyclicals.`,
    });
  }

  // 8. Narrow leadership — concentration risk
  if (data.leadershipBasketScores?.length) {
    const lh = computeLeadershipHealth(
      data.leadershipBasketScores,
      data.crossAssetScores ?? [],
      data.sectors,
      data.subSectorScores ?? [],
    );
    if (lh) {
      if (lh.score < RISK_FLAGS.DETERIORATING_LEADERSHIP) {
        flags.push({
          severity: "high",
          message: "Leadership deteriorating",
          detail: `Leadership health score ${lh.score} (${lh.label}). ${lh.summary}`,
        });
      } else if (lh.score < RISK_FLAGS.NARROW_LEADERSHIP || (lh.megaCapDominant && !lh.broadening)) {
        flags.push({
          severity: "medium",
          message: "Narrow leadership",
          detail: `Leadership health score ${lh.score} (${lh.label}). ${lh.megaCapDominant ? "Mega-caps dominating — breadth risk." : lh.summary}`,
        });
      }
    }
  }

  // 9. High rotation velocity + negative acceleration (momentum rollover risk)
  for (const s of data.sectors) {
    if (s.rotationVelocity > RISK_FLAGS.HIGH_ROTATION_VELOCITY && s.acceleration < RISK_FLAGS.ROLLOVER_ACCEL && s.quadrant === "LEADING") {
      flags.push({
        severity: "medium",
        message: `${s.sector} momentum rollover risk`,
        detail: `High rotation velocity (${s.rotationVelocity.toFixed(2)}) with negative acceleration (${s.acceleration.toFixed(2)}). May be rapidly transitioning out of LEADING.`,
      });
    }
  }

  // 10. Cross-asset risk-off signals (GLD/TLT rising = money leaving equities)
  if (data.crossAssetScores) {
    const gld = data.crossAssetScores.find((s) => s.etf === "GLD");
    const tlt = data.crossAssetScores.find((s) => s.etf === "TLT");
    const gldRising = gld && gld.acceleration > RISK_FLAGS.CROSS_ASSET_RISK_OFF_ACCEL;
    const tltRising = tlt && tlt.acceleration > RISK_FLAGS.CROSS_ASSET_RISK_OFF_ACCEL;
    if (gldRising && tltRising) {
      flags.push({
        severity: "high",
        message: "Cross-asset risk-off: GLD + TLT rising",
        detail: "Both gold and treasuries showing positive acceleration — money may be leaving equities for safe havens.",
      });
    } else if (gldRising || tltRising) {
      const rising = gldRising ? "Gold (GLD)" : "Treasuries (TLT)";
      flags.push({
        severity: "medium",
        message: `${rising} accelerating`,
        detail: `${rising} showing positive acceleration — potential risk-off signal.`,
      });
    }
  }

  return flags;
}

// ── What Changed ──

const POSTURE_KEY = "ew-brief-posture";

interface PostureStore {
  date: string;
  posture: MarketPosture;
}

export function savePosture(posture: MarketPosture): void {
  if (typeof window === "undefined") return;
  const date = new Date().toISOString().slice(0, 10);
  try {
    localStorage.setItem(POSTURE_KEY, JSON.stringify({ date, posture }));
  } catch { /* ignore */ }
}

export function loadPreviousPosture(): MarketPosture | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POSTURE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as PostureStore;
    const today = new Date().toISOString().slice(0, 10);
    // Return stored posture only if it's from a previous day
    if (store.date === today) return null;
    return store.posture;
  } catch {
    return null;
  }
}

function classifyTransition(from: RRGQuadrant, to: RRGQuadrant): TransitionCategory {
  if (from === "LAGGING" && to === "IMPROVING") return "rotation_starting";
  if (from === "IMPROVING" && to === "LEADING") return "breakout_confirmed";
  if (from === "LEADING" && to === "WEAKENING") return "momentum_fading";
  if (from === "WEAKENING" && to === "LAGGING") return "rotation_out";
  return "other";
}

function snapshotTier(
  s: SectorSnapshot,
  highConvictionETFs?: Set<string>,
): "actionable" | "watch" | "avoid" {
  const action = getTradingAction({
    quadrant: s.quadrant,
    compositeScore: s.compositeScore,
    acceleration: s.acceleration,
  });
  const inFavorableQuadrant =
    s.quadrant === "LEADING" || (s.quadrant === "IMPROVING" && s.acceleration > 0);
  const hasConviction = highConvictionETFs?.has(s.etf) ?? false;

  if (action === "TRADE" || action === "BUILD") {
    const effectiveThreshold = s.acceleration > 0
      ? COMPOSITE.ACTIONABLE_THRESHOLD - COMPOSITE.ACTIONABLE_HYSTERESIS
      : COMPOSITE.ACTIONABLE_THRESHOLD;
    return inFavorableQuadrant && (s.compositeScore >= effectiveThreshold || hasConviction) ? "actionable" : "watch";
  }
  if (action === "WATCH") {
    return inFavorableQuadrant && hasConviction ? "actionable" : "watch";
  }
  return "avoid";
}

export function computeWhatChanged(
  data: SectorRotationResult,
  currentPosture: MarketPosture,
  previousSnapshot: DailySnapshot | null,
  previousPosture: MarketPosture | null,
  rotationData?: RotationTrackerResult | null,
): WhatChangedResult {
  if (!previousSnapshot) {
    return {
      postureChange: null,
      quadrantTransitions: [],
      tierChanges: [],
      scoreMovers: [],
      trendFlips: [],
      dispersionChange: null,
      noHistory: true,
    };
  }

  // Build high-conviction ETF set from rotation data (used for tier classification)
  const highConvictionETFs = new Set<string>();
  if (rotationData) {
    for (const r of rotationData.activeRotations) {
      const conviction = computeConviction(r.event);
      if (conviction.level === "HIGH" || conviction.level === "MODERATE") {
        highConvictionETFs.add(r.event.etf);
      }
    }
  }

  // Build lookup from previous snapshot by sector name
  const prevMap = new Map<string, SectorSnapshot>();
  for (const s of previousSnapshot.sectors) {
    prevMap.set(s.sector, s);
  }

  // Posture change
  const postureChange =
    previousPosture && previousPosture !== currentPosture
      ? { from: previousPosture, to: currentPosture }
      : null;

  // Quadrant transitions (including new sectors not in previous snapshot)
  const quadrantTransitions: WhatChangedResult["quadrantTransitions"] = [];
  for (const curr of data.sectors) {
    const prev = prevMap.get(curr.sector);
    if (prev && prev.quadrant !== curr.quadrant) {
      quadrantTransitions.push({
        sector: curr.sector,
        etf: curr.etf,
        from: prev.quadrant,
        to: curr.quadrant,
        category: classifyTransition(prev.quadrant, curr.quadrant),
      });
    } else if (!prev) {
      // New sector not in previous snapshot — treat as entering from LAGGING
      quadrantTransitions.push({
        sector: curr.sector,
        etf: curr.etf,
        from: "LAGGING",
        to: curr.quadrant,
        category: classifyTransition("LAGGING", curr.quadrant),
      });
    }
  }

  // Tier changes — use highConvictionETFs for both prev and curr tier to match computeSectorTiers
  const tierChanges: WhatChangedResult["tierChanges"] = [];
  for (const curr of data.sectors) {
    const prev = prevMap.get(curr.sector);
    if (!prev) continue;
    const prevTier = snapshotTier(prev, highConvictionETFs);
    const currAction = getTradingAction(curr);
    const currFavorable =
      curr.quadrant === "LEADING" || (curr.quadrant === "IMPROVING" && curr.acceleration > 0);
    const currHasConviction = highConvictionETFs.has(curr.etf);
    let currTier: "actionable" | "watch" | "avoid";
    if (currAction === "TRADE" || currAction === "BUILD") {
      const currEffective = curr.acceleration > 0
        ? COMPOSITE.ACTIONABLE_THRESHOLD - COMPOSITE.ACTIONABLE_HYSTERESIS
        : COMPOSITE.ACTIONABLE_THRESHOLD;
      currTier = currFavorable && (curr.compositeScore >= currEffective || currHasConviction) ? "actionable" : "watch";
    } else if (currAction === "WATCH") {
      currTier = currFavorable && currHasConviction ? "actionable" : "watch";
    } else {
      currTier = "avoid";
    }
    if (prevTier !== currTier) {
      tierChanges.push({
        sector: curr.sector,
        etf: curr.etf,
        from: prevTier,
        to: currTier,
      });
    }
  }

  // Score movers (|delta| > 3)
  const scoreMovers: WhatChangedResult["scoreMovers"] = [];
  for (const curr of data.sectors) {
    const prev = prevMap.get(curr.sector);
    if (!prev) continue;
    const delta = curr.compositeScore - prev.compositeScore;
    if (Math.abs(delta) > RISK_FLAGS.SCORE_MOVER_DELTA) {
      scoreMovers.push({
        sector: curr.sector,
        etf: curr.etf,
        from: prev.compositeScore,
        to: curr.compositeScore,
        delta,
      });
    }
  }
  // Sort by absolute delta descending
  scoreMovers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Trend flips
  const trendFlips: WhatChangedResult["trendFlips"] = [];
  for (const curr of data.sectors) {
    const prev = prevMap.get(curr.sector);
    if (prev && prev.trend !== curr.trend) {
      trendFlips.push({
        sector: curr.sector,
        etf: curr.etf,
        from: prev.trend,
        to: curr.trend,
      });
    }
  }

  // Dispersion change (flag if delta > 2)
  const dispDelta = Math.abs(data.dispersionIndex - previousSnapshot.dispersionIndex);
  const dispersionChange =
    dispDelta > RISK_FLAGS.DISPERSION_CHANGE
      ? { from: previousSnapshot.dispersionIndex, to: data.dispersionIndex }
      : null;

  return {
    postureChange,
    quadrantTransitions,
    tierChanges,
    scoreMovers,
    trendFlips,
    dispersionChange,
    noHistory: false,
  };
}
