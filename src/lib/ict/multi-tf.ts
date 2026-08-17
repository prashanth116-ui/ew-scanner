/**
 * ICT Multi-Timeframe Orchestrator.
 * Runs the ICT engine on 5 timeframes, computes confluence.
 * SERVER-ONLY: Used by /api/ict/* routes.
 */

import "server-only";

import { TIMEFRAMES, MULTI_TF } from "./config";
import type { Timeframe } from "./config";
import { runICTEngine } from "./engine";
import { scoreICTSetup } from "./scoring";
import { ICTState, ICT_STATE_LABELS } from "./types";
import type { ICTMultiTFResult, ICTTimeframeResult } from "./types";
import type { MultiTFData } from "./data";

/**
 * Run the ICT engine on all available timeframes and compute confluence.
 * Each TF result is independent — confluence is an optional ranking layer.
 */
export function runMultiTimeframe(
  ticker: string,
  data: MultiTFData,
): ICTMultiTFResult | null {
  const results: ICTTimeframeResult[] = [];

  for (const tf of TIMEFRAMES) {
    const ohlc = data.timeframes[tf];
    if (!ohlc) continue;

    const setup = runICTEngine(ohlc.opens, ohlc.highs, ohlc.lows, ohlc.closes, ohlc.timestamps);
    const score = scoreICTSetup(setup, ohlc.opens, ohlc.highs, ohlc.lows, ohlc.closes);

    results.push({ timeframe: tf, setup, score });
  }

  if (results.length === 0) return null;

  // Find best timeframe by score (tiebreak by state order)
  results.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    return b.setup.currentState - a.setup.currentState;
  });

  const best = results[0];

  // Identify armed timeframes
  const armedTimeframes = results
    .filter((r) => r.setup.currentState >= ICTState.ARMED)
    .map((r) => r.timeframe);

  // Compute confluence score
  const confluenceScore = computeConfluence(results, best);

  // Build per-TF state/score maps
  const stateMap: Partial<Record<Timeframe, string>> = {};
  const scoreMap: Partial<Record<Timeframe, number>> = {};
  for (const r of results) {
    stateMap[r.timeframe] = ICT_STATE_LABELS[r.setup.currentState];
    scoreMap[r.timeframe] = r.score.total;
  }

  return {
    ticker,
    price: data.currentPrice ?? 0,

    bestTimeframe: best.timeframe,
    bestState: best.setup.currentState,
    bestScore: best.score.total,
    bestSetup: best.setup,
    bestScoreDetail: best.score,

    timeframes: results,

    confluenceScore,
    armedTimeframes,

    bslTarget: best.setup.bslLevel,
    protectedLow: best.setup.protectedLow,
    fvgUpper: best.setup.fvgZone?.upper ?? null,
    fvgLower: best.setup.fvgZone?.lower ?? null,
    distanceToBslPct: best.setup.distanceToBslPct,

    isChasing: best.score.isChasing,
    isLateEntry: best.score.isLateEntry,

    bullishEvidence: best.setup.bullishEvidence,
    cautionEvidence: best.setup.cautionEvidence,
  };
}

/**
 * Confluence score: weighted blend of best TF + average of others + armed bonus.
 * Does NOT alter underlying per-TF signals — purely a ranking layer.
 */
function computeConfluence(
  results: ICTTimeframeResult[],
  best: ICTTimeframeResult,
): number {
  if (results.length <= 1) return best.score.total;

  const others = results.filter((r) => r.timeframe !== best.timeframe);
  const avgOther = others.reduce((sum, r) => sum + r.score.total, 0) / others.length;

  const armedCount = results.filter((r) => r.setup.currentState >= ICTState.ARMED).length;
  const armedBonus = Math.max(0, armedCount - MULTI_TF.MIN_ARMED_FOR_BONUS) * MULTI_TF.ARMED_BONUS;

  const raw =
    best.score.total * MULTI_TF.BEST_TF_WEIGHT +
    avgOther * MULTI_TF.OTHER_TF_WEIGHT +
    armedBonus;

  return Math.min(100, Math.round(raw));
}
