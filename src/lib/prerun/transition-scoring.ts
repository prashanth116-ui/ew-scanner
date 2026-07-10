/**
 * Transition Scanner scoring module.
 *
 * Detects market structure transitions from accumulation into early markup.
 * 11-state model: MARKDOWN → SELLING_EXHAUSTION → ACCUMULATION → DEMAND_INCREASING
 * → BULLISH_CHOCH → HIGHER_LOW_FORMATION → BULLISH_BOS → COMPRESSION
 * → EARLY_EXPANSION → SUSTAINED_MARKUP → EXTENDED.
 *
 * 8 scoring components (weighted to 100):
 *   SE (10%) + Accumulation (15%) + ChoCH (15%) + BOS (10%)
 *   + Compression (10%) + HL Quality (10%) + RS Trajectory (10%) + Volume Profile (20%)
 *
 * Reuses fetchPreRunData() and existing utilities from data.ts.
 * Zero changes to inflection-scoring.ts.
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
} from "./market-structure";

// ── Utility ──

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

interface ScoreSlot {
  earned: number;
  possible: number;
  hasData: boolean;
}

function nullNeutralScore(slots: ScoreSlot[]): number {
  const withData = slots.filter((s) => s.hasData);
  if (withData.length === 0) return 0;
  const totalEarned = withData.reduce((sum, s) => sum + s.earned, 0);
  const totalPossible = withData.reduce((sum, s) => sum + s.possible, 0);
  if (totalPossible === 0) return 0;
  return Math.round((totalEarned / totalPossible) * 100);
}

// ── Gates (same as Inflection — reuse type) ──

function evaluateGates(data: PreRunStockData): InflectionGates {
  const price = data.currentPrice ?? 0;
  const priceAbove5 = price >= 5;
  const avgDollarVolAbove10m = (data.vcpAvgDollarVolume ?? 0) >= 10_000_000;
  const mktCapAbove500m = (data.marketCap ?? 0) >= 500_000_000;
  const allPass = priceAbove5 && avgDollarVolAbove10m && mktCapAbove500m;
  return { priceAbove5, avgDollarVolAbove10m, mktCapAbove500m, allPass };
}

// ── 1. Seller Exhaustion (0-100, weight 10%) ──
// Detects declining selling pressure: down-volume shrinking, RSI recovery, candle body contraction.

function scoreSellerExhaustion(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 1a. Down-vol declining (0-25)
  const avgUp = data.avgVolumeUpDays;
  const avgDown = data.avgVolumeDownDays;
  if (avgUp !== null && avgDown !== null) {
    const volRatio = avgDown > 0 ? avgUp / avgDown : 1;
    let earned = 0;
    if (volRatio >= 1.5) { earned = 25; evidence.push("Down-volume declining sharply"); }
    else if (volRatio >= 1.2) { earned = 18; evidence.push("Down-volume declining"); }
    else if (volRatio >= 1.0) { earned = 10; }
    else { caution.push("Selling volume still dominant"); }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1b. RSI positioning (0-25)
  const rsi = data.rsi14;
  if (rsi !== null) {
    let earned = 0;
    if (rsi >= 30 && rsi <= 40) { earned = 25; evidence.push(`RSI recovering from oversold (${rsi.toFixed(0)})`); }
    else if (rsi > 40 && rsi <= 50) { earned = 22; evidence.push(`RSI in pullback zone (${rsi.toFixed(0)})`); }
    else if (rsi > 50 && rsi <= 55) { earned = 16; }
    else if (rsi >= 25 && rsi < 30) { earned = 18; evidence.push("RSI deeply oversold — reversal zone"); }
    else if (rsi > 55 && rsi <= 65) { earned = 8; }
    else if (rsi > 65) { earned = 3; caution.push(`RSI elevated (${rsi.toFixed(0)})`); }
    else { earned = 6; }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1c. VP divergence (0-25)
  if (data.vpDivergenceBullish !== null) {
    slots.push({
      earned: data.vpDivergenceBullish ? 25 : 0,
      possible: 25,
      hasData: true,
    });
    if (data.vpDivergenceBullish) evidence.push("Volume-price divergence: selling drying up");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 1d. Down-day bodies shrinking (0-25)
  if (data.avgDownDayBody !== null && data.avgDownDayBodyPrev !== null && data.avgDownDayBodyPrev > 0) {
    const ratio = data.avgDownDayBody / data.avgDownDayBodyPrev;
    let earned = 0;
    if (ratio <= 0.5) { earned = 25; evidence.push("Down-day bodies shrinking significantly"); }
    else if (ratio <= 0.7) { earned = 18; evidence.push("Down-day candles getting smaller"); }
    else if (ratio <= 0.9) { earned = 8; }
    else { caution.push("Down-day bodies not shrinking"); }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 2. Accumulation Quality (0-100, weight 15%) ──
// Detects institutional accumulation: OBV divergence, volume drying up, range formation.

function scoreAccumulationQuality(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 2a. OBV divergence (0-30) — OBV near highs while price is not
  if (data.obvDivergent !== null) {
    slots.push({
      earned: data.obvDivergent ? 30 : 0,
      possible: 30,
      hasData: true,
    });
    if (data.obvDivergent) evidence.push("OBV near highs while price trails — stealth accumulation");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2b. Accumulation days vs distribution days (0-30)
  const accumDays = data.accumulationDayCount;
  const distDays = data.distributionDays20d;
  if (accumDays !== null && distDays !== null) {
    const netAccum = accumDays - distDays;
    let earned = 0;
    if (netAccum >= 5) { earned = 30; evidence.push(`Strong accumulation (${accumDays} accum vs ${distDays} distrib days)`); }
    else if (netAccum >= 3) { earned = 22; evidence.push(`Net accumulation (${accumDays} accum vs ${distDays} distrib)`); }
    else if (netAccum >= 1) { earned = 14; }
    else if (netAccum <= -3) { caution.push(`Distribution dominant (${distDays} distrib days)`); }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2c. Dry volume days (0-20) — VCP data reused
  if (data.vcpDryVolumeDays !== null) {
    const dryDays = data.vcpDryVolumeDays;
    let earned = 0;
    if (dryDays >= 5) { earned = 20; evidence.push(`${dryDays} dry volume days — supply absorbed`); }
    else if (dryDays >= 3) { earned = 14; evidence.push(`${dryDays} dry volume days`); }
    else if (dryDays >= 1) { earned = 6; }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2d. Failed breakdown recovery (0-20)
  if (data.failedBreakdownRecovery !== null) {
    const fbd = data.failedBreakdownRecovery;
    let earned = 0;
    if (fbd >= 2) { earned = 20; evidence.push("Failed breakdown + recovery — bears trapped"); }
    else if (fbd >= 1) { earned = 12; evidence.push("Wick test of support — holding"); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 3. ChoCH Confirmation (0-100, weight 15%) ──
// Scores the quality of a bullish Change of Character signal.

function scoreChochConfirmation(
  data: PreRunStockData,
  chochDetected: boolean,
  chochBarsAgo: number | null,
): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 3a. ChoCH detected (0-40) — binary but weighted heavily
  slots.push({
    earned: chochDetected ? 40 : 0,
    possible: 40,
    hasData: true,
  });
  if (chochDetected) {
    evidence.push("Bullish ChoCH — price broke above recent swing high");
  } else {
    caution.push("No Change of Character detected");
  }

  // 3b. Recency of ChoCH (0-30) — more recent = stronger signal
  if (chochDetected && chochBarsAgo !== null) {
    let earned = 0;
    if (chochBarsAgo <= 5) { earned = 30; evidence.push(`ChoCH occurred ${chochBarsAgo} bars ago — very recent`); }
    else if (chochBarsAgo <= 10) { earned = 22; }
    else if (chochBarsAgo <= 20) { earned = 14; }
    else { earned = 6; caution.push(`ChoCH occurred ${chochBarsAgo} bars ago — aging signal`); }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: !chochDetected });
  }

  // 3c. EMA reclaim around ChoCH (0-30) — structural confirmation
  if (data.aboveEma21 !== null || data.aboveEma50 !== null) {
    let earned = 0;
    const above21 = data.aboveEma21 === true;
    const above50 = data.aboveEma50 === true;
    if (above21 && above50) { earned = 30; evidence.push("Price above EMA21 + EMA50 — trend confirmed"); }
    else if (above21) { earned = 18; evidence.push("Price above EMA21"); }
    else if (above50) { earned = 12; }
    else { caution.push("Below both EMAs — ChoCH not yet confirmed by trend"); }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 4. BOS Confirmation (0-100, weight 10%) ──
// Scores the quality of a bullish Break of Structure signal.

function scoreBosConfirmation(
  data: PreRunStockData,
  bosDetected: boolean,
  bosBarsAgo: number | null,
  chochDetected: boolean,
): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 4a. BOS detected (0-40)
  slots.push({
    earned: bosDetected ? 40 : 0,
    possible: 40,
    hasData: true,
  });
  if (bosDetected) {
    evidence.push("Bullish BOS — higher low confirmed + broke prior swing high");
  } else if (chochDetected) {
    caution.push("ChoCH detected but BOS not yet confirmed");
  }

  // 4b. Recency of BOS (0-30)
  if (bosDetected && bosBarsAgo !== null) {
    let earned = 0;
    if (bosBarsAgo <= 5) { earned = 30; evidence.push(`BOS confirmed ${bosBarsAgo} bars ago`); }
    else if (bosBarsAgo <= 10) { earned = 22; }
    else if (bosBarsAgo <= 20) { earned = 14; }
    else { earned = 6; }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: !bosDetected });
  }

  // 4c. EMA crossover within window (0-30) — trend confirmation
  if (data.emaCrossoverWithin20d !== null) {
    slots.push({
      earned: data.emaCrossoverWithin20d ? 30 : 0,
      possible: 30,
      hasData: true,
    });
    if (data.emaCrossoverWithin20d) evidence.push("EMA crossover within 20 bars — trend shift");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 5. Compression Quality (0-100, weight 10%) ──
// Detects volatility contraction before breakout.

function scoreCompressionQuality(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 5a. ATR ratio 5/20 (0-30)
  const atrRatio = data.atrRatio5v20;
  if (atrRatio !== null) {
    let earned = 0;
    if (atrRatio <= 0.5) { earned = 30; evidence.push(`ATR contracting sharply (ratio ${atrRatio.toFixed(2)})`); }
    else if (atrRatio <= 0.65) { earned = 22; evidence.push(`ATR contracting (ratio ${atrRatio.toFixed(2)})`); }
    else if (atrRatio <= 0.8) { earned = 14; }
    else if (atrRatio > 1.2) { caution.push("Volatility expanding — not compressing"); }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 5b. Tight closes (0-20)
  if (data.vcpTightCloses !== null) {
    slots.push({
      earned: data.vcpTightCloses ? 20 : 0,
      possible: 20,
      hasData: true,
    });
    if (data.vcpTightCloses) evidence.push("Tight daily closes — low volatility");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 5c. Inside bars (0-25)
  if (data.vcpInsideBarCount !== null) {
    const ibc = data.vcpInsideBarCount;
    let earned = 0;
    if (ibc >= 3) { earned = 25; evidence.push(`${ibc} inside bars — high compression`); }
    else if (ibc >= 2) { earned = 18; evidence.push(`${ibc} inside bars`); }
    else if (ibc >= 1) { earned = 10; }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 5d. Closes near range top (0-25)
  if (data.closesNearRangeTop !== null) {
    slots.push({
      earned: data.closesNearRangeTop ? 25 : 0,
      possible: 25,
      hasData: true,
    });
    if (data.closesNearRangeTop) evidence.push("Closes near range top — buyers in control");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 6. Higher Low Quality (0-100, weight 10%) ──
// Scores the quality and count of higher lows — key structural confirmation.

function scoreHigherLowQuality(
  data: PreRunStockData,
  structureHLCount: number,
): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 6a. Higher low count from market structure analysis (0-40)
  {
    let earned = 0;
    if (structureHLCount >= 3) { earned = 40; evidence.push(`${structureHLCount} higher lows — strong bullish structure`); }
    else if (structureHLCount >= 2) { earned = 30; evidence.push(`${structureHLCount} higher lows`); }
    else if (structureHLCount >= 1) { earned = 18; evidence.push("1 higher low forming"); }
    else { caution.push("No higher lows detected"); }
    slots.push({ earned, possible: 40, hasData: true });
  }

  // 6b. Original higher lows from data.ts (0-30) — cross-validation
  if (data.higherLowsCount !== null) {
    const hl = data.higherLowsCount;
    let earned = 0;
    if (hl >= 3) { earned = 30; }
    else if (hl >= 2) { earned = 20; }
    else if (hl >= 1) { earned = 10; }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 6c. EMA reclaim (0-30) — confirms HL is above key levels
  if (data.aboveEma21 !== null && data.aboveEma50 !== null) {
    let earned = 0;
    if (data.aboveEma21 && data.aboveEma50) { earned = 30; }
    else if (data.aboveEma21) { earned = 18; }
    else if (data.aboveEma50) { earned = 10; }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 7. RS Trajectory (0-100, weight 10%) ──
// Uses trajectory (acceleration/trend) as primary, absolute level as secondary.

function scoreRSTrajectory(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 7a. RS acceleration vs SPY (0-35)
  const rsAccel = data.instRsAccelVsSPY;
  if (rsAccel !== null) {
    let earned = 0;
    if (rsAccel >= 5) { earned = 35; evidence.push(`RS accelerating strongly vs SPY (+${rsAccel.toFixed(1)})`); }
    else if (rsAccel >= 3) { earned = 28; evidence.push(`RS improving vs SPY (+${rsAccel.toFixed(1)})`); }
    else if (rsAccel >= 1) { earned = 22; }
    else if (rsAccel >= -1) { earned = 14; }
    // Key insight: slightly negative but improving trajectory = early inflection
    else if (rsAccel >= -3 && (data.instRsAccelTrend ?? 0) > 0) {
      earned = 18;
      evidence.push("RS trajectory improving despite negative absolute");
    }
    else { earned = 0; caution.push("RS weakening vs SPY"); }
    slots.push({ earned, possible: 35, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 7b. RS vs SPY absolute (0-20)
  const rs20d = data.relativeStrength20d;
  if (rs20d !== null) {
    let earned = 0;
    if (rs20d >= 10) { earned = 20; }
    else if (rs20d >= 5) { earned = 15; }
    else if (rs20d >= 0) { earned = 10; }
    else if (rs20d >= -5) { earned = 5; }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 7c. RS vs sector (0-20)
  const rsSector = data.rs5dVsSector ?? data.relativeStrength20d;
  if (rsSector !== null) {
    let earned = 0;
    if (rsSector >= 8) { earned = 20; evidence.push("Outperforming sector significantly"); }
    else if (rsSector >= 3) { earned = 14; }
    else if (rsSector >= 0) { earned = 8; }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 7d. RS acceleration trend (0-25) — is acceleration itself increasing?
  const rsAccelTrend = data.instRsAccelTrend;
  if (rsAccelTrend !== null) {
    let earned = 0;
    if (rsAccelTrend > 2) { earned = 25; evidence.push("RS acceleration increasing — momentum building"); }
    else if (rsAccelTrend > 0) { earned = 18; }
    else if (rsAccelTrend > -1) { earned = 8; }
    else { caution.push("RS momentum fading"); }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}

// ── 8. Volume Profile (0-100, weight 20%) ──
// Comprehensive volume analysis: accum/distrib ratio, OBV slope, money flow.

function scoreVolumeProfile(data: PreRunStockData): { score: number; evidence: string[]; caution: string[] } {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 8a. Up/down volume ratio (0-25)
  const avgUp = data.avgVolumeUpDays;
  const avgDown = data.avgVolumeDownDays;
  if (avgUp !== null && avgDown !== null) {
    const ratio = avgDown > 0 ? avgUp / avgDown : 1;
    let earned = 0;
    if (ratio >= 1.8) { earned = 25; evidence.push("Strong buying volume dominance"); }
    else if (ratio >= 1.4) { earned = 18; evidence.push("Buyers outpacing sellers on volume"); }
    else if (ratio >= 1.0) { earned = 10; }
    else { caution.push("Sellers dominating volume"); }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 8b. OBV divergence (0-25)
  if (data.obvDivergent !== null) {
    slots.push({
      earned: data.obvDivergent ? 25 : 0,
      possible: 25,
      hasData: true,
    });
    if (data.obvDivergent) evidence.push("OBV divergence — hidden buying");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 8c. Accumulation day count (0-25)
  if (data.accumulationDayCount !== null) {
    const ad = data.accumulationDayCount;
    let earned = 0;
    if (ad >= 8) { earned = 25; evidence.push(`${ad} accumulation days in last 20`); }
    else if (ad >= 5) { earned = 18; evidence.push(`${ad} accumulation days`); }
    else if (ad >= 3) { earned = 10; }
    slots.push({ earned, possible: 25, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 8d. Money flow persistence (0-25)
  if (data.moneyFlowPersistence !== null) {
    const mfp = data.moneyFlowPersistence;
    let earned = 0;
    if (mfp >= 12) { earned = 25; evidence.push("Sustained institutional money flow"); }
    else if (mfp >= 8) { earned = 18; }
    else if (mfp >= 5) { earned = 10; }
    slots.push({ earned, possible: 25, hasData: true });
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
function classifyState(
  se: number,
  accum: number,
  choch: number,
  bos: number,
  compression: number,
  hlQuality: number,
  rs: number,
  volume: number,
  data: PreRunStockData,
  chochDetected: boolean,
  bosDetected: boolean,
  structureBias: "bullish" | "bearish" | "neutral",
): TransitionState {
  const pctFromAth = data.pctFromAth ?? 100;
  const distEma = data.instDistFromEma20Atr ?? 0;

  // STATE 10: EXTENDED — overextended from MAs
  if (pctFromAth < 5 && distEma > 3) return "EXTENDED";

  // STATE 9: SUSTAINED_MARKUP — confirmed uptrend with bullish structure
  if (
    bosDetected &&
    structureBias === "bullish" &&
    rs >= 40 &&
    pctFromAth < 15 &&
    volume >= 35
  ) return "SUSTAINED_MARKUP";

  // STATE 8: EARLY_EXPANSION — breakout from compression with volume
  if (
    bosDetected &&
    compression >= 30 &&
    volume >= 40 &&
    (data.closesNearRangeTop === true) &&
    rs >= 25
  ) return "EARLY_EXPANSION";

  // STATE 7: COMPRESSION — ATR contracting near highs after BOS
  if (
    bosDetected &&
    compression >= 40
  ) return "COMPRESSION";
  // Alt: compression even without BOS but with strong structure
  if (
    chochDetected &&
    compression >= 50 &&
    hlQuality >= 40
  ) return "COMPRESSION";

  // STATE 6: BULLISH_BOS — break of structure confirmed
  // Require meaningful HL quality + volume support to avoid catching every stock in a bull market
  if (bosDetected && hlQuality >= 40 && volume >= 30) return "BULLISH_BOS";

  // STATE 5: HIGHER_LOW_FORMATION — higher low after ChoCH
  if (chochDetected && hlQuality >= 45) return "HIGHER_LOW_FORMATION";
  // Alt: strong HL quality without explicit ChoCH detection
  if (hlQuality >= 55 && accum >= 40 && structureBias === "bullish") return "HIGHER_LOW_FORMATION";

  // STATE 4: BULLISH_CHOCH — change of character detected
  // Require some accumulation evidence, not just a naked ChoCH
  if (chochDetected && (accum >= 25 || se >= 30)) return "BULLISH_CHOCH";

  // STATE 3: DEMAND_INCREASING — buyers emerging
  if (accum >= 45 && volume >= 45 && se >= 35) return "DEMAND_INCREASING";
  // Alt: strong volume profile with solid accumulation
  if (volume >= 55 && accum >= 40) return "DEMAND_INCREASING";

  // STATE 2: ACCUMULATION — range-bound with stealth buying
  if (accum >= 40 && se >= 30) return "ACCUMULATION";
  // Alt: OBV divergence present with meaningful seller exhaustion
  if (data.obvDivergent === true && se >= 30 && accum >= 25) return "ACCUMULATION";

  // STATE 1: SELLING_EXHAUSTION — selling pressure declining
  if (se >= 45) return "SELLING_EXHAUSTION";
  if (se >= 35 && (data.vpDivergenceBullish === true)) return "SELLING_EXHAUSTION";

  // STATE 0: MARKDOWN — default
  return "MARKDOWN";
}

// ── Alert State ──

function classifyAlertState(
  state: TransitionState,
  overallScore: number,
  triggerLevel: number | null,
  currentPrice: number | null,
  atrPct: number | null,
): TransitionAlertState {
  const stateNum = TRANSITION_STATE_ORDER[state];

  // INVALIDATED: markdown with no recovery signals
  if (stateNum === 0) return "INVALIDATED";

  // TRIGGERED: in expansion states with strong score
  if (stateNum >= 8 && overallScore >= 50) return "TRIGGERED";

  // READY: approaching trigger level with conviction
  if (stateNum >= 4 && triggerLevel !== null && currentPrice !== null && atrPct !== null) {
    const distToTrigger = ((triggerLevel - currentPrice) / currentPrice) * 100;
    // Already above trigger with strong score = TRIGGERED
    if (distToTrigger <= 0 && overallScore >= 40) return "TRIGGERED";
    // Within 2% or 2 ATR of trigger = READY
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

export function scoreTransition(data: PreRunStockData): TransitionResult {
  const gates = evaluateGates(data);

  // Run market structure analysis using available OHLC data
  // We need highs, lows, closes arrays — these come from the chart data
  // stored in PreRunStockData's computed fields. Since we don't have raw
  // OHLC arrays in PreRunStockData, we use the precomputed indicators
  // and supplement with market-structure analysis when raw data is available.
  //
  // For the chart-based structure analysis, the cron route passes raw OHLC
  // via a separate call. Here we use the precomputed fields from fetchPreRunData().
  // Market structure (ChoCH/BOS) detection requires raw OHLC — see scoreTransitionWithOHLC.

  // Placeholder: no raw OHLC available via PreRunStockData
  // The cron route will call scoreTransitionWithOHLC() which has chart data.
  return scoreTransitionWithStructure(data, {
    chochDetected: false,
    chochBarsAgo: null,
    bosDetected: false,
    bosBarsAgo: null,
    higherLowCount: 0,
    higherHighCount: 0,
    lowerHighCount: 0,
    lowerLowCount: 0,
    structureBias: "neutral",
    triggerLevel: null,
    invalidationLevel: null,
  });
}

interface StructureInput {
  chochDetected: boolean;
  chochBarsAgo: number | null;
  bosDetected: boolean;
  bosBarsAgo: number | null;
  higherLowCount: number;
  higherHighCount: number;
  lowerHighCount: number;
  lowerLowCount: number;
  structureBias: "bullish" | "bearish" | "neutral";
  triggerLevel: number | null;
  invalidationLevel: number | null;
}

/**
 * Score transition with pre-computed market structure data.
 * Called by the cron route which has access to raw OHLC arrays.
 */
