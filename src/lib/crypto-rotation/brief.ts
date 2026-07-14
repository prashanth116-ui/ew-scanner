/**
 * Crypto synthesis functions for the Crypto Daily Brief.
 * Adapted from equity brief.ts — all computations are deterministic.
 * No side effects except localStorage for snapshot persistence.
 */

import type {
  SectorRotationScore,
  RRGQuadrant,
} from "../sector-rotation/types";
import type { CryptoRotationResult } from "./types";
import type { RotationTrackerResult } from "../sector-rotation/rotation-types";
import { computeConviction } from "../sector-rotation/rotation-helpers";
import { getTradingAction } from "@/app/sectors/_components";
import { CRYPTO_BRIEF as CB, RISK_FLAGS } from "../sector-rotation/config";

// ── Shared types (reused from equity brief) ──

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

// ── Crypto-specific types ──

export interface CryptoSnapshot {
  date: string;
  sectors: Array<{
    name: string;
    composite: number;
    quadrant: RRGQuadrant;
    trend: "UP" | "DOWN" | "FLAT";
    acceleration: number;
    mansfieldRS: number;
  }>;
  dispersionIndex: number;
  regime: string;
}

export interface BiasSignal {
  label: string;
  value: number; // contribution to score
  direction: "bullish" | "bearish" | "neutral";
}

// ── Market Posture (Crypto) ──

export function computeCryptoPosture(
  data: CryptoRotationResult,
  rotationData: RotationTrackerResult | null
): PostureResult {
  const regime = data.regime;
  const btcDom = data.btcDominance;
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
  // For crypto, vix = BTC realized vol; vixSlope is inverted marketTrend
  const btcVol = regime?.vix ?? 0;
  const btcVolHigh = btcVol > CB.BTC_VOL_SPIKE;
  const marketFalling = regime?.vixSlope === "rising"; // inverted: vixSlope="rising" means marketTrend="falling"

  // Low-confidence regime: cap posture at SELECTIVE (don't act aggressively on uncertain signals)
  const regimeConfidence = regime?.regimeConfidence ?? 20; // numeric: 80=high, 50=medium, 20=low

  // CASH: RISK_OFF + BTC vol > 80 + 0 active rotations with positive conviction
  if (isRiskOff && btcVolHigh && positiveConviction.length === 0) {
    return {
      posture: "CASH",
      reasoning:
        "Risk-off regime with extreme BTC volatility and no active rotations showing positive conviction. Capital preservation is priority.",
    };
  }

  // DEFENSIVE: RISK_OFF OR (market falling + majority sectors WEAKENING/LAGGING)
  if (
    isRiskOff ||
    (marketFalling && weakeningLagging.length > leadingImproving.length)
  ) {
    return {
      posture: "DEFENSIVE",
      reasoning: isRiskOff
        ? "Risk-off crypto regime. Favor stablecoins and reduce exposure."
        : "Market trend falling with majority of sectors weakening or lagging. Reduce risk.",
    };
  }

  // AGGRESSIVE: RISK_ON + altSeasonSignal + 2+ active rotations with HIGH/MODERATE + dispersion > 5
  if (
    isRiskOn &&
    btcDom?.altSeasonSignal &&
    highModerate.length >= 2 &&
    data.dispersionIndex > CB.AGGRESSIVE_DISPERSION
  ) {
    return {
      posture: "AGGRESSIVE",
      reasoning: `Risk-on regime with alt-season signal, ${highModerate.length} high-conviction rotations, and elevated sector dispersion (${data.dispersionIndex.toFixed(1)}). Lean into strongest alt sectors.`,
    };
  }

  // AGGRESSIVE (relaxed): RISK_ON + 2+ high/moderate rotations + dispersion > 5 (no alt-season required)
  if (isRiskOn && highModerate.length >= 2 && data.dispersionIndex > CB.AGGRESSIVE_DISPERSION) {
    return {
      posture: "AGGRESSIVE",
      reasoning: `Risk-on regime with ${highModerate.length} high-conviction rotations and elevated sector dispersion (${data.dispersionIndex.toFixed(1)}). Lean into strongest sectors.`,
    };
  }

  // Low-confidence guard: downgrade AGGRESSIVE to SELECTIVE when regime confidence is low
  // (this point is only reached if CASH/DEFENSIVE didn't trigger)
  if (regimeConfidence < CB.LOW_CONFIDENCE_THRESHOLD && isRiskOn) {
    return {
      posture: "SELECTIVE",
      reasoning: `Risk-on regime but low confidence (${regimeConfidence}%). Be selective until regime signals strengthen.`,
    };
  }

  // SELECTIVE: RISK_ON/MIXED + 1+ active rotation with MODERATE+ OR 3+ sectors LEADING/IMPROVING
  if (
    (isRiskOn || regime?.regime === "MIXED") &&
    (highModerate.length >= 1 || leadingImproving.length >= 3)
  ) {
    return {
      posture: "SELECTIVE",
      reasoning:
        highModerate.length >= 1
          ? `${highModerate.length} rotation(s) with moderate+ conviction. Be selective — focus on highest-conviction crypto sectors.`
          : `${leadingImproving.length} sectors in leading/improving quadrant. Opportunities exist but be disciplined.`,
    };
  }

  // Default SELECTIVE
  return {
    posture: "SELECTIVE",
    reasoning:
      "Mixed crypto market conditions. Focus on individual sector strength rather than broad exposure.",
  };
}

