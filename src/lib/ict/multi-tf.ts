/**
 * ICT Multi-Timeframe Orchestrator.
 * Runs the ICT engine on every timeframe, derives higher-timeframe bias, and
 * computes a family-weighted confluence score.
 * SERVER-ONLY: Used by /api/ict/* routes.
 */

import "server-only";

import { TIMEFRAMES, MULTI_TF, TF_FAMILY, HTF_TIMEFRAMES } from "./config";
import type { Timeframe, TFFamily } from "./config";
import { runICTEngine } from "./engine";
import { scoreICTSetup } from "./scoring";
import { ICTState, ICT_STATE_LABELS } from "./types";
import type { ICTMultiTFResult, ICTTimeframeResult, HTFBias } from "./types";
import type { MultiTFData } from "./data";

/** Higher rank = slower timeframe. Used only to break score ties. */
const TF_RANK: Record<Timeframe, number> = { "1h": 0, "4h": 1, "1d": 2, "1wk": 3 };

/**
 * Run the ICT engine on all available timeframes and compute confluence.
 * Each TF result is independent — confluence is a ranking layer.
 */
export function runMultiTimeframe(
  ticker: string,
  data: MultiTFData,
): ICTMultiTFResult | null {
  const results: ICTTimeframeResult[] = [];

  for (const tf of TIMEFRAMES) {
    const ohlc = data.timeframes[tf];
    if (!ohlc) continue;

    const setup = runICTEngine(ohlc.opens, ohlc.highs, ohlc.lows, ohlc.closes, ohlc.timestamps, tf);
    const score = scoreICTSetup(setup, ohlc.opens, ohlc.highs, ohlc.lows, ohlc.closes, tf);

    results.push({ timeframe: tf, setup, score });
  }

  if (results.length === 0) return null;

  // Best timeframe by score; ties go to the slower chart, which carries more
  // weight in the framework than a marginally better intraday read.
  results.sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    if (b.setup.currentState !== a.setup.currentState) return b.setup.currentState - a.setup.currentState;
    return TF_RANK[b.timeframe] - TF_RANK[a.timeframe];
  });

  const best = results[0];
  const price = data.currentPrice ?? 0;

  const armedTimeframes = results
    .filter((r) => r.setup.currentState >= ICTState.ARMED)
    .map((r) => r.timeframe);

  const armedFamilies = [...new Set(armedTimeframes.map((tf) => TF_FAMILY[tf]))];

  const { bias: htfBias, evidence: htfEvidence } = computeHTFBias(results);

  const confluenceScore = computeConfluence(results, best, armedFamilies.length);

  const protectedLow = best.setup.protectedLow;
  const bslTarget = best.setup.bslLevel;
  const riskReward = computeRiskReward(price, bslTarget, protectedLow);

  const range = best.setup.dealingRange;
  const prior = best.setup.priorInvalidation;

  const isTradeable =
    htfBias !== "COUNTER" &&
    best.setup.currentState >= ICTState.BULLISH_MSS &&
    best.score.components.recency > 0 &&
    !best.score.isChasing;

  return {
    ticker,
    price,

    bestTimeframe: best.timeframe,
    bestState: best.setup.currentState,
    bestScore: best.score.total,
    bestSetup: best.setup,
    bestScoreDetail: best.score,

    timeframes: results,

    confluenceScore,
    armedTimeframes,
    armedFamilies,

    htfBias,
    htfEvidence,

    bslTarget,
    protectedLow,
    fvgUpper: best.setup.fvgZone?.upper ?? null,
    fvgLower: best.setup.fvgZone?.lower ?? null,
    distanceToBslPct: best.setup.distanceToBslPct,
    riskReward,

    rangeRetracement: range?.retracement ?? null,
    inDiscount: range?.inDiscount ?? null,
    inOTE: range?.inOTE ?? null,

    stateBarsAgo: best.setup.stateBarsAgo,

    priorInvalidationState: prior ? ICT_STATE_LABELS[prior.state] : null,
    priorInvalidationBarsAgo: prior ? prior.barsAgo : null,
    priorInvalidationReason: prior ? prior.reason : null,

    isChasing: best.score.isChasing,
    isLateEntry: best.score.isLateEntry,
    isTradeable,

    bullishEvidence: best.setup.bullishEvidence,
    cautionEvidence: best.setup.cautionEvidence,
  };
}

