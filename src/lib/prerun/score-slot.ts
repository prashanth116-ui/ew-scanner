/**
 * Null-neutral score aggregation, shared by the Inflection, Transition and
 * Runner Potential scorers.
 *
 * Each slot contributes { earned, possible } only when the underlying data exists. The
 * component score is (sum earned / sum possible) * 100 over the slots that have data, so a
 * missing or inapplicable input is excluded from the denominator rather than charged as a
 * zero. That distinction is load-bearing: several patterns (a spring, a volume-price
 * divergence) are simply undefined for some stocks, and scoring them zero systematically
 * depressed exactly the population being screened.
 *
 * `hasData: false` means "not measurable / not applicable".
 * `earned: 0, hasData: true` means "measured, and the answer is no" — real negative evidence.
 */

export interface ScoreSlot {
  earned: number;
  possible: number;
  hasData: boolean;
}

export function nullNeutralScore(slots: ScoreSlot[]): number {
  const withData = slots.filter((s) => s.hasData);
  if (withData.length === 0) return 0;
  const totalEarned = withData.reduce((sum, s) => sum + s.earned, 0);
  const totalPossible = withData.reduce((sum, s) => sum + s.possible, 0);
  if (totalPossible === 0) return 0;
  return Math.round((totalEarned / totalPossible) * 100);
}
