/**
 * Transition Scanner scoring module — V3.
 *
 * Answers whether market structure has flipped from accumulation into early markup.
 * 11-state model: MARKDOWN → SELLING_EXHAUSTION → ACCUMULATION → DEMAND_INCREASING
 * → BULLISH_CHOCH → HIGHER_LOW_FORMATION → BULLISH_BOS → COMPRESSION
 * → EARLY_EXPANSION → SUSTAINED_MARKUP → EXTENDED.
 *
 * Six components (weighted to 100):
 *   Structure 25% · Supply Exhaustion 15% · Demand Emergence 20%
 *   Compression 10% · Runner Potential 20% · RS Trajectory 10%
 *
 * Three of the six live HERE only as weights — Supply Exhaustion, Demand Emergence and
 * Runner Potential are shared modules, so they report identical numbers on both engines.
 * See supply-exhaustion.ts, demand-emergence.ts, runner-potential.ts. What this file owns
 * is Structure, Compression, RS Trajectory, the 11-state ladder and the alert states.
 *
 * V3 changes:
 *   - ChoCH and BOS merged into one Structure component. They are sequential states of a
 *     single axis, not two independent measures, and scoring them separately let one
 *     structural event be paid for twice.
 *   - Structure slots become hasData:false when no break has printed AND the state is
 *     early. Previously a stock at the moment of maximum opportunity — exhaustion done,
 *     demand emerging, structure about to flip — was charged a zero across 25% of the
 *     composite for an event that had not happened yet, and could never rank highly.
 *     A detected-but-failed break is still scored: that is real negative evidence.
 *   - Lagging inputs removed: RSI, EMA reclaim, absolute RS levels, higher-low counts.
 *     Replaced by order-flow primitives shared with the Inflection engine.
 *   - Runner Potential added — how far the move can actually go.
 *
 * Unchanged: the 11-state ladder, the 5 alert states, the forward trigger level and
 * break-confirmation logic.
 *
 * SERVER-ONLY: Used by /api/transition/* routes.
 */

import "server-only";

import type {
  PreRunStockData,
  InflectionGates,
  TransitionScores,
  TransitionState,
  TransitionAlertState,
  TransitionResult,
} from "./types";
import { TRANSITION_STATE_ORDER } from "./types";
import {
  analyzeMarketStructure,
  computeTriggerLevel,
  computeInvalidationLevel,
  evaluateBreakConfirmation,
} from "./market-structure";
import { weightedComposite, displayScore, measuredWeightPct, nullNeutralScore, type ScoreSlot } from "./score-slot";
import { scoreRunnerPotential } from "./runner-potential";
import { scoreSupplyExhaustion } from "./supply-exhaustion";
import { scoreDemandEmergence } from "./demand-emergence";
import { scoreRSTrajectory } from "./rs-trajectory";
import { NEUTRAL_GATE, type RegimeGate } from "./regime-gate";

// ── Gates (same as Inflection — reuse type) ──

function evaluateGates(data: PreRunStockData): InflectionGates {
  const price = data.currentPrice ?? 0;
  const priceAbove5 = price >= 5;
  const avgDollarVolAbove10m = (data.vcpAvgDollarVolume ?? 0) >= 10_000_000;
  const mktCapAbove500m = (data.marketCap ?? 0) >= 500_000_000;
  const allPass = priceAbove5 && avgDollarVolAbove10m && mktCapAbove500m;
  return { priceAbove5, avgDollarVolAbove10m, mktCapAbove500m, allPass };
}

// ── Structure (0-100, weight 25%) ──
//
// ChoCH and BOS merged. Slots drop out entirely when no break has printed and the stock is
// still in an early state — the pre-structure fix. Present-but-failed breaks stay scored.

