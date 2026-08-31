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
 * EVERYTHING THAT DECIDES THE VERDICT IS MEASURED ON THE ROTATION START BAR.
 * That is where the study validated it. A second `live` gate is computed on the
 * latest bar and returned alongside, but it is a health read only and never
 * changes the verdict - mixing a live gate with an as-of-start stock screen would
 * be a combination nothing was tested on.
 *
 * Breadth for BOTH gates is computed from this rotation's own member rows rather
 * than from SectorRotationScore.breadthPct, so that the breadth denominator is
 * the same set the screen runs on. It also means sub-sector and cross-asset
 * baskets, which frequently report a null sector-level breadthPct, are still
 * screenable.
 *
 * Liquidity is not re-checked here: fetchStockPerformance() already gates the
 * universe at QUALITY_GATES.MIN_DOLLAR_VOLUME ($200M/day), far above the $50M
 * floor the study used, so every row reaching this function clears it.
 */

import type { ActiveRotationDetail, RotationStockPerformance } from "./rotation-types";
import { ENTRY_SCREEN } from "./config";

export type EntryVerdict = "TRADE" | "SKIP_THIN" | "SKIP_GATE" | "NO_DATA";

export interface GateReading {
  breadth: number | null;
  cmf: number | null;
  accel: number | null;
  breadthPass: boolean;
  cmfPass: boolean;
  accelPass: boolean;
  /** False whenever any input is missing — an unmeasured gate is never a pass. */
  pass: boolean;
  /** True when every input was available, so `pass` reflects real evidence. */
  complete: boolean;
}

export interface EntryScreenResult {
  verdict: EntryVerdict;
  /** Names clearing the stock screen. Empty unless verdict is TRADE or SKIP_THIN. */
  picks: RotationStockPerformance[];
  /** How many cleared it — the number the card renders, and the veto input. */
  qualifying: number;
  /** As-of the rotation start bar. This is the gate that decides the verdict. */
  gate: GateReading;
  /** As-of the latest bar. Health read only — deliberately never gates. */
  live: GateReading;
  /** The basket-relative 20d return cut-off actually applied, for display. */
  ret20Cut: number | null;
}

function readGate(breadth: number | null, cmf: number | null, accel: number | null): GateReading {
  const complete = breadth !== null && cmf !== null && accel !== null;
  const breadthPass = breadth !== null && breadth >= ENTRY_SCREEN.MIN_BREADTH_PCT;
  const cmfPass = cmf !== null && cmf > ENTRY_SCREEN.MIN_CMF;
  const accelPass = accel !== null && accel > ENTRY_SCREEN.MIN_ACCEL;
  return {
    breadth, cmf, accel, breadthPass, cmfPass, accelPass,
    pass: complete && breadthPass && cmfPass && accelPass,
    complete,
  };
}

/** Share of members with a resolvable answer that were above their own 50d SMA. */
function breadthFrom(stocks: RotationStockPerformance[], pick: (s: RotationStockPerformance) => boolean | null): number | null {
  let above = 0;
  let seen = 0;
  for (const s of stocks) {
    const v = pick(s);
    if (v === null || v === undefined) continue;
    seen++;
    if (v) above++;
  }
  // Below a handful of members the percentage is noise, not breadth.
  return seen >= 5 ? (above / seen) * 100 : null;
}

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

export function evaluateEntryScreen(detail: ActiveRotationDetail): EntryScreenResult {
  const { event, stocks } = detail;

  const gate = readGate(
    breadthFrom(stocks, (s) => s.aboveSma50AtStart),
    event.cmfAtStart ?? null,
    event.accelAtStart ?? null,
  );
  const live = readGate(
    breadthFrom(stocks, (s) => s.aboveSma50),
    event.cmfNow ?? null,
    event.accelNow ?? null,
  );

  const base = { picks: [] as RotationStockPerformance[], qualifying: 0, gate, live, ret20Cut: null };

  if (!gate.complete) return { verdict: "NO_DATA", ...base };
  if (!gate.pass) return { verdict: "SKIP_GATE", ...base };

  const scorable = stocks.filter((s) => s.ret20AtStart != null && s.atrPctAtStart != null);
  const ret20Cut = topFractionCut(scorable.map((s) => s.ret20AtStart as number), ENTRY_SCREEN.RET20_TOP_FRACTION);
  if (ret20Cut === null) return { verdict: "NO_DATA", ...base };

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
    live,
    ret20Cut,
  };
}

/** One-line explanation of the verdict, for the card and the tooltip. */
export function entryScreenReason(r: EntryScreenResult): string {
  switch (r.verdict) {
    case "TRADE":
      return `${r.qualifying} names cleared the entry screen on the rotation start bar`;
    case "SKIP_THIN":
      return `Only ${r.qualifying} name${r.qualifying === 1 ? "" : "s"} cleared the screen — fewer than ${ENTRY_SCREEN.MIN_QUALIFYING} means a narrow rotation`;
    case "SKIP_GATE": {
      const failed: string[] = [];
      if (!r.gate.breadthPass) failed.push(`breadth ${r.gate.breadth?.toFixed(0)}% < ${ENTRY_SCREEN.MIN_BREADTH_PCT}%`);
      if (!r.gate.cmfPass) failed.push(`money flow ${r.gate.cmf?.toFixed(3)} not positive`);
      if (!r.gate.accelPass) failed.push(`acceleration ${r.gate.accel?.toFixed(1)} not positive`);
      return `Rotation gate failed at the start bar: ${failed.join(", ")}`;
    }
    default:
      return "Not screenable — gate inputs unavailable at the rotation start bar";
  }
}

/**
 * How the live gate compares with the one that decided the verdict.
 * "faded" is the case worth surfacing: it entered clean and has since decayed.
 */
export function liveGateDrift(r: EntryScreenResult): "faded" | "recovered" | "unchanged" | "unknown" {
  if (!r.gate.complete || !r.live.complete) return "unknown";
  if (r.gate.pass && !r.live.pass) return "faded";
  if (!r.gate.pass && r.live.pass) return "recovered";
  return "unchanged";
}
