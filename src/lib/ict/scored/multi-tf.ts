/**
 * Scored ICT — multi-timeframe orchestration.
 *
 * Assesses each timeframe independently, then ranks. Confluence is a ranking
 * layer only: it never alters a timeframe's own score.
 *
 * Deliberately free of `server-only` so this stays unit-testable. The data
 * fetch that feeds it (src/lib/ict/data.ts) is the server-only half.
 */

import { assessICT } from "./assess";
import { GRADES } from "./config";
import type { CandleSeries, ICTAssessment, ICTGrade } from "./types";

export interface TimeframeAssessment {
  timeframe: string;
  assessment: ICTAssessment;
}

export interface ICTMultiTFScored {
  ticker: string;
  price: number;

  /** Timeframe carrying the highest score. */
  bestTimeframe: string;
  bestScore: number;
  bestGrade: ICTGrade;
  best: ICTAssessment;

  /** Every timeframe assessed, highest score first. */
  timeframes: TimeframeAssessment[];

  /** Ranking blend across timeframes, 0..100. */
  confluenceScore: number;
  /** Timeframes grading PRIME. */
  primeTimeframes: string[];
  /** Timeframes whose protected low has been broken. */
  invalidatedTimeframes: string[];
}

/** Weighting for the confluence blend. */
export const CONFLUENCE = {
  BEST_WEIGHT: 0.6,
  OTHERS_WEIGHT: 0.4,
  /** Added per additional timeframe grading PRIME beyond the first. */
  AGREEMENT_BONUS: 8,
};

/**
 * Assess every supplied timeframe and rank them.
 *
 * @param series Map of timeframe label to candle series. Null entries skipped.
 */
export function assessMultiTimeframe(
  ticker: string,
  price: number,
  series: Record<string, CandleSeries | null>,
): ICTMultiTFScored | null {
  const results: TimeframeAssessment[] = [];

  for (const [timeframe, data] of Object.entries(series)) {
    if (!data) continue;
    results.push({ timeframe, assessment: assessICT(data) });
  }

  if (results.length === 0) return null;

  results.sort((a, b) => b.assessment.score - a.assessment.score);
  const best = results[0];

  const primeTimeframes = results
    .filter((r) => r.assessment.grade === "PRIME")
    .map((r) => r.timeframe);

  const invalidatedTimeframes = results
    .filter((r) => r.assessment.flags.invalidated)
    .map((r) => r.timeframe);

  return {
    ticker,
    price,
    bestTimeframe: best.timeframe,
    bestScore: best.assessment.score,
    bestGrade: best.assessment.grade,
    best: best.assessment,
    timeframes: results,
    confluenceScore: computeConfluence(results, primeTimeframes.length),
    primeTimeframes,
    invalidatedTimeframes,
  };
}

/**
 * Blend the best timeframe with the average of the rest, plus a bonus when
 * several timeframes independently reach PRIME.
 */
function computeConfluence(results: TimeframeAssessment[], primeCount: number): number {
  const best = results[0].assessment.score;
  if (results.length === 1) return best;

  const others = results.slice(1);
  const avgOthers = others.reduce((sum, r) => sum + r.assessment.score, 0) / others.length;
  const bonus = Math.max(0, primeCount - 1) * CONFLUENCE.AGREEMENT_BONUS;

  return Math.min(
    100,
    Math.round(best * CONFLUENCE.BEST_WEIGHT + avgOthers * CONFLUENCE.OTHERS_WEIGHT + bonus),
  );
}

/** Convenience predicate for scan filtering. */
export function isTradeable(a: ICTAssessment): boolean {
  return !a.flags.invalidated && a.score >= GRADES.FORMING;
}
