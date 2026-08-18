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

/**
 * Returns null — not 0 — when no slot in the component had data.
 *
 * Returning 0 there reintroduced at the COMPONENT level exactly the bug this module solves
 * at the slot level: "we could not measure RS" and "RS is terrible" produced the same
 * number, which was then multiplied by the component weight and added to the composite. A
 * quarter of live rows scored 0 on RS Trajectory for that reason. Null propagates to
 * `weightedComposite`, which redistributes the weight instead.
 */
export function nullNeutralScore(slots: ScoreSlot[]): number | null {
  const withData = slots.filter((s) => s.hasData);
  if (withData.length === 0) return null;
  const totalEarned = withData.reduce((sum, s) => sum + s.earned, 0);
  const totalPossible = withData.reduce((sum, s) => sum + s.possible, 0);
  if (totalPossible === 0) return null;
  return Math.round((totalEarned / totalPossible) * 100);
}

/** A scored component and its share of the composite. */
export interface WeightedComponent {
  score: number | null;
  weight: number;
}

/**
 * Weighted average across components, skipping any that could not be measured and
 * renormalizing over the weight that remains.
 *
 * This is the same redistribution the Transition engine already applied to its Structure
 * component when no break had printed; it now applies uniformly, so an unmeasurable
 * component never drags a composite toward zero.
 *
 * Returns 0 only when nothing at all could be measured.
 */
export function weightedComposite(components: WeightedComponent[]): number {
  const available = components.filter((c) => c.score !== null);
  const weightSum = available.reduce((sum, c) => sum + c.weight, 0);
  if (weightSum <= 0) return 0;
  const total = available.reduce((sum, c) => sum + (c.score as number) * c.weight, 0);
  const result = total / weightSum;
  return Number.isFinite(result) ? Math.round(result) : 0;
}

/** Component score for display/persistence, where a missing component reads as 0. */
export function displayScore(score: number | null): number {
  return score ?? 0;
}