// ── Sector Tiers (Crypto) ──

export function computeCryptoTiers(
  sectors: SectorRotationScore[],
  rotationData: RotationTrackerResult | null
): SectorTiers {
  const actionable: SectorRotationScore[] = [];
  const watch: SectorRotationScore[] = [];
  const avoid: SectorRotationScore[] = [];

  // Build set of ETF tickers with HIGH or MODERATE conviction from active rotations
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
      s.quadrant === "LEADING" ||
      (s.quadrant === "IMPROVING" && s.acceleration > 0);

    if (action === "TRADE" || action === "BUILD") {
      // Actionable: composite >= 55 + favorable quadrant (lower threshold than equity's 60)
      // OR: active rotation with HIGH/MODERATE conviction + favorable quadrant
      if (
        inFavorableQuadrant &&
        (s.compositeScore >= CB.ACTIONABLE_COMPOSITE || highConvictionETFs.has(s.etf))
      ) {
        actionable.push(s);
      } else {
        watch.push(s);
      }
    } else if (action === "WATCH") {
      // Promote WATCH sectors if HIGH/MODERATE conviction + favorable quadrant
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

// ── Risk Flags (Crypto) ──

export function computeCryptoRiskFlags(
  data: CryptoRotationResult,
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

  // 3. BTC realized volatility spike
  const btcVol = data.regime?.vix ?? 0;
  if (btcVol > CB.BTC_VOL_SPIKE) {
    flags.push({
      severity: "high",
      message: "BTC volatility spike",
      detail: `BTC realized volatility at ${btcVol.toFixed(1)}% (> ${CB.BTC_VOL_SPIKE}%). Extreme market uncertainty.`,
    });
  }

  // 4. Sector data quality < 50%
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
      if (ended.daysActive < 5) {
        flags.push({
          severity: "medium",
          message: `${ended.sectorName} false start`,
          detail: `Rotation lasted only ${ended.daysActive} day(s) before ending. Likely not a true rotation.`,
        });
      }
    }
  }

  // 6. Correlation breakdown
  if (data.correlationBreak) {
    flags.push({
      severity: "high",
      message: "Correlation breakdown detected",
      detail:
        "Cross-sector correlations have broken down. Unusual market stress or regime change in progress.",
    });
  }

  // 7. High dispersion + regime RISK_OFF (panic rotation)
  if (data.dispersionIndex > CB.PANIC_DISPERSION && data.regime?.regime === "RISK_OFF") {
    flags.push({
      severity: "high",
      message: "Panic rotation detected",
      detail: `High dispersion (${data.dispersionIndex.toFixed(1)}) in risk-off regime. Sector divergence may indicate panic selling in high-beta sectors.`,
    });
  }

  // 8. BTC dominance rising sharply — flight to safety
  if (data.btcDominance?.trend === "rising") {
    flags.push({
      severity: "medium",
      message: "BTC dominance rising",
      detail:
        "BTC dominance trending up. Money flowing from alts back to BTC — flight to safety signal.",
    });
  }

  return flags;
}

// ── What Changed (Crypto) ──

function classifyTransition(
  from: RRGQuadrant,
  to: RRGQuadrant
): TransitionCategory {
  if (from === "LAGGING" && to === "IMPROVING") return "rotation_starting";
  if (from === "IMPROVING" && to === "LEADING") return "breakout_confirmed";
  if (from === "LEADING" && to === "WEAKENING") return "momentum_fading";
  if (from === "WEAKENING" && to === "LAGGING") return "rotation_out";
  return "other";
}

