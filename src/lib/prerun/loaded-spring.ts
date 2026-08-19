/**
 * Loaded Spring — maximum stored energy, no trigger yet.
 *
 * COILED asks "is this about to go": supply exhausted AND demand emerging. This asks the
 * different question that MRNA exposed — which names have enormous room to move and no
 * reason to move yet?
 *
 * MRNA sat at runner 76 (clean air overhead, 6% ATR, deep 256-week base), supply
 * exhausted at 38, and demand at 20 — six flat sessions on falling volume, no pocket
 * pivots, no absorption. It failed COILED correctly: there was no demand to find, because
 * the move came from a clinical readout the chart could not contain. Then it gapped +117%
 * on 9.5x volume.
 *
 * The scanners cannot predict that and this does not pretend to. What it does is answer
 * the question you CAN act on: given that a price engine will never see a readout date,
 * which names are worth going and finding the date for? A loaded spring plus a catalyst
 * you researched is a thesis. A loaded spring alone is a watchlist entry, not a trade.
 *
 * Explicitly NOT an entry signal. Low demand is the defining feature — these are names
 * nobody wants right now, and most will stay unwanted. Read it as a research queue.
 *
 * Isomorphic: no server-only imports, so pages and crons share one definition.
 */

/**
 * Thresholds calibrated against the 2026-08-19 inflection distribution
 * (289 rows: runner p75=60 p90=66, se p75=42, demand p25=18 med=25 p75=35).
 *
 * runner >= 60 is roughly the top quartile — real room, not a marginal case.
 * se >= 35 sits just above the median: sellers demonstrably finished. Deliberately NOT
 *   raised to 40, which would have excluded MRNA at 38 — the exact name this exists for.
 * demand < 38 is the COILED bar. Below it by construction, so the two screens never
 *   overlap: a name with demand is coiled, a name without it is a spring.
 *
 * Yields ~27 names of 289, of which ~11 are focus names. Small enough to research.
 */
export const LOADED_SPRING = {
  MIN_RUNNER: 60,
  MIN_SE: 35,
  MAX_DEMAND: 38,
} as const;

export interface SpringInputs {
  runnerScore?: number | null;
  seScore?: number | null;
  demandScore?: number | null;
  extensionRisk?: boolean | null;
  isCoiled?: boolean | null;
}

/**
 * Nulls fail rather than bypass — the opposite of the focus predicate, deliberately.
 *
 * Focus asks "would you trade this", where a missing field should not disqualify a name
 * you chose by hand. This asks "is the energy measurably there", and an unmeasured
 * component is not evidence of stored energy. Treating null as passing would fill the
 * screen with thin-data rows, which is precisely the population it must not surface.
 */
export function isLoadedSpring(x: SpringInputs): boolean {
  if (x.isCoiled === true) return false;      // already has demand — that is COILED
  if (x.extensionRisk === true) return false; // already moved — the energy was spent
  if (x.runnerScore == null || x.seScore == null || x.demandScore == null) return false;
  return (
    x.runnerScore >= LOADED_SPRING.MIN_RUNNER &&
    x.seScore >= LOADED_SPRING.MIN_SE &&
    x.demandScore < LOADED_SPRING.MAX_DEMAND
  );
}

/**
 * How loaded, for ranking. Runner dominates because it is the magnitude term — among
 * names that all lack a trigger, the one with the most room is the one worth researching
 * first. SE breaks ties: sellers more thoroughly finished means less left to absorb.
 */
export function springRank(x: SpringInputs): number {
  return (x.runnerScore ?? 0) * 2 + (x.seScore ?? 0);
}