export function scoreTransitionWithStructure(
  data: PreRunStockData,
  structure: StructureInput,
): TransitionResult {
  const gates = evaluateGates(data);

  // Score all 8 components
  const seResult = scoreSellerExhaustion(data);
  const accumResult = scoreAccumulationQuality(data);
  const chochResult = scoreChochConfirmation(data, structure.chochDetected, structure.chochBarsAgo);
  const bosResult = scoreBosConfirmation(data, structure.bosDetected, structure.bosBarsAgo, structure.chochDetected);
  const compressionResult = scoreCompressionQuality(data);
  const hlResult = scoreHigherLowQuality(data, structure.higherLowCount);
  const rsResult = scoreRSTrajectory(data);
  const volResult = scoreVolumeProfile(data);

  // Weighted composite
  // SE(10%) + Accum(15%) + ChoCH(15%) + BOS(10%) + Compression(10%)
  // + HL(10%) + RS(10%) + Volume(20%)
  const rawWeighted =
    seResult.score * 0.10 +
    accumResult.score * 0.15 +
    chochResult.score * 0.15 +
    bosResult.score * 0.10 +
    compressionResult.score * 0.10 +
    hlResult.score * 0.10 +
    rsResult.score * 0.10 +
    volResult.score * 0.20;

  const overallScore = Number.isFinite(rawWeighted)
    ? Math.round(rawWeighted)
    : 0;

  const scores: TransitionScores = {
    sellerExhaustion: seResult.score,
    accumulationQuality: accumResult.score,
    chochConfirmation: chochResult.score,
    bosConfirmation: bosResult.score,
    compressionQuality: compressionResult.score,
    higherLowQuality: hlResult.score,
    rsTrajectory: rsResult.score,
    volumeProfile: volResult.score,
    overallScore,
  };

  // State classification
  const state = classifyState(
    seResult.score, accumResult.score, chochResult.score, bosResult.score,
    compressionResult.score, hlResult.score, rsResult.score, volResult.score,
    data, structure.chochDetected, structure.bosDetected, structure.structureBias,
  );

  // Trigger / invalidation
  const triggerLevel = structure.triggerLevel;
  const invalidationLevel = structure.invalidationLevel;

  // Alert state
  const alertState = classifyAlertState(
    state, overallScore, triggerLevel, data.currentPrice, data.vcpAtrPct ?? null,
  );

  // Merge evidence
  const bullishEvidence = [
    ...seResult.evidence,
    ...accumResult.evidence,
    ...chochResult.evidence,
    ...bosResult.evidence,
    ...compressionResult.evidence,
    ...hlResult.evidence,
    ...rsResult.evidence,
    ...volResult.evidence,
  ];
  const cautionEvidence = [
    ...seResult.caution,
    ...accumResult.caution,
    ...chochResult.caution,
    ...bosResult.caution,
    ...compressionResult.caution,
    ...hlResult.caution,
    ...rsResult.caution,
    ...volResult.caution,
  ];

  const stateNum = TRANSITION_STATE_ORDER[state];

  const isPrimarySignal =
    overallScore >= 45 &&
    stateNum >= 4 && // BULLISH_CHOCH or higher
    alertState !== "INVALIDATED";

  const isStrongerSignal =
    overallScore >= 55 &&
    stateNum >= 6 && // BULLISH_BOS or higher
    alertState !== "INVALIDATED";

  return {
    data,
    gates,
    scores,
    state,
    alertState,
    triggerLevel,
    invalidationLevel,
    bullishEvidence,
    cautionEvidence,
    isPrimarySignal,
    isStrongerSignal,
  };
}

/**
 * Score transition with raw OHLC arrays (used by cron route).
 * Runs market structure analysis from chart data, then delegates to scoring.
 */
export function scoreTransitionWithOHLC(
  data: PreRunStockData,
  highs: number[],
  lows: number[],
  closes: number[],
  n = 3,
): TransitionResult {
  const ms = analyzeMarketStructure(highs, lows, closes, n);

  return scoreTransitionWithStructure(data, {
    chochDetected: ms.choch.detected,
    chochBarsAgo: ms.choch.barsAgo,
    bosDetected: ms.bos.detected,
    bosBarsAgo: ms.bos.barsAgo,
    higherLowCount: ms.higherLowCount,
    higherHighCount: ms.higherHighCount,
    lowerHighCount: ms.lowerHighCount,
    lowerLowCount: ms.lowerLowCount,
    structureBias: ms.structureBias,
    triggerLevel: computeTriggerLevel(ms.swingHighs),
    invalidationLevel: computeInvalidationLevel(ms.swingLows),
  });
}
