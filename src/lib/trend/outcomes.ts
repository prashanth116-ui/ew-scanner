/**
 * Shared math for the component-trend page and its scorecard.
 *
 * Isomorphic on purpose (no `server-only`): the page renders these numbers, the scorecard
 * route measures them, and a test asserts them. If the two sides computed "rising" or
 * "price state" differently the scorecard would be grading a signal the page does not
 * actually show, which is worse than having no scorecard at all.
 */

/**
 * Scans between the setup window's last bar and the outcome measurement.
 *
 * Lives here, not in scorecard.ts, because the trend PAGE needs it to decide which scan
 * dates can be anchored — and scorecard.ts is `server-only`. A client component importing
 * a runtime value from a server-only module passes tsc and vitest and then fails the
 * Turbopack build, which is the exact failure CLAUDE.md records for turn-badge.tsx.
 */
export const FORWARD_SCANS = 5;

/** Setup window length, in scans. Matches the page's shortest selectable window. */
export const SETUP_WINDOW = 5;

/**
 * Price move across the window, bucketed.
 *
 * This exists because the component trend and the price trend are badly confounded, and
 * the page used to hide that. Measured over the V3 archive (2026-08-18 onward), the
 * shipped "both rising" badge returned -0.30% forward 5-scan excess against a -0.33%
 * price-flat control — a dead heat. Nearly everything that looked like component edge was
 * the price move underneath it. So price state is surfaced as its own dimension rather
 * than folded into a score badge, and every scorecard bucket is reported against the
 * price-matched control instead of against the whole cohort.
 *
 * +/-3% matches DIVERGENCE_MIN_PRICE_PCT, which is the band the page already treats as a
 * real move rather than noise.
 */
export const PRICE_STATE_PCT = 3;

export type PriceState = "UP" | "FLAT" | "DOWN";

export function priceState(pct: number | null): PriceState | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct >= PRICE_STATE_PCT) return "UP";
  if (pct <= -PRICE_STATE_PCT) return "DOWN";
  return "FLAT";
}

/**
 * Score direction across the window, from the least-squares slope rather than the
 * endpoints.
 *
 * Endpoint differencing reads 20 -> 60 -> 20 as no change at all. The slope does not, and
 * it costs nothing extra to compute. Note this was NOT adopted because it predicts better
 * — measured over the same archive it did not (slope-up -0.48% vs endpoint-up -0.56%
 * forward excess, indistinguishable). It is adopted because it describes the series
 * honestly, which is the page's actual job.
 *
 * The +/-0.8 band is points-of-score per scan: over a 5-scan window that is a ~4-point
 * move, roughly one slot in most components. Below it the series is flat in any sense a
 * reader would care about.
 */
export const SCORE_SLOPE_BAND = 0.8;

export type ScoreTrend = "RISING" | "FLAT" | "FALLING";

export function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function scoreTrend(values: number[]): ScoreTrend | null {
  if (values.length < 3) return null;
  const s = slope(values);
  if (s > SCORE_SLOPE_BAND) return "RISING";
  if (s < -SCORE_SLOPE_BAND) return "FALLING";
  return "FLAT";
}

// ── Bucket statistics ──

export interface BucketStat {
  /** Independent observations after episode collapsing. */
  n: number;
  meanExcess: number;
  medianExcess: number;
  /** Share of observations with positive excess return. */
  posRate: number;
}

export function summarize(values: number[]): BucketStat | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    meanExcess: values.reduce((a, b) => a + b, 0) / values.length,
    medianExcess: sorted[Math.floor(sorted.length / 2)],
    posRate: values.filter((v) => v > 0).length / values.length,
  };
}

/**
 * Collapse repeated membership into episodes.
 *
 * Migration 035's rule, applied here for the same reason it was applied to
 * scanner_hit_rates: a name that sits in a bucket for ten consecutive scans contributed
 * ten overlapping forward windows measuring one move. That does not merely inflate `n`,
 * it weights the mean toward names that persist in the scan — which are the ones already
 * working. Only the first scan of each contiguous run is kept.
 *
 * `entries` is keyed by ticker; each value is that ticker's list of
 * {barIndex, excess} while it was in the bucket, in any order.
 */
export function collapseEpisodes<T extends { barIndex: number }>(
  entries: Map<string, T[]>,
): T[] {
  const out: T[] = [];
  for (const list of entries.values()) {
    const sorted = [...list].sort((a, b) => a.barIndex - b.barIndex);
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0 || sorted[i].barIndex !== sorted[i - 1].barIndex + 1) {
        out.push(sorted[i]);
      }
    }
  }
  return out;
}

/** `collapseEpisodes` keeping only the excess returns. */
export function collapseToEpisodes(
  entries: Map<string, Array<{ barIndex: number; excess: number }>>,
): number[] {
  return collapseEpisodes(entries).map((e) => e.excess);
}

/**
 * Control mean matched to a signal's own price composition.
 *
 * A signal that spans every price state cannot be graded against "all names", because
 * episode-collapsing an always-on bucket keeps only each ticker's FIRST appearance — 812
 * observations that are not the cohort, and whose mean (-0.75%) is an artefact of which
 * day a name first entered the scan. Grading "both rising" against that reported +0.45pp
 * of edge where there is roughly -0.30pp.
 *
 * Instead each price state gets its own episode-collapsed control, and the signal is
 * compared against those weighted by how its OWN episodes are distributed across the
 * states. For a signal already confined to one price state this reduces to that state's
 * control, which is what the price-specific rows want anyway.
 */
export function compositionMatchedControl(
  signalStates: PriceState[],
  controlByState: Map<PriceState, BucketStat | null>,
): { meanExcess: number; n: number } | null {
  if (signalStates.length === 0) return null;
  const counts = new Map<PriceState, number>();
  for (const s of signalStates) counts.set(s, (counts.get(s) ?? 0) + 1);

  let weighted = 0;
  let weight = 0;
  let n = 0;
  for (const [state, count] of counts) {
    const control = controlByState.get(state);
    if (!control) continue;
    weighted += control.meanExcess * count;
    weight += count;
    n += control.n;
  }
  if (weight === 0) return null;
  return { meanExcess: weighted / weight, n };
}