function snapshotTier(
  s: CryptoSnapshot["sectors"][number]
): "actionable" | "watch" | "avoid" {
  const action = getTradingAction({
    quadrant: s.quadrant,
    compositeScore: s.composite,
    acceleration: s.acceleration,
  });
  const inFavorableQuadrant =
    s.quadrant === "LEADING" ||
    (s.quadrant === "IMPROVING" && s.acceleration > 0);

  if (action === "TRADE" || action === "BUILD") {
    return inFavorableQuadrant && s.composite >= CB.ACTIONABLE_COMPOSITE ? "actionable" : "watch";
  }
  if (action === "WATCH") return "watch";
  return "avoid";
}

export function computeCryptoWhatChanged(
  data: CryptoRotationResult,
  currentPosture: MarketPosture,
  previousSnapshot: CryptoSnapshot | null,
  previousPosture: MarketPosture | null
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

  // Build lookup from previous snapshot by sector name
  const prevMap = new Map<
    string,
    CryptoSnapshot["sectors"][number]
  >();
  for (const s of previousSnapshot.sectors) {
    prevMap.set(s.name, s);
  }

  // Posture change
  const postureChange =
    previousPosture && previousPosture !== currentPosture
      ? { from: previousPosture, to: currentPosture }
      : null;

  // Quadrant transitions
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
    }
  }

  // Tier changes
  const tierChanges: WhatChangedResult["tierChanges"] = [];
  for (const curr of data.sectors) {
    const prev = prevMap.get(curr.sector);
    if (!prev) continue;
    const prevTier = snapshotTier(prev);
    const currAction = getTradingAction(curr);
    const currFavorable =
      curr.quadrant === "LEADING" ||
      (curr.quadrant === "IMPROVING" && curr.acceleration > 0);
    let currTier: "actionable" | "watch" | "avoid";
    if (currAction === "TRADE" || currAction === "BUILD") {
      currTier = currFavorable && curr.compositeScore >= 55 ? "actionable" : "watch";
    } else if (currAction === "WATCH") {
      currTier = "watch";
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
    const delta = curr.compositeScore - prev.composite;
    if (Math.abs(delta) > 3) {
      scoreMovers.push({
        sector: curr.sector,
        etf: curr.etf,
        from: prev.composite,
        to: curr.compositeScore,
        delta,
      });
    }
  }
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
  const dispDelta = Math.abs(
    data.dispersionIndex - previousSnapshot.dispersionIndex
  );
  const dispersionChange =
    dispDelta > 2
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

// ── Crypto Bias Score ──

export function computeCryptoBiasScore(
  data: CryptoRotationResult
): { score: number; signals: BiasSignal[] } {
  const signals: BiasSignal[] = [];
  let score = 0;

  // 1. BTC 24h return from stockQuotes (if available)
  const btcQuote = data.stockQuotes?.["BTC-USD"];
  if (btcQuote) {
    const btcReturn = btcQuote.pctFromSma50 ?? 0;
    if (btcReturn > CB.BTC_RETURN_THRESHOLD) {
      signals.push({ label: "BTC above 50MA", value: 2, direction: "bullish" });
      score += 2;
    } else if (btcReturn < -CB.BTC_RETURN_THRESHOLD) {
      signals.push({ label: "BTC below 50MA", value: -2, direction: "bearish" });
      score -= 2;
    } else {
      signals.push({ label: "BTC near 50MA", value: 0, direction: "neutral" });
    }
  }

  // 2. BTC dominance trend
  if (data.btcDominance) {
    if (data.btcDominance.trend === "falling") {
      signals.push({
        label: "BTC.D falling (alt-friendly)",
        value: 1,
        direction: "bullish",
      });
      score += 1;
    } else if (data.btcDominance.trend === "rising") {
      signals.push({
        label: "BTC.D rising (alt-unfriendly)",
        value: -1,
        direction: "bearish",
      });
      score -= 1;
    } else {
      signals.push({
        label: "BTC.D flat",
        value: 0,
        direction: "neutral",
      });
    }
  }

  // 3. Alt season signal
  if (data.btcDominance?.altSeasonSignal) {
    signals.push({
      label: "Alt season active",
      value: 2,
      direction: "bullish",
    });
    score += 2;
  }

  // 4. Regime
  const regime = data.regime?.regime;
  if (regime === "RISK_ON") {
    signals.push({ label: "Risk-on regime", value: 2, direction: "bullish" });
    score += 2;
  } else if (regime === "RISK_OFF") {
    signals.push({ label: "Risk-off regime", value: -2, direction: "bearish" });
    score -= 2;
  } else {
    signals.push({ label: "Mixed regime", value: 0, direction: "neutral" });
  }

  // 5. Sector dispersion
  if (data.dispersionIndex > CB.BIAS_DISPERSION_HIGH) {
    signals.push({
      label: `High dispersion (${data.dispersionIndex.toFixed(1)})`,
      value: 1,
      direction: "bullish",
    });
    score += 1;
  } else if (data.dispersionIndex < CB.BIAS_DISPERSION_LOW) {
    signals.push({
      label: `Low dispersion (${data.dispersionIndex.toFixed(1)})`,
      value: -1,
      direction: "bearish",
    });
    score -= 1;
  }

  // 6. Rotation activity
  if (data.rotationActive) {
    signals.push({
      label: "Rotation active",
      value: 1,
      direction: "bullish",
    });
    score += 1;
  }

  // 7. Sector balance (leading vs lagging)
  const leading = data.sectors.filter(
    (s) => s.quadrant === "LEADING" || s.quadrant === "IMPROVING"
  ).length;
  const lagging = data.sectors.filter(
    (s) => s.quadrant === "LAGGING" || s.quadrant === "WEAKENING"
  ).length;
  if (leading > lagging + CB.SECTOR_BALANCE_THRESHOLD) {
    signals.push({
      label: `${leading} sectors improving/leading`,
      value: 1,
      direction: "bullish",
    });
    score += 1;
  } else if (lagging > leading + CB.SECTOR_BALANCE_THRESHOLD) {
    signals.push({
      label: `${lagging} sectors weakening/lagging`,
      value: -1,
      direction: "bearish",
    });
    score -= 1;
  }

  // Clamp to [-10, +10]
  score = Math.max(-10, Math.min(10, score));

  return { score, signals };
}

// ── Snapshot Persistence ──

const SNAPSHOT_KEY = "ew-crypto-brief-snapshot";
const POSTURE_KEY = "ew-crypto-brief-posture";

interface SnapshotStore {
  snapshots: CryptoSnapshot[];
  version: number;
}

const MAX_SNAPSHOTS = 30;
const SCHEMA_VERSION = 1;

export function saveCryptoSnapshot(data: CryptoRotationResult): void {
  if (typeof window === "undefined") return;

  const date = new Date(data.calculatedAt).toISOString().slice(0, 10);

  const snapshot: CryptoSnapshot = {
    date,
    sectors: data.sectors.map((s) => ({
      name: s.sector,
      composite: s.compositeScore,
      quadrant: s.quadrant,
      trend: s.trend,
      acceleration: s.acceleration,
      mansfieldRS: s.mansfieldRS,
    })),
    dispersionIndex: data.dispersionIndex,
    regime: data.regime?.regime ?? "MIXED",
  };

  const store = loadSnapshotStore();

  // Dedup — replace existing snapshot for same date
  const idx = store.snapshots.findIndex((s) => s.date === date);
  if (idx >= 0) {
    store.snapshots[idx] = snapshot;
  } else {
    store.snapshots.push(snapshot);
  }

  // Sort newest first
  store.snapshots.sort((a, b) => b.date.localeCompare(a.date));

  // Prune
  if (store.snapshots.length > MAX_SNAPSHOTS) {
    store.snapshots = store.snapshots.slice(0, MAX_SNAPSHOTS);
  }

  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function loadPreviousCryptoSnapshot(): CryptoSnapshot | null {
  if (typeof window === "undefined") return null;
  const store = loadSnapshotStore();
  const today = new Date().toISOString().slice(0, 10);
  // Find most recent snapshot that ISN'T today
  return store.snapshots.find((s) => s.date !== today) ?? null;
}

export function saveCryptoPosture(posture: MarketPosture): void {
  if (typeof window === "undefined") return;
  const date = new Date().toISOString().slice(0, 10);
  try {
    localStorage.setItem(POSTURE_KEY, JSON.stringify({ date, posture }));
  } catch {
    /* ignore */
  }
}

export function loadPreviousCryptoPosture(): MarketPosture | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POSTURE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as { date: string; posture: MarketPosture };
    const today = new Date().toISOString().slice(0, 10);
    // Return stored posture only if it's from a previous day
    if (store.date === today) return null;
    return store.posture;
  } catch {
    return null;
  }
}

function loadSnapshotStore(): SnapshotStore {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return { snapshots: [], version: SCHEMA_VERSION };
    const store = JSON.parse(raw) as SnapshotStore;
    if ((store.version ?? 0) < SCHEMA_VERSION) {
      localStorage.removeItem(SNAPSHOT_KEY);
      return { snapshots: [], version: SCHEMA_VERSION };
    }
    return store;
  } catch {
    return { snapshots: [], version: SCHEMA_VERSION };
  }
}
