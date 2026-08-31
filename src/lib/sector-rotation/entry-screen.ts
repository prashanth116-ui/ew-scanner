/**
 * Rotation entry screen.
 *
 * Two decisions, in order:
 *   1. Is this rotation worth trading at all?  (breadth / money flow / acceleration)
 *   2. Which names inside it?                  (breakout + basket-relative strength + ATR)
 * ...then a veto: if fewer than MIN_QUALIFYING names clear the screen, skip the
 * rotation entirely rather than trading the one or two that did.
 *
 * The veto is the load-bearing part. Measured over 78 rotations across 18 sector
 * ETFs (Mar 2025 - Jul 2026), rotations where only one name qualified ran 57%
 * positive and two-name rotations ran 30%, against 87% for three or more. The
 * count of names able to post a breakout with above-median strength IS a breadth
 * reading - a sector where only one name can manage it is drifting, not rotating.
 *
 * Screen inputs are measured on the ROTATION START BAR, not today, because that
 * is where the study validated them. `ret20AtStart` / `atrPctAtStart` /
 * `breakout20AtStart` come from the tracker already carrying that as-of date.
 *
 * Liquidity is not re-checked here: fetchStockPerformance() already gates the
 * universe at QUALITY_GATES.MIN_DOLLAR_VOLUME ($200M/day), far above the $50M
 * floor the study used, so every row reaching this function clears it.
 */

import type { ActiveRotationDetail, RotationStockPerformance } from "./rotation-types";
import type { SectorRotationScore } from "./types";
import { ENTRY_SCREEN } from "./config";

export type EntryVerdict = "TRADE" | "SKIP_THIN" | "SKIP_GATE" | "NO_DATA";

export interface EntryScreenResult {
  verdict: EntryVerdict;
  /** Names clearing the stock screen. Empty unless verdict is TRADE or SKIP_THIN. */
  picks: RotationStockPerformance[];
  /** How many cleared it — the number the card renders, and the veto input. */
  qualifying: number;
  gate: {
    breadth: number | null;
    cmf: number | null;
    accel: number | null;
    breadthPass: boolean;
    cmfPass: boolean;
    accelPass: boolean;
    pass: boolean;
  };
  /** The basket-relative 20d return cut-off actually applied, for display. */
  ret20Cut: number | null;
}

const EMPTY_GATE = {
  breadth: null, cmf: null, accel: null,
  breadthPass: false, cmfPass: false, accelPass: false, pass: false,
};

/**
 * Value at the `keepTop` fraction of a descending sort — the threshold a member
 * must meet to be in the top `keepTop` of its own basket. Basket-relative on
 * purpose: a fixed absolute return bar admits most of a hot sector and none of a
 * quiet one, which silently turns the screen into a single-sector rule.
 *
 * The boundary is INCLUSIVE and that is deliberate, not an off-by-one. Index
 * `floor(n * keepTop)` is itself returned and callers use `>=`, so six names at
 * keepTop 0.5 admit four, not three. This reproduces the cut-off used in the
 * calibration run; tightening it to an exact half would shift every threshold
 * the study fitted, so change it only alongside a re-run.
 */
function topFractionCut(values: number[], keepTop: number): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => b - a);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * keepTop))];
}

export function evaluateEntryScreen(
  detail: ActiveRotationDetail,
  score: SectorRotationScore | null | undefined,
): EntryScreenResult {
  const breadth = score?.breadthPct ?? null;
  const cmf = score?.cmf20 ?? null;
  const accel = score?.acceleration ?? null;

  // A missing input is not a pass. Sub-sector and cross-asset baskets can report
  // null breadth by design, and those rotations are simply not screenable.
  if (breadth === null || cmf === null || accel === null) {
    return { verdict: "NO_DATA", picks: [], qualifying: 0, gate: EMPTY_GATE, ret20Cut: null };
  }

  const breadthPass = breadth >= ENTRY_SCREEN.MIN_BREADTH_PCT;
  const cmfPass = cmf > ENTRY_SCREEN.MIN_CMF;
  const accelPass = accel > ENTRY_SCREEN.MIN_ACCEL;
  const gate = { breadth, cmf, accel, breadthPass, cmfPass, accelPass, pass: breadthPass && cmfPass && accelPass };

  if (!gate.pass) {
    return { verdict: "SKIP_GATE", picks: [], qualifying: 0, gate, ret20Cut: null };
  }

  const scorable = detail.stocks.filter((s) => s.ret20AtStart != null && s.atrPctAtStart != null);
  const ret20Cut = topFractionCut(scorable.map((s) => s.ret20AtStart as number), ENTRY_SCREEN.RET20_TOP_FRACTION);
  if (ret20Cut === null) {
    return { verdict: "NO_DATA", picks: [], qualifying: 0, gate, ret20Cut: null };
  }

  const picks = scorable.filter(
    (s) =>
      s.breakout20AtStart === true &&
      (s.ret20AtStart as number) >= ret20Cut &&
      (s.atrPctAtStart as number) >= ENTRY_SCREEN.MIN_ATR_PCT,
  );
  picks.sort((a, b) => (b.ret20AtStart ?? 0) - (a.ret20AtStart ?? 0));

  return {
    verdict: picks.length >= ENTRY_SCREEN.MIN_QUALIFYING ? "TRADE" : "SKIP_THIN",
    picks,
    qualifying: picks.length,
    gate,
    ret20Cut,
  };
}

/** One-line explanation of the verdict, for the card and the tooltip. */
export function entryScreenReason(r: EntryScreenResult): string {
  switch (r.verdict) {
    case "TRADE":
      return `${r.qualifying} names clear the entry screen`;
    case "SKIP_THIN":
      return `Only ${r.qualifying} name${r.qualifying === 1 ? "" : "s"} clear the screen — fewer than ${ENTRY_SCREEN.MIN_QUALIFYING} means a narrow rotation`;
    case "SKIP_GATE": {
      const failed: string[] = [];
      if (!r.gate.breadthPass) failed.push(`breadth ${r.gate.breadth?.toFixed(0)}% < ${ENTRY_SCREEN.MIN_BREADTH_PCT}%`);
      if (!r.gate.cmfPass) failed.push(`money flow ${r.gate.cmf?.toFixed(3)} not positive`);
      if (!r.gate.accelPass) failed.push(`acceleration ${r.gate.accel?.toFixed(1)} not positive`);
      return `Rotation gate failed: ${failed.join(", ")}`;
    }
    default:
      return "Not screenable — breadth or flow unavailable for this basket";
  }
}
