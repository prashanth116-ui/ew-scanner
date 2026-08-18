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
 *   overhead supply 30 · ADR 25 · base energy 20 · float rotation 15 · insider conviction 10
 */
export function scoreRunnerPotential(data: PreRunStockData): RunnerPotentialResult {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // 1. Overhead supply (0-30) — the resistance the move has to chew through.
  // The single best predictor of whether a breakout runs or stalls.
  const overhead = data.overheadSupply;
  if (overhead !== null) {
    let earned = 0;
    if (overhead <= 5) { earned = 30; evidence.push("Clean air overhead — almost no supply above current price"); }
    else if (overhead <= 15) { earned = 24; evidence.push(`Light overhead supply (${overhead.toFixed(0)}% of yearly volume above)`); }
    else if (overhead <= 30) { earned = 15; evidence.push(`Moderate overhead supply (${overhead.toFixed(0)}%)`); }
    else if (overhead <= 45) { earned = 7; caution.push(`Heavy overhead supply (${overhead.toFixed(0)}%) — trapped holders to work through`); }
    else { earned = 0; caution.push(`Very heavy overhead supply (${overhead.toFixed(0)}%) — multiple ceilings above`); }
    slots.push({ earned, possible: 30, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 2. ADR / daily range (0-25) — the raw capacity to move.
  // A 1.2% ADR name does not produce a 30% run in a month regardless of how good the base is.
  const atrPct = data.vcpAtrPct;
  if (atrPct !== null) {
    let earned = 0;
    if (atrPct >= 5) { earned = 25; evidence.push(`${atrPct.toFixed(1)}% ATR — high daily range`); }
    else if (atrPct >= 3.5) { earned = 21; evidence.push(`${atrPct.toFixed(1)}% ATR — good range`); }
    else if (atrPct >= 2.5) { earned = 14; }
    else if (atrPct >= 1.8) { earned = 7; }
    else { earned = 0; caution.push(`${atrPct.toFixed(1)}% ATR — too little daily range to run`); }
    slots.push({ earned, possible: 25, hasData: true });
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
    if (energy >= 0.45) { earned = 20; evidence.push(`Deep, long base (${depth.toFixed(0)}% off ATH, ${weeks}w) — substantial stored energy`); }
    else if (energy >= 0.25) { earned = 15; evidence.push(`${depth.toFixed(0)}% off ATH over ${weeks}w`); }
    else if (energy >= 0.12) { earned = 9; }
    else if (energy >= 0.05) { earned = 4; }
    else { caution.push("Shallow or brief base — little stored energy"); }
    slots.push({ earned, possible: 20, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // 4. Float rotation (0-15) — how quickly the tradeable supply is changing hands.
  // Fast rotation on a small float is what turns demand into gap-ups.
  const turnover = data.floatTurnover20d;
  if (turnover !== null) {
    let earned = 0;
    if (turnover >= 1.5) { earned = 15; evidence.push("Float turning over rapidly — supply changing hands"); }
    else if (turnover >= 0.8) { earned = 11; }
    else if (turnover >= 0.4) { earned = 6; }
    else { earned = 2; }
    slots.push({ earned, possible: 15, hasData: true });
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
    if (b45 >= 3) { earned = 10; evidence.push(`${b45} insider buys in 45 days — cluster`); }
    else if (b45 >= 1 || b90 >= 3) { earned = 7; evidence.push("Recent insider buying"); }
    else if (b90 >= 1) { earned = 3; }
    slots.push({ earned, possible: 10, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}
