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
  /** Stable snake_case identifier for this slot, e.g. "pocket_pivots".
   *
   *  Required, not optional, so the compiler proves every slot is named. These are
   *  persisted and queried, so a missing label would silently produce an unattributable
   *  number — which is the exact problem the breakdown exists to solve. Treat a label as
   *  part of the schema: renaming one breaks any saved query that referenced it. */
  label: string;
  earned: number;
  possible: number;
  hasData: boolean;
}

/** One slot flattened for persistence. `pct` is null when the slot had no data. */
export interface SlotBreakdown {
  label: string;
  earned: number;
  possible: number;
  hasData: boolean;
  pct: number | null;
}

/**
 * Flatten slots for storage.
 *
 * Keeps `hasData` rather than collapsing to a number, because "measured, and the answer
 * is no" and "could not measure" must stay distinguishable downstream — the same
 * distinction nullNeutralScore relies on. A consumer that treats both as 0 reintroduces
 * the bug this module exists to prevent.
 */
export function slotBreakdown(slots: ScoreSlot[]): SlotBreakdown[] {
  return slots.map((s) => ({
    label: s.label,
    earned: s.earned,
    possible: s.possible,
    hasData: s.hasData,
    pct: s.hasData && s.possible > 0 ? Math.round((s.earned / s.possible) * 100) : null,
  }));
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

/**
 * Share of a component's SLOT weight that had data, 0-100.
 *
 * This is the granularity that matters. Renormalization happens per slot, so a component
 * scored from two of its six slots returns a number indistinguishable from one scored from
 * all six — and that, not whole components going missing, is what produced 18-point swings
 * for the same ticker between two crons minutes apart. Whole components almost never return
 * null, because that needs every slot to be unavailable at once.
 */
export function slotCoveragePct(slots: ScoreSlot[]): number {
  const total = slots.reduce((sum, s) => sum + (s.hasData ? s.possible : 0), 0);
  const declared = slots.reduce((sum, s) => sum + s.possible, 0);
  // `possible` is 0 on slots without data, so reconstruct the intended denominator from
  // the component's own full weight — every component in both engines sums to 100.
  const intended = declared > 0 ? Math.max(declared, 100) : 100;
  return Math.round((total / intended) * 100);
}

/** A scored component and its share of the composite. */
export interface WeightedComponent {
  score: number | null;
  weight: number;
  /** Share of this component's slot weight that had data, 0-100. Defaults to 100. */
  coverage?: number;
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

/**
 * How much of the composite was actually measurable, 0-100.
 *
 * `weightedComposite` renormalizes over the components that had data, which is correct but
 * silent: a score built from two of six components looks identical to one built from all
 * six. Upstream fetch failures do happen — the same ticker has scored 18 points apart
 * between two crons minutes apart, with the same price — and nothing on the row recorded it.
 * Persisting this makes a thinly-measured score visible, and lets the backtest exclude or
 * segment them rather than treating them as equal evidence.
 */
export function measuredWeightPct(components: WeightedComponent[]): number {
  const total = components.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return 0;
  // Weight each component by how much of ITS OWN slot weight had data, not merely by
  // whether it produced a score at all.
  const have = components.reduce(
    (sum, c) => sum + c.weight * (c.score === null ? 0 : (c.coverage ?? 100) / 100),
    0,
  );
  return Math.round((have / total) * 100);
}