function scoreStructure(
  chochDetected: boolean,
  chochHolding: boolean,
  chochBarsAgo: number | null,
  bosDetected: boolean,
  bosHolding: boolean,
  bosBarsAgo: number | null,
  higherHighCount: number,
  lowerHighCount: number,
  structureHasPrinted: boolean,
): { score: number | null; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // Change of character (0-30)
  if (structureHasPrinted) {
    slots.push({
      earned: chochDetected ? (chochHolding ? 30 : 9) : 0,
      possible: 30,
      hasData: true,
    });
    if (chochDetected && chochHolding) evidence.push("Bullish ChoCH — broke above the recent swing high and is holding it");
    else if (chochDetected) caution.push("ChoCH failed — price has fallen back below the level it broke");
    else caution.push("No change of character detected");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // Break of structure (0-25)
  if (structureHasPrinted) {
    slots.push({
      earned: bosDetected ? (bosHolding ? 25 : 7) : 0,
      possible: 25,
      hasData: true,
    });
    if (bosDetected && bosHolding) evidence.push("Bullish BOS — higher low confirmed and prior swing high taken, still holding");
    else if (bosDetected) caution.push("BOS failed — price has fallen back below the level it broke");
    else if (chochDetected) caution.push("ChoCH detected but BOS not yet confirmed");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // Recency of the most recent break (0-18) — a fresh flip beats an aging one
  const barsAgo = bosDetected ? bosBarsAgo : chochBarsAgo;
  if ((bosDetected || chochDetected) && barsAgo !== null) {
    let earned = 0;
    if (barsAgo <= 5) { earned = 18; evidence.push(`Structure flipped ${barsAgo} bars ago — fresh`); }
    else if (barsAgo <= 10) { earned = 13; }
    else if (barsAgo <= 20) { earned = 7; }
    else { earned = 3; caution.push(`Structural break was ${barsAgo} bars ago — aging`); }
    slots.push({ earned, possible: 18, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // Higher-high follow-through (0-14) — only meaningful once a BOS exists.
  // countHigherHighs reads the last 4 swing highs rather than only those after the break,
  // so this reads as "recent structure is making higher highs", gated on a BOS existing.
  if (bosDetected) {
    let earned = 0;
    if (higherHighCount >= 2) { earned = 14; evidence.push(`BOS with ${higherHighCount} higher highs in recent structure — trend extending`); }
    else if (higherHighCount >= 1) { earned = 9; evidence.push("BOS with a higher high in recent structure"); }
    else { caution.push("BOS with no higher highs in recent structure"); }
    slots.push({ earned, possible: 14, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // Bearish structure penalty (0-13) — lower highs still forming alongside the break.
  // analyzeMarketStructure computes lowerHighCount for structureBias and nothing scored it.
  // A ChoCH printed while the swing structure is still making lower highs is weaker evidence
  // than the same ChoCH inside clean structure.
  if (structureHasPrinted) {
    let earned = 13;
    if (lowerHighCount >= 2) { earned = 0; caution.push(`${lowerHighCount} lower highs still in recent structure — break is fighting the trend`); }
    else if (lowerHighCount >= 1) { earned = 7; }
    slots.push({ earned, possible: 13, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── Compression (0-100, weight 10%) ──

function scoreCompressionQuality(data: PreRunStockData): { score: number | null; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // ATR ratio 5/20 (0-25)
  const atrRatio = data.atrRatio5v20;
  if (atrRatio !== null) {
    let earned = 0;
    if (atrRatio <= 0.5) { earned = 25; evidence.push(`ATR contracting sharply (ratio ${atrRatio.toFixed(2)})`); }
    else if (atrRatio <= 0.65) { earned = 18; evidence.push(`ATR contracting (ratio ${atrRatio.toFixed(2)})`); }
    else if (atrRatio <= 0.8) { earned = 12; }
    else if (atrRatio > 1.2) { caution.push("Volatility expanding — not compressing"); }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // Tight closes (0-16)
  if (data.vcpTightCloses !== null) {
    slots.push({ earned: data.vcpTightCloses ? 16 : 0, possible: 16, hasData: true });
    if (data.vcpTightCloses) evidence.push("Tight daily closes — low volatility");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // Inside bars (0-21)
  if (data.vcpInsideBarCount !== null) {
    const ibc = data.vcpInsideBarCount;
    let earned = 0;
    if (ibc >= 3) { earned = 21; evidence.push(`${ibc} inside bars — high compression`); }
    else if (ibc >= 2) { earned = 15; evidence.push(`${ibc} inside bars`); }
    else if (ibc >= 1) { earned = 8; }
    slots.push({ earned, possible: 21, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // Closes near range top (0-21)
  if (data.closesNearRangeTop !== null) {
    slots.push({ earned: data.closesNearRangeTop ? 21 : 0, possible: 21, hasData: true });
    if (data.closesNearRangeTop) evidence.push("Closes near range top — buyers in control");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }


  // Dry volume days (0-17) — restored from V2. Volume drying up inside a base means
  // supply has been absorbed and there is nothing left to sell at these prices.
  if (data.vcpDryVolumeDays !== null) {
    const dry = data.vcpDryVolumeDays;
    let earned = 0;
    if (dry >= 5) { earned = 17; evidence.push(`${dry} dry volume days — supply absorbed`); }
    else if (dry >= 3) { earned = 12; evidence.push(`${dry} dry volume days`); }
    else if (dry >= 2) { earned = 6; }
    else if (dry >= 1) { earned = 2; }
    slots.push({ earned, possible: 17, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }
  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── State Classification ──

/**
 * Classify the market transition state based on scored components and
 * market structure analysis. States are ordered — the highest qualifying
 * state is returned.
 */
// The ladder is unchanged — same 11 states, same ordering, same intent. What changed is
// which components feed it: demand replaces the old accumulation/volume pair, and the
// higher-low structural gates now come from the market-structure counts directly rather
// than from a scored component that measured the same thing three ways.
//
// Runner Potential is deliberately NOT an input. How far a stock can move says nothing
// about where in the cycle it currently sits.

// Demand gates are anchored to the OBSERVED distribution of the V3 Demand Emergence
// component (median 35, p75 43 after the distance-to-trigger slot was added), not to
// V2's Accumulation/Volume pair, which ran higher
// because it scored accumulation days and raw volume ratios that most stocks satisfy.
function classifyState(
  se: number,
  demand: number,
  compression: number,
  rs: number,
  data: PreRunStockData,
  chochDetected: boolean,
  bosDetected: boolean,
  structureBias: "bullish" | "bearish" | "neutral",
  higherLowCount: number,
): TransitionState {
  const pctFromAth = data.pctFromAth ?? 100;
  const distEma = data.instDistFromEma20Atr ?? 0;

  // STATE 10: EXTENDED — overextended from MAs.
  // Requires BOTH conditions: a state should be specific. checkExtensionRisk uses OR
  // because a risk flag should be conservative. The two are intentionally different.
  if (pctFromAth < 5 && distEma > 3) return "EXTENDED";

  // STATE 9: SUSTAINED_MARKUP — confirmed uptrend with bullish structure
  if (
    bosDetected &&
    structureBias === "bullish" &&
    rs >= 40 &&
    pctFromAth < 15 &&
    demand >= 36
  ) return "SUSTAINED_MARKUP";

  // STATE 8: EARLY_EXPANSION — breakout from compression with participation
  if (
    bosDetected &&
    compression >= 30 &&
    demand >= 40 &&
    (data.closesNearRangeTop === true) &&
    rs >= 25
  ) return "EARLY_EXPANSION";

  // STATE 7: COMPRESSION — range tightening after a structural break
  if (bosDetected && compression >= 32) return "COMPRESSION";
  // Alt: strong compression after a ChoCH with higher lows in place
  if (chochDetected && compression >= 40 && higherLowCount >= 2) return "COMPRESSION";

  // STATE 6: BULLISH_BOS — break of structure with demand behind it
  if (bosDetected && higherLowCount >= 2 && demand >= 32) return "BULLISH_BOS";

  // STATE 5: HIGHER_LOW_FORMATION — higher low after ChoCH
  if (chochDetected && higherLowCount >= 2) return "HIGHER_LOW_FORMATION";
  // Alt: clear higher-low structure with demand, without an explicit ChoCH
  if (higherLowCount >= 3 && demand >= 38 && structureBias === "bullish") return "HIGHER_LOW_FORMATION";

  // STATE 4: BULLISH_CHOCH — change of character with supporting evidence
  if (chochDetected && (demand >= 28 || se >= 30)) return "BULLISH_CHOCH";

  // STATE 3: DEMAND_INCREASING — buyers stepping in
  if (demand >= 40 && se >= 35) return "DEMAND_INCREASING";
  if (demand >= 50) return "DEMAND_INCREASING";

  // STATE 2: ACCUMULATION — range-bound with stealth buying
  if (demand >= 32 && se >= 28) return "ACCUMULATION";
  if (data.obvDivergent === true && se >= 28 && demand >= 26) return "ACCUMULATION";

  // STATE 1: SELLING_EXHAUSTION — selling pressure declining
  if (se >= 40) return "SELLING_EXHAUSTION";
  if (se >= 30 && data.vpDivergenceBullish === true) return "SELLING_EXHAUSTION";

  // STATE 0: MARKDOWN — default
  return "MARKDOWN";
}

// ── Alert State ──

/**
 * Map a state + score + price context onto the 5 alert states.
 *
 * TRIGGERED requires three things that used to be missing: a trigger level price has
 * genuinely cleared (see computeTriggerLevel), participation on the break bar
 * (volume expansion or a strong close), and no extension risk. A break without
 * participation lands in READY, which is what READY is for.
 *
 * INVALIDATED is a real price test against the structural invalidation level, not
 * just a synonym for MARKDOWN.
 */
export function classifyAlertState(
  state: TransitionState,
  overallScore: number,
  triggerLevel: number | null,
  currentPrice: number | null,
  atrPct: number | null,
  invalidationLevel: number | null,
  breakConfirmed: boolean,
  extensionRisk: boolean,
  scorePenalty = 0,
): TransitionAlertState {
  const stateNum = TRANSITION_STATE_ORDER[state];

  // INVALIDATED: price has broken the structural invalidation level — checked first,
  // because a broken thesis outranks whatever state the components still report.
  if (currentPrice !== null && invalidationLevel !== null && currentPrice < invalidationLevel) {
    return "INVALIDATED";
  }
  // MARKDOWN carries no bullish thesis to invalidate
  if (stateNum === 0) return "INVALIDATED";

  // Extended names never read as TRIGGERED — the move being flagged is already gone
  const canTrigger = !extensionRisk && state !== "EXTENDED";

  // TRIGGERED: expansion states, strong score, confirmed break
  if (canTrigger && stateNum >= 8 && overallScore >= 50 + scorePenalty && breakConfirmed) return "TRIGGERED";

  if (stateNum >= 4 && triggerLevel !== null && currentPrice !== null && atrPct !== null) {
    const distToTrigger = ((triggerLevel - currentPrice) / currentPrice) * 100;
    // Price has cleared the trigger: TRIGGERED only with participation, else READY
    if (distToTrigger <= 0 && overallScore >= 40 + scorePenalty) {
      return canTrigger && breakConfirmed ? "TRIGGERED" : "READY";
    }
    // Within 2% or 2 ATR of an overhead trigger = READY
    if (distToTrigger > 0 && distToTrigger <= Math.max(2.0, atrPct * 2) && overallScore >= 35) {
      return "READY";
    }
  }

  // ARMED: structural shift detected, trigger level computed, minimum score
  if (stateNum >= 4 && triggerLevel !== null && overallScore >= 30) return "ARMED";

  // WATCH: early signals present
  if (stateNum >= 1) return "WATCH";

  return "INVALIDATED";
}

// ── Extension Risk ──

function checkExtensionRisk(data: PreRunStockData): boolean {
  const pctFromAth = data.pctFromAth ?? 100;
  const distEma = data.instDistFromEma20Atr ?? 0;
  return pctFromAth < 5 || distEma > 3;
}

// ── Main Scoring Function ──

export interface StructureInput {
  chochDetected: boolean;
  chochBarsAgo: number | null;
  /** Latest close still above the level ChoCH broke */
  chochHolding: boolean;
  bosDetected: boolean;
  bosBarsAgo: number | null;
  /** Latest close still above the level BOS broke */
  bosHolding: boolean;
  higherLowCount: number;
  higherHighCount: number;
  lowerHighCount: number;
  lowerLowCount: number;
  structureBias: "bullish" | "bearish" | "neutral";
  triggerLevel: number | null;
  invalidationLevel: number | null;
  /** Break bar showed volume expansion or closed strong in its range */
  breakConfirmed: boolean;
  /** False when the OHLC series was too short to run structure detection at all */
  structureAvailable: boolean;
}

/** Structure input for tickers whose OHLC series was unusable. Scores without
 *  structural evidence and flags the row so downstream consumers can exclude it. */
export const NO_STRUCTURE: StructureInput = {
  chochDetected: false,
  chochBarsAgo: null,
  chochHolding: false,
  bosDetected: false,
  bosBarsAgo: null,
  bosHolding: false,
  higherLowCount: 0,
  higherHighCount: 0,
  lowerHighCount: 0,
  lowerLowCount: 0,
  structureBias: "neutral",
  triggerLevel: null,
  invalidationLevel: null,
  breakConfirmed: false,
  structureAvailable: false,
};

/**
 * Score transition with pre-computed market structure data.
 * Called by the cron route which has access to raw OHLC arrays.
 */
export function scoreTransitionWithStructure(
  data: PreRunStockData,
  structure: StructureInput,
  regimeGate: RegimeGate = NEUTRAL_GATE,
): TransitionResult {
  const gates = evaluateGates(data);

  const seResult = scoreSupplyExhaustion(data);
  const demandResult = scoreDemandEmergence(data);
  const compressionResult = scoreCompressionQuality(data);
  const runnerResult = scoreRunnerPotential(data, structure.invalidationLevel);
  const rsResult = scoreRSTrajectory(data);

  // Pre-structure fix: when no break has printed, the structure slots are not applicable
  // rather than failed. Charging a zero there meant a stock at the moment of maximum
  // opportunity — supply done, demand emerging, structure about to flip — could never
  // rank highly, because 25% of the composite was a zero for an event yet to happen.
  // Structure is scored the moment a break exists, in either direction.
  const structureHasPrinted =
    structure.structureAvailable && (structure.chochDetected || structure.bosDetected);

  const structureResult = scoreStructure(
    structure.chochDetected, structure.chochHolding, structure.chochBarsAgo,
    structure.bosDetected, structure.bosHolding, structure.bosBarsAgo,
    structure.higherHighCount, structure.lowerHighCount, structureHasPrinted,
  );

  // Weighted composite. Any component that could not be measured — including Structure
  // before a break has printed — is skipped and its weight redistributed, rather than
  // entering the sum as a zero.
  const components = [
    { score: structureHasPrinted ? structureResult.score : null, weight: 0.25 },
    { score: seResult.score, weight: 0.15 },
    { score: demandResult.score, weight: 0.20 },
    { score: compressionResult.score, weight: 0.10 },
    { score: runnerResult.score, weight: 0.20 },
    { score: rsResult.score, weight: 0.10 },
  ];
  const overallScore = weightedComposite(components);
  // Structure is legitimately absent pre-break, so it does not count as missing data here.
  const measuredPct = measuredWeightPct(components.filter((_, idx) => idx > 0 || structureHasPrinted));

  const seScore = displayScore(seResult.score);
  const demandScore = displayScore(demandResult.score);
  const compressionScore = displayScore(compressionResult.score);
  const runnerScore = displayScore(runnerResult.score);
  const rsScore = displayScore(rsResult.score);

  const scores: TransitionScores = {
    structure: displayScore(structureResult.score),
    supplyExhaustion: seScore,
    demandEmergence: demandScore,
    compression: compressionScore,
    runnerPotential: runnerScore,
    rsTrajectory: rsScore,
    overallScore,
  };

  // State classification
  const state = classifyState(
    seScore, demandScore, compressionScore, rsScore,
    data, structure.chochDetected, structure.bosDetected, structure.structureBias,
    structure.higherLowCount,
  );

  // Trigger / invalidation
  const triggerLevel = structure.triggerLevel;
  const invalidationLevel = structure.invalidationLevel;
  const extensionRisk = checkExtensionRisk(data);

  // Alert state
  const alertState = classifyAlertState(
    state, overallScore, triggerLevel, data.currentPrice, data.vcpAtrPct ?? null,
    invalidationLevel, structure.breakConfirmed, extensionRisk, regimeGate.scorePenalty,
  );

  // Merge evidence
  const bullishEvidence = [
    ...structureResult.evidence,
    ...seResult.evidence,
    ...demandResult.evidence,
    ...compressionResult.evidence,
    ...runnerResult.evidence,
    ...rsResult.evidence,
  ];
  const cautionEvidence = [
    ...structureResult.caution,
    ...seResult.caution,
    ...demandResult.caution,
    ...compressionResult.caution,
    ...runnerResult.caution,
    ...rsResult.caution,
  ];

  const stateNum = TRANSITION_STATE_ORDER[state];

  if (extensionRisk) {
    cautionEvidence.push("Extended — near ATH or stretched from EMA20; entry risk is elevated");
  }
  if (!structure.structureAvailable) {
    cautionEvidence.push("Chart too short for structure analysis — ChoCH/BOS not evaluated");
  }
  if (measuredPct < 70) {
    cautionEvidence.push(`Only ${measuredPct}% of the composite could be measured — thin data`);
  }

  // Regime gate raises the tier thresholds without touching the score itself.
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

  const isPrimarySignal =
    overallScore >= 45 + regimeGate.scorePenalty &&
    stateNum >= 4 && // BULLISH_CHOCH or higher
    alertState !== "INVALIDATED" &&
    !extensionRisk &&
    structure.structureAvailable;

  // Nested inside primary: "stronger" is always a subset of "primary".
  // Runner Potential is a requirement, not just a contributor — a confirmed structural
  // flip on a stock that cannot move is not a stronger signal.
  const isStrongerSignal =
    isPrimarySignal &&
    overallScore >= 55 + regimeGate.scorePenalty &&
    stateNum >= 6 && // BULLISH_BOS or higher
    runnerScore >= 50;

  return {
    data,
    gates,
    scores,
    state,
    alertState,
    triggerLevel,
    invalidationLevel,
    extensionRisk,
    measuredPct,
    structureAvailable: structure.structureAvailable,
    isCoiledSignal,
    bullishEvidence,
    cautionEvidence,
    isPrimarySignal,
    isStrongerSignal,
  };
}

/** Minimum bars required for 3-bar pivot structure analysis to be meaningful. */
export const MIN_STRUCTURE_BARS = 30;

/**
 * Score transition with raw OHLC arrays (used by cron route).
 * Runs market structure analysis from chart data, then delegates to scoring.
 *
 * `volumes` and the ticker's 50d average volume drive break confirmation; when
 * volume is unavailable, confirmation falls back to close location within the bar.
 */
export function scoreTransitionWithOHLC(
  data: PreRunStockData,
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[] = [],
  n = 3,
  regimeGate: RegimeGate = NEUTRAL_GATE,
): TransitionResult {
  if (closes.length < MIN_STRUCTURE_BARS) {
    return scoreTransitionWithStructure(data, NO_STRUCTURE, regimeGate);
  }

  const ms = analyzeMarketStructure(highs, lows, closes, n);

  // The break that matters for confirmation is the most recent structural one:
  // BOS supersedes ChoCH when both are present.
  const breakIndex = ms.bos.detected ? ms.bos.breakIndex : ms.choch.breakIndex;
  const confirmation = evaluateBreakConfirmation(
    breakIndex, highs, lows, closes, volumes, data.vcpAvgVolume50d ?? null,
  );

  return scoreTransitionWithStructure(data, {
    chochDetected: ms.choch.detected,
    chochBarsAgo: ms.choch.barsAgo,
    chochHolding: ms.choch.holding,
    bosDetected: ms.bos.detected,
    bosBarsAgo: ms.bos.barsAgo,
    bosHolding: ms.bos.holding,
    higherLowCount: ms.higherLowCount,
    higherHighCount: ms.higherHighCount,
    lowerHighCount: ms.lowerHighCount,
    lowerLowCount: ms.lowerLowCount,
    structureBias: ms.structureBias,
    triggerLevel: computeTriggerLevel(ms.swingHighs, data.currentPrice ?? null, closes.length),
    invalidationLevel: computeInvalidationLevel(ms.swingLows),
    breakConfirmed: confirmation.confirmed,
    structureAvailable: true,
  }, regimeGate);
}
