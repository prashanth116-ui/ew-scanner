/**
 * Runner Potential — how far can this thing actually go?
 *
 * Both scanners scored setup READINESS and neither scored MAGNITUDE. Two stocks with
 * identical composites — one with 1.2% ADR, four overhead supply shelves and a 400M float,
 * one with 4.5% ADR, clean air above and a 40M float — ranked the same. That is why the
 * output read as a list of well-formed setups rather than a list of runners.
 *
 * This component answers the second question. It is deliberately independent of setup
 * quality: a perfect base on a stock that cannot move should score high on exhaustion and
 * compression and LOW here, and the composite should reflect that.
 *
 * Shared by Inflection and Transition so the definition of "runner" is one thing.
 *
 * SERVER-ONLY: used by /api/prerun/*, /api/inflection/*, /api/transition/* routes.
 */

import "server-only";

import type { PreRunStockData } from "./types";
import { nullNeutralScore, type ScoreSlot } from "./score-slot";

export interface RunnerPotentialResult {
  score: number;
  evidence: string[];
  caution: string[];
}

/**
 * Score 0-100. Higher = more room and more fuel for a sustained move.
 *
 * Slots, in descending order of how much they determine the size of a move:
 *   overhead supply 27 · ADR 22 · base energy 18 · float rotation 13 · risk distance 12
 *   · insider conviction 8
 *
 * Risk distance makes this a reward-vs-risk measure rather than pure magnitude: a runner
 * with the invalidation level 3 ATR below price is a better trade than the same runner with
 * it 15 ATR below, because the position can actually be sized.
 */
export function scoreRunnerPotential(
  data: PreRunStockData,
  invalidationLevel: number | null = null,
): RunnerPotentialResult {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 1. Overhead supply (0-30) — the resistance the move has to chew through.
  // The single best predictor of whether a breakout runs or stalls.
  const overhead = data.overheadSupply;
  if (overhead !== null) {
    let earned = 0;
    if (overhead <= 5) { earned = 27; evidence.push("Clean air overhead — almost no supply above current price"); }
    else if (overhead <= 15) { earned = 22; evidence.push(`Light overhead supply (${overhead.toFixed(0)}% of yearly volume above)`); }
    else if (overhead <= 30) { earned = 14; evidence.push(`Moderate overhead supply (${overhead.toFixed(0)}%)`); }
    else if (overhead <= 45) { earned = 6; caution.push(`Heavy overhead supply (${overhead.toFixed(0)}%) — trapped holders to work through`); }
    else { earned = 0; caution.push(`Very heavy overhead supply (${overhead.toFixed(0)}%) — multiple ceilings above`); }
    slots.push({ earned, possible: 27, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2. ADR / daily range (0-25) — the raw capacity to move.
  // A 1.2% ADR name does not produce a 30% run in a month regardless of how good the base is.
  const atrPct = data.vcpAtrPct;
  if (atrPct !== null) {
    let earned = 0;
    if (atrPct >= 5) { earned = 22; evidence.push(`${atrPct.toFixed(1)}% ATR — high daily range`); }
    else if (atrPct >= 3.5) { earned = 19; evidence.push(`${atrPct.toFixed(1)}% ATR — good range`); }
    else if (atrPct >= 2.5) { earned = 12; }
    else if (atrPct >= 1.8) { earned = 6; }
    else { earned = 0; caution.push(`${atrPct.toFixed(1)}% ATR — too little daily range to run`); }
    slots.push({ earned, possible: 22, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 3. Base energy (0-20) — depth multiplied by duration.
  // A deep base held a long time has stored more energy than a three-week shelf.
  const depth = data.pctFromAth;
  const weeks = data.weeksInBase;
  if (depth !== null && weeks !== null) {
    // Depth saturates around 60% — beyond that it is damage, not a coil
    const depthScore = Math.min(depth, 60) / 60;
    // Duration saturates at ~52 weeks
    const durationScore = Math.min(weeks, 52) / 52;
    const energy = depthScore * durationScore;
    let earned = 0;
    if (energy >= 0.45) { earned = 18; evidence.push(`Deep, long base (${depth.toFixed(0)}% off ATH, ${weeks}w) — substantial stored energy`); }
    else if (energy >= 0.25) { earned = 13; evidence.push(`${depth.toFixed(0)}% off ATH over ${weeks}w`); }
    else if (energy >= 0.12) { earned = 8; }
    else if (energy >= 0.05) { earned = 4; }
    else { caution.push("Shallow or brief base — little stored energy"); }
    slots.push({ earned, possible: 18, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 4. Float rotation (0-15) — how quickly the tradeable supply is changing hands.
  // Fast rotation on a small float is what turns demand into gap-ups.
  const turnover = data.floatTurnover20d;
  if (turnover !== null) {
    let earned = 0;
    if (turnover >= 1.5) { earned = 13; evidence.push("Float turning over rapidly — supply changing hands"); }
    else if (turnover >= 0.8) { earned = 10; }
    else if (turnover >= 0.4) { earned = 6; }
    else { earned = 2; }
    slots.push({ earned, possible: 13, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 5. Insider conviction (0-10) — moved here from Institutional Participation.
  // Insider buying is forward-looking fuel, not a description of current ownership.
  const buys45 = data.insiderBuys45d;
  const buys90 = data.insiderBuys90d;
  if (buys45 !== null || buys90 !== null) {
    const b45 = buys45 ?? 0;
    const b90 = buys90 ?? 0;
    let earned = 0;
    if (b45 >= 3) { earned = 8; evidence.push(`${b45} insider buys in 45 days — cluster`); }
    else if (b45 >= 1 || b90 >= 3) { earned = 6; evidence.push("Recent insider buying"); }
    else if (b90 >= 1) { earned = 3; }
    slots.push({ earned, possible: 8, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 6. Risk distance (0-12) — how tight is the stop this setup implies?
  // Restored from the pre-V3 Transition higher-low component, where it was the one measure
  // of trade quality. Magnitude alone is not enough: a 40% runner with a 20% stop is a
  // worse trade than a 25% runner with a 4% stop.
  const price = data.currentPrice;
  const atr = data.vcpAtrPct;
  if (invalidationLevel !== null && price !== null && price > 0 && atr !== null && atr > 0) {
    const riskAtr = ((price - invalidationLevel) / price) * 100 / atr;
    let earned = 0;
    if (riskAtr <= 0) { earned = 0; caution.push("Price is at or below the invalidation level"); }
    else if (riskAtr <= 4) { earned = 12; evidence.push(`Tight structure — invalidation ${riskAtr.toFixed(1)} ATR below price`); }
    else if (riskAtr <= 7) { earned = 8; }
    else if (riskAtr <= 12) { earned = 4; }
    else { earned = 1; caution.push("Invalidation far below price — loose structure, hard to size"); }
    slots.push({ earned, possible: 12, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}
