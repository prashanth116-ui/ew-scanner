/**
 * Inflection Engine scoring module — V3.
 *
 * Answers WHERE in the accumulation cycle a stock sits. Five components:
 *
 *   Supply Exhaustion 25% · Demand Emergence 25% · Compression 15%
 *   Runner Potential 25% · RS Trajectory 10%
 *
 * V3 removes every lagging input and adds the magnitude dimension:
 *   - RSI, EMA reclaim, higher-low counts, absolute RS levels and institutional
 *     ownership are gone. Each described the past rather than anticipating the move.
 *   - Their replacements are order-flow primitives: absorption, close-location
 *     persistence, pocket pivots, structural springs, range asymmetry, RVOL trajectory.
 *   - Runner Potential asks how far the stock can go, which nothing previously did.
 *   - The Liquidity multiplier is gone: against a universe already gated at $150M dollar
 *     volume it was a near-uniform haircut rather than a discriminator.
 *
 * Retained from V2: null-neutral aggregation, the 5-stage taxonomy, the trade reads.
 *
 * SERVER-ONLY: Used by /api/prerun/* routes.
 */

import "server-only";

import type {
  PreRunStockData,
  InflectionGates,
  InflectionScores,
  InflectionStage,
  InflectionTradeRead,
  InflectionResult,
} from "./types";
import { nullNeutralScore, type ScoreSlot } from "./score-slot";
import { scoreRunnerPotential } from "./runner-potential";
import { NEUTRAL_GATE, type RegimeGate } from "./regime-gate";

// ── Gates (lighter than institutional — targets inflection points, not leaders) ──

function evaluateGates(data: PreRunStockData): InflectionGates {
  const price = data.currentPrice ?? 0;
  const priceAbove5 = price >= 5;
  const avgDollarVolAbove10m = (data.vcpAvgDollarVolume ?? 0) >= 10_000_000;
  const mktCapAbove500m = (data.marketCap ?? 0) >= 500_000_000;
  const allPass = priceAbove5 && avgDollarVolAbove10m && mktCapAbove500m;
  return { priceAbove5, avgDollarVolAbove10m, mktCapAbove500m, allPass };
}

// ── 1. Supply Exhaustion (0-100, null-neutral) — weight 25% ──
//
// Are sellers done? Built entirely from participant behaviour: who is absorbing supply,
// whether a shakeout trapped sellers, and whether down bars are producing less result for
// the same effort. RSI and the raw pullback-depth ladder are gone — both described how far
// price had already fallen rather than whether the selling was finished.

