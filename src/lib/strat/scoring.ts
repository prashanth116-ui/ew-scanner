/**
 * Strat scoring engine.
 * Total score: 0-10 (TFC 0-3 + Combo 0-5 + Actionability 0-2).
 */

import type {
  StratResult,
  StratSignal,
  StratTimeframe,
  StratCombo,
  StratTFC,
} from "./types";
import {
  detectCombos,
  computeTFC,
  detectPMG,
  computeTriggers,
  barDirection,
} from "./engine";

/** Score TFC alignment: 0-3 (number of aligned timeframes). */
function scoreTFC(tfc: StratTFC): number {
  return tfc.score;
}

/** Score combo quality: 0-5. */
function scoreCombo(combos: StratCombo[], tfc: StratTFC): number {
  if (combos.length === 0) return 0;

  let score = 1; // base: any combo detected

  // +1 for reversal combo
  if (combos.some((c) => c.name.includes("REV"))) score++;

  // +1 for weekly combo
  if (combos.some((c) => c.timeframe === "weekly" && c.isActionable)) score++;

  // +2 for monthly combo
  if (combos.some((c) => c.timeframe === "monthly" && c.isActionable)) score += 2;

  // +1 for combo aligned with TFC direction
  const tfcDir = tfc.alignment === "FULL_BULL" ? "BULL" : tfc.alignment === "FULL_BEAR" ? "BEAR" : null;
  if (tfcDir && combos.some((c) => c.direction === tfcDir && c.isActionable)) score++;

  return Math.min(5, score);
}

/** Score actionability: 0-2. */
function scoreActionability(combos: StratCombo[], tfc: StratTFC): number {
  let score = 0;

  // +1 if any trigger exists
  const hasTrigger = combos.some((c) => c.isActionable);
  if (hasTrigger) score++;

  // +1 if trigger aligns with TFC direction
  const tfcDir = tfc.alignment === "FULL_BULL" ? "BULL" : tfc.alignment === "FULL_BEAR" ? "BEAR" : null;
  if (tfcDir && combos.some((c) => c.isActionable && c.direction === tfcDir)) score++;

  return score;
}

/** Classify signal based on score and combos. */
function classifySignal(totalScore: number, combos: StratCombo[]): StratSignal {
  const hasActionable = combos.some((c) => c.isActionable);
  const hasAnyCombo = combos.length > 0;

  if (totalScore >= 7 && hasActionable) return "ACTIONABLE";
  if (totalScore >= 4 || hasAnyCombo) return "SETTING_UP";
  if (totalScore <= 1 && !hasAnyCombo) return "NEUTRAL";
  return "CONFLICTED";
}

/** Full scoring pipeline for a single ticker's strat data. */
export function scoreStrat(
  ticker: string,
  companyName: string,
  currentPrice: number | null,
  monthly: StratTimeframe | null,
  weekly: StratTimeframe | null,
  daily: StratTimeframe | null
): StratResult {
  // Detect combos per timeframe
  const allCombos: StratCombo[] = [];
  if (monthly) allCombos.push(...detectCombos(monthly.bars, "monthly"));
  if (weekly) allCombos.push(...detectCombos(weekly.bars, "weekly"));
  if (daily) allCombos.push(...detectCombos(daily.bars, "daily"));

  // Compute TFC
  const tfc = computeTFC(
    monthly?.direction ?? "NEUTRAL",
    weekly?.direction ?? "NEUTRAL",
    daily?.direction ?? "NEUTRAL"
  );

  // Detect PMGs
  const allPMGs: StratResult["pmgs"] = [];
  if (monthly) allPMGs.push(...detectPMG(monthly.bars, "monthly"));
  if (weekly) allPMGs.push(...detectPMG(weekly.bars, "weekly"));
  if (daily) allPMGs.push(...detectPMG(daily.bars, "daily"));

  // Compute triggers
  const triggers = computeTriggers(allCombos);

  // Score
  const tfcScore = scoreTFC(tfc);
  const comboScore = scoreCombo(allCombos, tfc);
  const actionabilityScore = scoreActionability(allCombos, tfc);
  const totalScore = tfcScore + comboScore + actionabilityScore;
  const normalizedScore = Math.min(10, totalScore);

  // Signal classification
  const signal = classifySignal(totalScore, allCombos);

  return {
    ticker,
    companyName,
    currentPrice,
    monthly,
    weekly,
    daily,
    tfc,
    combos: allCombos,
    triggers,
    pmgs: allPMGs,
    scores: {
      tfcScore,
      comboScore,
      actionabilityScore,
      totalScore,
      normalizedScore,
    },
    signal,
  };
}
