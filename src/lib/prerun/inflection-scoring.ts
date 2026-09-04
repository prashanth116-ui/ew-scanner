/**
 * Inflection Engine scoring module — V3.
 *
 * Answers WHERE in the accumulation cycle a stock sits. Five components:
 *
 *   Supply Exhaustion 25% · Demand Emergence 25% · Compression 15%
 *   Runner Potential 25% · RS Trajectory 10%
 *
 * Four of the five live HERE only as weights — Supply Exhaustion, Demand Emergence and
 * Runner Potential are shared modules, so they report identical numbers on both engines.
 * See supply-exhaustion.ts, demand-emergence.ts, runner-potential.ts. What this file owns
 * is Compression, RS Trajectory, the stage taxonomy and the trade reads.
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
import { weightedComposite, displayScore, measuredWeightPct, nullNeutralScore, slotCoveragePct, slotBreakdown, type ScoreSlot } from "./score-slot";
import { scoreRunnerPotential } from "./runner-potential";
import { scoreSupplyExhaustion, type ComponentResult } from "./supply-exhaustion";
import { scoreDemandEmergence } from "./demand-emergence";
import { scoreRSTrajectory } from "./rs-trajectory";
import { NEUTRAL_GATE, type RegimeGate } from "./regime-gate";
import { passesMarketCapFloor } from "./scoring";

// ── Gates (lighter than institutional — targets inflection points, not leaders) ──

function evaluateGates(data: PreRunStockData): InflectionGates {
  const price = data.currentPrice ?? 0;
  const priceAbove5 = price >= 5;
  const avgDollarVolAbove10m = (data.vcpAvgDollarVolume ?? 0) >= 10_000_000;
  const mktCapAbove500m = passesMarketCapFloor(data, 500_000_000);
  const allPass = priceAbove5 && avgDollarVolAbove10m && mktCapAbove500m;
  return { priceAbove5, avgDollarVolAbove10m, mktCapAbove500m, allPass };
}

// ── Compression (0-100, null-neutral) — weight 15% ──
//
// Volatility contraction genuinely precedes expansion, so this component survives V2
// unchanged apart from the removal of the dry-volume slot, which now sits in nothing —
// volume behaviour belongs to the demand and supply components.

function scoreCompression(data: PreRunStockData): ComponentResult {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // ATR ratio 5/20 (0-26)
  if (data.atrRatio5v20 !== null) {
    const atrRatio = data.atrRatio5v20;
    let earned = 0;
    if (atrRatio <= 0.5) { earned = 26; evidence.push(`Extreme volatility compression (ATR ratio ${atrRatio.toFixed(2)})`); }
    else if (atrRatio <= 0.65) { earned = 21; evidence.push(`Strong volatility squeeze (ATR ratio ${atrRatio.toFixed(2)})`); }
    else if (atrRatio <= 0.8) { earned = 14; evidence.push("Volatility contracting"); }
    else if (atrRatio <= 0.95) { earned = 8; }
    else if (atrRatio <= 1.05) { earned = 3; }
    else { caution.push("Volatility expanding — no compression"); }
    slots.push({ label: "atr_ratio_5_20", earned, possible: 26, hasData: true });
  } else {
    slots.push({ label: "atr_ratio_5_20", earned: 0, possible: 0, hasData: false });
  }

  // Nested range contraction (0-26)
  const r5 = data.vcpRange5d;
  const r10 = data.vcpRange10d;
  const r20 = data.vcpRange20d;
  if (r5 !== null && r10 !== null && r20 !== null && r20 > 0) {
    const ratio5v20 = r5 / r20;
    let earned = 0;
    if (r5 < r10 && r10 < r20 && ratio5v20 <= 0.35) {
      earned = 26; evidence.push(`Tight nested ranges (5d/20d: ${(ratio5v20 * 100).toFixed(0)}%)`);
    } else if (r5 < r10 && r10 < r20 && ratio5v20 <= 0.55) {
      earned = 21; evidence.push(`Nested ranges contracting (5d/20d: ${(ratio5v20 * 100).toFixed(0)}%)`);
    } else if (r5 < r10 && r10 < r20) {
      earned = 15; evidence.push("Ranges nesting (5d < 10d < 20d)");
    } else if (ratio5v20 <= 0.55) {
      earned = 10; evidence.push("5d range contracted vs 20d");
    } else if (r5 < r10) {
      earned = 5;
    }
    slots.push({ label: "nested_range_contraction", earned, possible: 26, hasData: true });
  } else {
    slots.push({ label: "nested_range_contraction", earned: 0, possible: 0, hasData: false });
  }

  // Inside bars (0-16)
  if (data.vcpInsideBarCount !== null) {
    const bars = data.vcpInsideBarCount;
    let earned = 0;
    if (bars >= 3) { earned = 16; evidence.push(`${bars} inside bars — extreme compression`); }
    else if (bars >= 2) { earned = 11; evidence.push(`${bars} inside bars`); }
    else if (bars >= 1) { earned = 5; }
    slots.push({ label: "inside_bars", earned, possible: 16, hasData: true });
  } else {
    slots.push({ label: "inside_bars", earned: 0, possible: 0, hasData: false });
  }

  // Tight closes (0-16)
  if (data.vcpTightCloses !== null) {
    slots.push({ label: "tight_closes", earned: data.vcpTightCloses ? 16 : 0, possible: 16, hasData: true });
    if (data.vcpTightCloses) evidence.push("Tight cluster of closes — coiling");
  } else {
    slots.push({ label: "tight_closes", earned: 0, possible: 0, hasData: false });
  }


  // Dry volume days (0-16) — restored from V2. Volume drying up inside a base means supply
  // has been absorbed and there is nothing left to sell at these prices. It is the volume
  // half of compression, and the V3 rebuild dropped it.
  if (data.vcpDryVolumeDays !== null) {
    const dry = data.vcpDryVolumeDays;
    let earned = 0;
    if (dry >= 5) { earned = 16; evidence.push(`${dry} dry volume days — supply absorbed`); }
    else if (dry >= 3) { earned = 11; evidence.push(`${dry} dry volume days`); }
    else if (dry >= 2) { earned = 6; }
    else if (dry >= 1) { earned = 2; }
    slots.push({ label: "dry_volume_days", earned, possible: 16, hasData: true });
  } else {
    slots.push({ label: "dry_volume_days", earned: 0, possible: 0, hasData: false });
  }
  return { score: nullNeutralScore(slots), coverage: slotCoveragePct(slots), evidence, caution, slots: slotBreakdown(slots) };
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

  // Demand gates are anchored to the OBSERVED distribution of the Demand Emergence
  // component (median 34, p75 46 after the distance-to-trigger slot was added), not to
  // V2's Buyer Emergence, which ran ~20 points higher
  // because it scored EMA reclaim and higher-low counts that most stocks satisfy. Carrying
  // the old gates forward made EARLY_ACCUMULATION reachable by 4% of the universe.

  // EXPANSION: already in markup. Tightened from (10%, 40) — that caught 29% of the table
  // and routed all of it to ADD_ON, which is the opposite of catching a move early.
  if (pctFromAth < 6 && rs >= 55) return "EXPANSION";

  // EARLY_ACCUMULATION: demand clearly present
  if (demand >= 42 && rs >= 35 && se >= 30) return "EARLY_ACCUMULATION";
  // Alt path: strong demand compensates for weaker RS
  if (demand >= 47 && se >= 35 && compression >= 25) return "EARLY_ACCUMULATION";

  // INFLECTION: supply exhausted + compressed + demand starting
  if (se >= 40 && compression >= 30 && demand >= 26) return "INFLECTION";
  // Alt path: strong exhaustion + emerging demand without full compression
  if (se >= 50 && demand >= 31 && compression >= 15) return "INFLECTION";
  // Alt path: strong compression + decent exhaustion
  if (compression >= 50 && se >= 35 && demand >= 21) return "INFLECTION";

  // SELLER_EXHAUSTION: selling pressure declining, demand not yet present
  if (se >= 35 && compression >= 15) return "SELLER_EXHAUSTION";
  if (se >= 45) return "SELLER_EXHAUSTION";

  // DISTRIBUTION: a POSITIVE finding, not a default. Requires actual evidence of selling —
  // institutions distributing, or down bars producing more range than up bars — alongside
  // supply that is demonstrably not exhausted. Previously this was the fall-through return,
  // so it absorbed every stock no gate matched: half the universe, including rows scoring 48
  // that the Transition engine simultaneously read as BULLISH_CHOCH.
  const distributing =
    (data.distributionDays20d !== null && data.distributionDays20d >= 6) ||
    (data.rangeAsymmetry !== null && data.rangeAsymmetry < 0.9);
  if (se < 35 && distributing) return "DISTRIBUTION";

  // UNCLASSIFIED: no gate matched. Not a verdict — an absence of one.
  return "UNCLASSIFIED";
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
  // UNCLASSIFIED means no setup was identified, which is not the same as a bearish call.
  // Routing it to AVOID asserted something the classifier never established.
  if (stage === "UNCLASSIFIED") return "WATCH";
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

  const invalidationLevel = calcInvalidationLevel(data);

  const seResult = scoreSupplyExhaustion(data);
  const demandResult = scoreDemandEmergence(data);
  const compressionResult = scoreCompression(data);
  const runnerResult = scoreRunnerPotential(data, invalidationLevel);
  const rsResult = scoreRSTrajectory(data);

  // Weighted average over the components that could actually be measured. A component with
  // no data is skipped and its weight redistributed, rather than entering the sum as a zero.
  const components = [
    { score: seResult.score, coverage: seResult.coverage, weight: 0.25 },                   // Supply finished?
    { score: demandResult.score, coverage: demandResult.coverage, weight: 0.25 },           // Demand appearing?
    { score: compressionResult.score, coverage: compressionResult.coverage, weight: 0.15 }, // Spring wound?
    { score: runnerResult.score, coverage: runnerResult.coverage, weight: 0.25 },           // Can it move?
    { score: rsResult.score, coverage: rsResult.coverage, weight: 0.10 },                   // RS turning?
  ];
  const overallScore = weightedComposite(components);
  const measuredPct = measuredWeightPct(components);

  const seScore = displayScore(seResult.score);
  const demandScore = displayScore(demandResult.score);
  const compressionScore = displayScore(compressionResult.score);
  const runnerScore = displayScore(runnerResult.score);

  const scores: InflectionScores = {
    supplyExhaustion: seScore,
    demandEmergence: demandScore,
    compression: compressionScore,
    runnerPotential: runnerScore,
    rsTrajectory: displayScore(rsResult.score),
    overallScore,
  };

  const stage = classifyStage(seScore, compressionScore, demandScore, displayScore(rsResult.score), data);
  const extensionRisk = checkExtensionRisk(data);
  const tradeRead = determineTradeRead(stage, overallScore, demandScore, extensionRisk);

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

  if (measuredPct < 70) {
    cautionEvidence.push(`Only ${measuredPct}% of the composite could be measured — thin data`);
  }

  // Regime gate raises the bar for the signal tiers without touching the score, so the
  // same setup needs more evidence to earn an alert in a hostile tape.
  if (regimeGate.scorePenalty > 0) cautionEvidence.push(regimeGate.label);

  // Coiled: the pre-move tier. IDENTICAL definition on both engines — same gate, same
  // thresholds, same pre-break test. "Has structure broken" is read from
  // data.hasBrokenStructure, computed once in the data layer, so this is a property of the
  // stock rather than of whichever page you are looking at. Requires strictly `false`:
  // a null means the chart was too short to tell, which is not the same as "no break".
  const isCoiledSignal =
    data.hasBrokenStructure === false &&
    overallScore >= 45 + regimeGate.scorePenalty &&
    runnerScore >= 50 &&
    demandScore >= 38 &&
    seScore >= 35 &&
    !extensionRisk;

  if (isCoiledSignal) {
    bullishEvidence.push("Coiled — full setup in place, no structural break has printed yet");
  }

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
    demandScore >= 50 &&
    seScore >= 45 &&
    runnerScore >= 50;

  return {
    data,
    gates,
    scores,
    stage,
    tradeRead,
    extensionRisk,
    measuredPct,
    isCoiledSignal,
    bullishEvidence,
    cautionEvidence,
    invalidationLevel,
    isPrimarySignal,
    isStrongerSignal,
    componentSlots: {
      supply_exhaustion: seResult.slots,
      demand: demandResult.slots,
      compression: compressionResult.slots,
      runner: runnerResult.slots,
      rs_trajectory: rsResult.slots,
    },
  };
}