/**
 * Reward-to-risk against the two levels the setup already defines.
 * Null when the draw is behind price or the stop is above it.
 */
function computeRiskReward(
  price: number,
  bslTarget: number | null,
  protectedLow: number | null,
): number | null {
  if (!price || bslTarget === null || protectedLow === null) return null;
  const risk = price - protectedLow;
  const reward = bslTarget - price;
  if (risk <= 0 || reward <= 0) return null;
  return Math.round((reward / risk) * 100) / 100;
}

/**
 * Higher-timeframe bias from the daily and weekly structure.
 *
 * The framework is HTF bias first, then the PD array, then the entry. Without
 * this every timeframe was an equal, standalone vote, so a 4h setup running
 * against a dead weekly ranked identically to one running with it — and since
 * the 4h has the most bars it usually won the ranking outright.
 *
 * Applied as a gate on `isTradeable`, never as a score adjustment, so scores
 * stay comparable across regimes. Same treatment the regime gate gets in the
 * Inflection and Transition engines.
 */
function computeHTFBias(results: ICTTimeframeResult[]): { bias: HTFBias; evidence: string } {
  const htf = results.filter((r) => HTF_TIMEFRAMES.includes(r.timeframe));
  if (htf.length === 0) {
    return { bias: "NEUTRAL", evidence: "no daily or weekly data" };
  }

  const strongest = htf.reduce((a, b) =>
    b.setup.currentState > a.setup.currentState ? b : a
  );
  const label = ICT_STATE_LABELS[strongest.setup.currentState];

  if (strongest.setup.currentState >= ICTState.BULLISH_MSS) {
    return { bias: "ALIGNED", evidence: `${strongest.timeframe} structure at ${label}` };
  }
  if (strongest.setup.currentState >= ICTState.SSL_RAID) {
    return { bias: "NEUTRAL", evidence: `${strongest.timeframe} only at ${label} — structure not yet flipped` };
  }
  return {
    bias: "COUNTER",
    evidence: `no bullish structure on ${htf.map((r) => r.timeframe).join(" or ")}`,
  };
}

/**
 * Confluence score: weighted blend across timeframe FAMILIES.
 *
 * 1h and 4h are the same chart at two resolutions. Blending every timeframe
 * equally counted one dataset repeatedly and paid an armed bonus for it, so
 * intraday agreement — which is close to automatic — inflated the number that
 * ranks the whole board. Each family contributes its best member once.
 */
function computeConfluence(
  results: ICTTimeframeResult[],
  best: ICTTimeframeResult,
  armedFamilyCount: number,
): number {
  const byFamily = new Map<TFFamily, number>();
  for (const r of results) {
    const fam = TF_FAMILY[r.timeframe];
    const current = byFamily.get(fam);
    if (current === undefined || r.score.total > current) {
      byFamily.set(fam, r.score.total);
    }
  }

  const bestFamily = TF_FAMILY[best.timeframe];
  const otherFamilies = [...byFamily.entries()].filter(([fam]) => fam !== bestFamily);

  const armedBonus =
    Math.max(0, armedFamilyCount - MULTI_TF.MIN_ARMED_FOR_BONUS) * MULTI_TF.ARMED_BONUS;

  if (otherFamilies.length === 0) {
    return Math.min(100, Math.round(best.score.total + armedBonus));
  }

  const avgOther =
    otherFamilies.reduce((sum, [, score]) => sum + score, 0) / otherFamilies.length;

  const raw =
    best.score.total * MULTI_TF.BEST_TF_WEIGHT +
    avgOther * MULTI_TF.OTHER_TF_WEIGHT +
    armedBonus;

  return Math.min(100, Math.round(raw));
}