function scoreSupplyExhaustion(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 1a. Absorption (0-25) — heavy volume, no downward range
  if (data.absorption !== null) {
    const a = data.absorption;
    let earned = 0;
    if (a >= 0.4) { earned = 25; evidence.push(`${(a * 100).toFixed(0)}% of down bars absorbed — a buyer is sitting on the bid`); }
    else if (a >= 0.25) { earned = 19; evidence.push(`${(a * 100).toFixed(0)}% of down bars absorbed`); }
    else if (a >= 0.12) { earned = 11; }
    else { caution.push("Selling is meeting no absorption"); }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1b. Structural spring (0-20) — shakeout below real structure, reclaimed
  if (data.structuralSpring !== null) {
    const s = data.structuralSpring;
    let earned = 0;
    if (s >= 2) { earned = 20; evidence.push("Spring — undercut of structure on volume, reclaimed and held"); }
    else if (s >= 1) { earned = 12; evidence.push("Shakeout below structure, reclaimed"); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1c. Range asymmetry (0-20) — down bars producing less range than up bars
  if (data.rangeAsymmetry !== null) {
    const r = data.rangeAsymmetry;
    let earned = 0;
    if (r >= 1.5) { earned = 20; evidence.push("Up bars far wider than down bars — supply drying up"); }
    else if (r >= 1.15) { earned = 15; evidence.push("Up bars wider than down bars"); }
    else if (r >= 0.95) { earned = 8; }
    else { caution.push("Down bars still producing more range than up bars"); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1d. Volume-price divergence (0-15) — null when no recent lower low exists
  if (data.vpDivergenceBullish !== null) {
    slots.push({ earned: data.vpDivergenceBullish ? 15 : 0, possible: 15, hasData: true });
    if (data.vpDivergenceBullish) evidence.push("Volume-price divergence: selling into lows is drying up");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1e. Down-day body contraction (0-20)
  if (data.avgDownDayBody !== null && data.avgDownDayBodyPrev !== null && data.avgDownDayBodyPrev > 0) {
    const ratio = data.avgDownDayBody / data.avgDownDayBodyPrev;
    let earned = 0;
    if (ratio <= 0.5) { earned = 20; evidence.push("Down-day bodies shrinking sharply"); }
    else if (ratio <= 0.7) { earned = 14; evidence.push("Down-day candles getting smaller"); }
    else if (ratio <= 0.9) { earned = 7; }
    else { caution.push("Down-day bodies not contracting"); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 2. Demand Emergence (0-100, null-neutral) — weight 25% ──
//
// Is someone stepping in? Close-location persistence and pocket pivots both read today's
// bar; RVOL trajectory reads the slope of participation. None of them wait for a moving
// average to cross, which is what the EMA-reclaim and higher-low slots they replace did.

function scoreDemandEmergence(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 2a. Close-location persistence (0-30) — institutions accumulate into the close
  const clv = data.closeLocationMean;
  if (clv !== null) {
    const flat = data.closeLocationFlat === true;
    let earned = 0;
    if (clv >= 0.65 && flat) { earned = 30; evidence.push("Closing near the highs while price goes nowhere — accumulation footprint"); }
    else if (clv >= 0.65) { earned = 22; evidence.push("Consistently closing in the upper part of the range"); }
    else if (clv >= 0.55) { earned = 16; }
    else if (clv >= 0.45) { earned = 8; }
    else { caution.push("Closing in the lower half of the daily range"); }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2b. Pocket pivots (0-30) — demand first outweighing all recent supply
  if (data.pocketPivots !== null) {
    const p = data.pocketPivots;
    let earned = 0;
    if (p >= 3) { earned = 30; evidence.push(`${p} pocket pivots — repeated institutional footprints`); }
    else if (p >= 2) { earned = 23; evidence.push(`${p} pocket pivots`); }
    else if (p >= 1) { earned = 14; evidence.push("Pocket pivot — up volume exceeded every recent down day"); }
    else { caution.push("No pocket pivots — demand has not outweighed supply"); }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2c. RVOL trajectory (0-20) — participation building ahead of price
  if (data.rvolTrajectory !== null) {
    const t = data.rvolTrajectory;
    let earned = 0;
    if (t >= 0.15) { earned = 20; evidence.push("Relative volume building sharply"); }
    else if (t >= 0.05) { earned = 15; evidence.push("Relative volume building"); }
    else if (t >= 0) { earned = 8; }
    else { caution.push("Participation fading"); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2d. OBV divergence (0-20) — stealth accumulation. Scored once, here only.
  if (data.obvDivergent !== null) {
    slots.push({ earned: data.obvDivergent ? 20 : 0, possible: 20, hasData: true });
    if (data.obvDivergent) evidence.push("OBV near the top of its range while price is not — stealth buying");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 3. Compression (0-100, null-neutral) — weight 15% ──
//
// Volatility contraction genuinely precedes expansion, so this component survives V2
// unchanged apart from the removal of the dry-volume slot, which now sits in nothing —
// volume behaviour belongs to the demand and supply components.

function scoreCompression(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 3a. ATR ratio 5/20 (0-30)
  if (data.atrRatio5v20 !== null) {
    const atrRatio = data.atrRatio5v20;
    let earned = 0;
    if (atrRatio <= 0.5) { earned = 30; evidence.push(`Extreme volatility compression (ATR ratio ${atrRatio.toFixed(2)})`); }
    else if (atrRatio <= 0.65) { earned = 24; evidence.push(`Strong volatility squeeze (ATR ratio ${atrRatio.toFixed(2)})`); }
    else if (atrRatio <= 0.8) { earned = 16; evidence.push("Volatility contracting"); }
    else if (atrRatio <= 0.95) { earned = 9; }
    else if (atrRatio <= 1.05) { earned = 3; }
    else { caution.push("Volatility expanding — no compression"); }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 3b. Nested range contraction (0-30)
  const r5 = data.vcpRange5d;
  const r10 = data.vcpRange10d;
  const r20 = data.vcpRange20d;
  if (r5 !== null && r10 !== null && r20 !== null && r20 > 0) {
    const ratio5v20 = r5 / r20;
    let earned = 0;
    if (r5 < r10 && r10 < r20 && ratio5v20 <= 0.35) {
      earned = 30; evidence.push(`Tight nested ranges (5d/20d: ${(ratio5v20 * 100).toFixed(0)}%)`);
    } else if (r5 < r10 && r10 < r20 && ratio5v20 <= 0.55) {
      earned = 24; evidence.push(`Nested ranges contracting (5d/20d: ${(ratio5v20 * 100).toFixed(0)}%)`);
    } else if (r5 < r10 && r10 < r20) {
      earned = 17; evidence.push("Ranges nesting (5d < 10d < 20d)");
    } else if (ratio5v20 <= 0.55) {
      earned = 12; evidence.push("5d range contracted vs 20d");
    } else if (r5 < r10) {
      earned = 6;
    }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 3c. Inside bars (0-20)
  if (data.vcpInsideBarCount !== null) {
    const bars = data.vcpInsideBarCount;
    let earned = 0;
    if (bars >= 3) { earned = 20; evidence.push(`${bars} inside bars — extreme compression`); }
    else if (bars >= 2) { earned = 14; evidence.push(`${bars} inside bars`); }
    else if (bars >= 1) { earned = 7; }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 3d. Tight closes (0-20)
  if (data.vcpTightCloses !== null) {
    slots.push({ earned: data.vcpTightCloses ? 20 : 0, possible: 20, hasData: true });
    if (data.vcpTightCloses) evidence.push("Tight cluster of closes — coiling");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 4. RS Trajectory (0-100, null-neutral) — weight 10% ──
//
// Acceleration only. The absolute RS levels that used to carry 30 of this component's 100
// points described the last 20 days; at an inflection point RS is negative by definition and
// the signal is the second derivative, not the level.

function scoreRSTrajectory(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  const rsAccel = data.instRsAccelVsSPY;
  const rsAccelTrend = data.instRsAccelTrend;

  // 4a. RS acceleration vs SPY (0-60)
  if (rsAccel !== null) {
    let earned = 0;
    if (rsAccel >= 5) { earned = 60; evidence.push("RS accelerating sharply vs SPY"); }
    else if (rsAccel >= 3) { earned = 48; evidence.push("RS acceleration positive"); }
    else if (rsAccel >= 1) { earned = 38; evidence.push("RS improving vs SPY"); }
    else if (rsAccel >= 0) { earned = 26; }
    else if (rsAccel >= -2 && (rsAccelTrend ?? 0) > 0) {
      earned = 30; evidence.push("RS trajectory turning while still negative — early inflection");
    } else if (rsAccel >= -3) { earned = 10; }
    else { caution.push("RS deteriorating vs SPY"); }
    slots.push({ earned, possible: 60, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 4b. Acceleration trend (0-40) — is the acceleration itself increasing?
  if (rsAccelTrend !== null) {
    let earned = 0;
    if (rsAccelTrend >= 2) { earned = 40; evidence.push("RS acceleration increasing day over day"); }
    else if (rsAccelTrend > 0.5) { earned = 30; }
    else if (rsAccelTrend > 0) { earned = 20; }
    else if (rsAccelTrend > -1) { earned = 8; }
    else { caution.push("RS momentum fading"); }
    slots.push({ earned, possible: 40, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}
// ── Stage Classification ──
// Fix 5: Thresholds lowered to match achievable score ranges.
// With null-neutral scoring, typical quality inflection stocks score 50-70.

// Stage answers WHERE in the cycle, using supply/demand/compression only. Runner Potential
// is deliberately excluded: how far a stock can move says nothing about where it currently
// sits, and letting magnitude leak into the stage would conflate the two questions the
// system exists to keep apart.

function classifyStage(
  se: number, compression: number, demand: number, rs: number,
  data: PreRunStockData,
): InflectionStage {
  const pctFromAth = data.pctFromAth ?? 100;

  // EXPANSION: near the highs with RS confirming
  if (pctFromAth < 10 && rs >= 40) return "EXPANSION";

  // EARLY_ACCUMULATION: demand clearly present
  if (demand >= 50 && rs >= 35 && se >= 30) return "EARLY_ACCUMULATION";
  // Alt path: strong demand compensates for weaker RS
  if (demand >= 55 && se >= 35 && compression >= 25) return "EARLY_ACCUMULATION";

  // INFLECTION: supply exhausted + compressed + demand starting
  if (se >= 40 && compression >= 30 && demand >= 25) return "INFLECTION";
  // Alt path: strong exhaustion + emerging demand without full compression
  if (se >= 50 && demand >= 30 && compression >= 15) return "INFLECTION";
  // Alt path: strong compression + decent exhaustion
  if (compression >= 50 && se >= 35 && demand >= 20) return "INFLECTION";

  // SELLER_EXHAUSTION: selling pressure declining, demand not yet present
  if (se >= 35 && compression >= 15) return "SELLER_EXHAUSTION";
  if (se >= 45) return "SELLER_EXHAUSTION";

  // DISTRIBUTION: default
  return "DISTRIBUTION";
}

// ── Trade Read ──
// Thresholds calibrated to actual score distribution (top stocks score 48-55).

export function determineTradeRead(
  stage: InflectionStage,
  overall: number,
  be: number,
  extensionRisk: boolean,
): InflectionTradeRead {
  if (stage === "DISTRIBUTION" || extensionRisk) return "AVOID";
  if (stage === "SELLER_EXHAUSTION") return "WATCH";

  // STARTER is evaluated before ADD_ON. The reverse order sent the strongest
  // early-accumulation names (BE >= 60) to ADD_ON, and isPrimarySignal requires
  // STARTER — so a stock at BE 59 was a primary signal and the same stock at BE 61
  // was not. ADD_ON now means what it says: the move has already started.
  if (stage === "INFLECTION" && overall >= 40) return "STARTER_POSITION_CANDIDATE";
  if (stage === "EARLY_ACCUMULATION" && overall >= 40) return "STARTER_POSITION_CANDIDATE";
  if (stage === "EXPANSION") return "ADD_ON_CONFIRMATION";
  if (stage === "EARLY_ACCUMULATION" && be >= 60) return "ADD_ON_CONFIRMATION";
  return "WATCH";
}

// ── Extension Risk ──

function checkExtensionRisk(data: PreRunStockData): boolean {
  const pctFromAth = data.pctFromAth ?? 100;
  const distEma = data.instDistFromEma20Atr ?? 0;
  return pctFromAth < 5 || distEma > 3;
}

// ── Invalidation Level ──

/**
 * Structural stop for the setup, in preference order.
 *
 * The most recent swing low comes first because this scanner targets stocks basing
 * BELOW the 50-day — for that population the SMA50 sits above price and the old logic
 * fell through to the 52-week low, frequently 30-40% away and unusable as a stop.
 * SMA50 remains the choice when price is above it; the 52-week low is the last resort.
 */
function calcInvalidationLevel(data: PreRunStockData): number | null {
  const price = data.currentPrice ?? 0;
  const swingLow = data.recentSwingLow ?? 0;
  const sma50 = data.vcpSma50 ?? 0;
  const low52w = data.low52w ?? 0;

  if (swingLow > 0 && price > 0 && swingLow < price) return swingLow;
  if (sma50 > 0 && sma50 < price) return sma50;
  if (low52w > 0) return low52w;
  return null;
}

// ── Main Scoring Function ──

export function scoreInflection(
  data: PreRunStockData,
  regimeGate: RegimeGate = NEUTRAL_GATE,
): InflectionResult {
  const gates = evaluateGates(data);

  const seResult = scoreSupplyExhaustion(data);
  const demandResult = scoreDemandEmergence(data);
  const compressionResult = scoreCompression(data);
  const runnerResult = scoreRunnerPotential(data);
  const rsResult = scoreRSTrajectory(data);

  // Straight weighted average — no multiplier. Liquidity is handled by the universe gate.
  const rawWeighted =
    seResult.score * 0.25 +          // Is supply finished?
    demandResult.score * 0.25 +      // Is demand appearing?
    compressionResult.score * 0.15 + // Is the spring wound?
    runnerResult.score * 0.25 +      // Can it actually move?
    rsResult.score * 0.10;           // Is relative strength turning?

  const overallScore = Number.isFinite(rawWeighted) ? Math.round(rawWeighted) : 0;

  const scores: InflectionScores = {
    supplyExhaustion: seResult.score,
    demandEmergence: demandResult.score,
    compression: compressionResult.score,
    runnerPotential: runnerResult.score,
    rsTrajectory: rsResult.score,
    overallScore,
  };

  const stage = classifyStage(seResult.score, compressionResult.score, demandResult.score, rsResult.score, data);
  const extensionRisk = checkExtensionRisk(data);
  const tradeRead = determineTradeRead(stage, overallScore, demandResult.score, extensionRisk);

  // Merge all evidence
  const bullishEvidence = [
    ...seResult.evidence,
    ...demandResult.evidence,
    ...compressionResult.evidence,
    ...runnerResult.evidence,
    ...rsResult.evidence,
  ];
  const cautionEvidence = [
    ...seResult.caution,
    ...demandResult.caution,
    ...compressionResult.caution,
    ...runnerResult.caution,
    ...rsResult.caution,
  ];

  const invalidationLevel = calcInvalidationLevel(data);

  // Regime gate raises the bar for the signal tiers without touching the score, so the
  // same setup needs more evidence to earn an alert in a hostile tape.
  if (regimeGate.scorePenalty > 0) cautionEvidence.push(regimeGate.label);

  // Signal classification calibrated to actual distribution
  const isPrimarySignal =
    overallScore >= 42 + regimeGate.scorePenalty &&
    (stage === "INFLECTION" || stage === "EARLY_ACCUMULATION") &&
    tradeRead === "STARTER_POSITION_CANDIDATE" &&
    !extensionRisk;

  // Nested inside primary so "stronger" is always a subset of "primary". Previously the
  // two were independent, so a SELLER_EXHAUSTION/WATCH stock could come back stronger
  // but not primary — contradictory badges on the same row.
  // Runner Potential is a requirement for the top tier, not just a contributor. A perfectly
  // formed base on a stock that cannot move is not a stronger signal.
  const isStrongerSignal =
    isPrimarySignal &&
    overallScore >= 50 + regimeGate.scorePenalty &&
    demandResult.score >= 50 &&
    seResult.score >= 45 &&
    runnerResult.score >= 50;

  return {
    data,
    gates,
    scores,
    stage,
    tradeRead,
    extensionRisk,
    bullishEvidence,
    cautionEvidence,
    invalidationLevel,
    isPrimarySignal,
    isStrongerSignal,
  };
}
