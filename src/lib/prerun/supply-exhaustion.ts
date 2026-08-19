/**
 * Supply Exhaustion — are sellers finished?
 *
 * ONE definition, shared by the Inflection and Transition engines. Both previously carried
 * their own copy with different slots and different weights, so the same stock reported
 * different "supply exhaustion" on the two pages (SPCX read 46 on Transition and 39 on
 * Inflection). Two components with the same name, the same purpose and the same underlying
 * primitives must produce the same number.
 *
 * Built entirely from participant behaviour — who is absorbing supply, whether a shakeout
 * trapped sellers, whether down bars produce less result for the same effort, and whether
 * institutions are still distributing. No smoothed price history.
 *
 * SERVER-ONLY.
 */

import "server-only";

import type { PreRunStockData } from "./types";
import { nullNeutralScore, slotCoveragePct, slotBreakdown, type ScoreSlot, type SlotBreakdown } from "./score-slot";

export interface ComponentResult {
  score: number | null;
  /** Share of this component's slot weight that had data, 0-100. */
  coverage: number;
  evidence: string[];
  caution: string[];
  /** Per-slot breakdown behind `score`. Persisted so a component score can be attributed
   *  to its parts — "demand 20" is not actionable, "pocket_pivots 0/24, rvol 12/16" is. */
  slots: SlotBreakdown[];
}

/** Absorption 22 · spring 18 · range asymmetry 18 · VP divergence 12 · body contraction 15
 *  · distribution days 15 */
export function scoreSupplyExhaustion(data: PreRunStockData): ComponentResult {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // Absorption (0-22) — heavy volume producing no downward range
  if (data.absorption !== null) {
    const a = data.absorption;
    let earned = 0;
    if (a >= 0.4) { earned = 22; evidence.push(`${(a * 100).toFixed(0)}% of down bars absorbed — a buyer is sitting on the bid`); }
    else if (a >= 0.25) { earned = 17; evidence.push(`${(a * 100).toFixed(0)}% of down bars absorbed`); }
    else if (a >= 0.12) { earned = 10; }
    else { caution.push("Selling is meeting no absorption"); }
    slots.push({ label: "absorption", earned, possible: 22, hasData: true });
  } else {
    slots.push({ label: "absorption", earned: 0, possible: 0, hasData: false });
  }

  // Structural spring (0-18) — shakeout below real structure, reclaimed and held
  if (data.structuralSpring !== null) {
    const s = data.structuralSpring;
    let earned = 0;
    if (s >= 2) { earned = 18; evidence.push("Spring — undercut of structure on volume, reclaimed and held"); }
    else if (s >= 1) { earned = 11; evidence.push("Shakeout below structure, reclaimed"); }
    slots.push({ label: "structural_spring", earned, possible: 18, hasData: true });
  } else {
    slots.push({ label: "structural_spring", earned: 0, possible: 0, hasData: false });
  }

  // Range asymmetry (0-18) — down bars producing less range than up bars
  if (data.rangeAsymmetry !== null) {
    const r = data.rangeAsymmetry;
    let earned = 0;
    if (r >= 1.5) { earned = 18; evidence.push("Up bars far wider than down bars — supply drying up"); }
    else if (r >= 1.15) { earned = 13; evidence.push("Up bars wider than down bars"); }
    else if (r >= 0.95) { earned = 7; }
    else { caution.push("Down bars still producing more range than up bars"); }
    slots.push({ label: "range_asymmetry", earned, possible: 18, hasData: true });
  } else {
    slots.push({ label: "range_asymmetry", earned: 0, possible: 0, hasData: false });
  }

  // Volume-price divergence (0-12) — null when no recent lower low exists
  if (data.vpDivergenceBullish !== null) {
    slots.push({ label: "volume_price_divergence", earned: data.vpDivergenceBullish ? 12 : 0, possible: 12, hasData: true });
    if (data.vpDivergenceBullish) evidence.push("Volume-price divergence: selling into lows is drying up");
  } else {
    slots.push({ label: "volume_price_divergence", earned: 0, possible: 0, hasData: false });
  }

  // Down-day body contraction (0-15)
  if (data.avgDownDayBody !== null && data.avgDownDayBodyPrev !== null && data.avgDownDayBodyPrev > 0) {
    const ratio = data.avgDownDayBody / data.avgDownDayBodyPrev;
    let earned = 0;
    if (ratio <= 0.5) { earned = 15; evidence.push("Down-day bodies shrinking sharply"); }
    else if (ratio <= 0.7) { earned = 11; evidence.push("Down-day candles getting smaller"); }
    else if (ratio <= 0.9) { earned = 5; }
    else { caution.push("Down-day bodies not contracting"); }
    slots.push({ label: "down_body_contraction", earned, possible: 15, hasData: true });
  } else {
    slots.push({ label: "down_body_contraction", earned: 0, possible: 0, hasData: false });
  }

  // Distribution days (0-15) — the only measure of institutional SELLING in either engine
  if (data.distributionDays20d !== null) {
    const dist = data.distributionDays20d;
    let earned = 0;
    if (dist <= 1) { earned = 15; evidence.push("Zero or minimal distribution days — no institutional selling"); }
    else if (dist <= 3) { earned = 10; }
    else if (dist <= 5) { earned = 4; }
    else { caution.push(`${dist} distribution days — institutions are selling into this`); }
    slots.push({ label: "distribution_days", earned, possible: 15, hasData: true });
  } else {
    slots.push({ label: "distribution_days", earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), coverage: slotCoveragePct(slots), evidence, caution, slots: slotBreakdown(slots) };
}
