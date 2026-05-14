/**
 * Strat scoring engine.
 * Total score: 0-13 (TFC 0-3 + Combo 0-5 + Actionability 0-2 + PMG 0-2 + Volume 0-1).
 */

import type {
  StratResult,
  StratSignal,
  StratTimeframe,
  StratCombo,
  StratTFC,
  StratPMG,
  StratBroadening,
  StratTriggers,
} from "./types";
import {
  detectCombos,
  computeTFC,
  detectPMG,
  detectBroadening,
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

  // +1 for multi-TF combo alignment: actionable combos in 2+ different timeframes share direction
  const bullTFs = new Set(combos.filter((c) => c.isActionable && c.direction === "BULL").map((c) => c.timeframe));
  const bearTFs = new Set(combos.filter((c) => c.isActionable && c.direction === "BEAR").map((c) => c.timeframe));
  if (bullTFs.size >= 2 || bearTFs.size >= 2) score++;

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

/** Score PMG + trigger coincidence: 0-2. */
function scorePMG(
  pmgs: StratPMG[],
  triggers: StratTriggers,
  combos: StratCombo[]
): number {
  if (pmgs.length === 0) return 0;

  const TOLERANCE = 0.003; // 0.3%
  let score = 0;

  const hasBullCombo = combos.some((c) => c.isActionable && c.direction === "BULL");
  const hasBearCombo = combos.some((c) => c.isActionable && c.direction === "BEAR");

  // +1 if any PMG HIGH level ~ longTrigger and BULL combo exists
  if (triggers.longTrigger != null && hasBullCombo) {
    const triggerVal = triggers.longTrigger;
    if (pmgs.some((p) => p.side === "HIGH" && Math.abs(p.level - triggerVal) / triggerVal <= TOLERANCE)) {
      score++;
    }
  }

  // +1 if any PMG LOW level ~ shortTrigger and BEAR combo exists
  if (triggers.shortTrigger != null && hasBearCombo) {
    const triggerVal = triggers.shortTrigger;
    if (pmgs.some((p) => p.side === "LOW" && Math.abs(p.level - triggerVal) / triggerVal <= TOLERANCE)) {
      score++;
    }
  }

  return Math.min(2, score);
}

/** Score volume confirmation: 0-1. */
function scoreVolume(daily: StratTimeframe | null): number {
  if (!daily || daily.bars.length < 2) return 0;

  const volumes = daily.bars.map((b) => b.volume).filter((v) => v > 0);
  if (volumes.length < 2) return 0;

  const avg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const lastBar = daily.bars[daily.bars.length - 1];

  // +1 if last bar volume >= 1.5x average
  if (lastBar.volume >= avg * 1.5) return 1;
  return 0;
}

/** Compute dominant actionable direction from combos. */
function computeActionDirection(combos: StratCombo[]): StratResult["actionDirection"] {
  const bullActionable = combos.filter((c) => c.isActionable && c.direction === "BULL");
  const bearActionable = combos.filter((c) => c.isActionable && c.direction === "BEAR");

  if (bullActionable.length > 0 && bearActionable.length > 0) return "BOTH";
  if (bullActionable.length > 0) return "LONG";
  if (bearActionable.length > 0) return "SHORT";
  return null;
}

/** Classify signal based on score and combos. */
function classifySignal(totalScore: number, combos: StratCombo[]): StratSignal {
  const hasActionable = combos.some((c) => c.isActionable);
  const hasAnyCombo = combos.length > 0;

  if (totalScore >= 8 && hasActionable) return "ACTIONABLE";
  if (totalScore >= 5 || hasAnyCombo) return "SETTING_UP";
  if (totalScore <= 2 && !hasAnyCombo) return "NEUTRAL";
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

  // Detect broadenings
  const allBroadenings: StratBroadening[] = [];
  if (monthly) allBroadenings.push(...detectBroadening(monthly.bars, "monthly"));
  if (weekly) allBroadenings.push(...detectBroadening(weekly.bars, "weekly"));
  if (daily) allBroadenings.push(...detectBroadening(daily.bars, "daily"));

  // Compute triggers
  const triggers = computeTriggers(allCombos);

  // Score
  const tfcScore = scoreTFC(tfc);
  const comboScore = scoreCombo(allCombos, tfc);
  const actionabilityScore = scoreActionability(allCombos, tfc);
  const pmgScore = scorePMG(allPMGs, triggers, allCombos);
  const volumeScore = scoreVolume(daily);
  const totalScore = tfcScore + comboScore + actionabilityScore + pmgScore + volumeScore;
  const normalizedScore = Math.min(13, totalScore);

  // Signal classification
  const signal = classifySignal(totalScore, allCombos);

  // Action direction
  const actionDirection = computeActionDirection(allCombos);

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
    broadenings: allBroadenings,
    scores: {
      tfcScore,
      comboScore,
      actionabilityScore,
      pmgScore,
      volumeScore,
      totalScore,
      normalizedScore,
    },
    signal,
    actionDirection,
  };
}
