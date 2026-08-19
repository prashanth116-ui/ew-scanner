/**
 * RS Trajectory — is relative strength turning?
 *
 * ONE definition, shared by the Inflection and Transition engines, for the same reason as
 * Supply Exhaustion and Demand Emergence. The two engines carried near-identical private
 * copies that had drifted by a single bucket (26 vs 24 points on the `rsAccel >= -1` case) —
 * the same class of divergence as the SE/Demand split, just smaller and easier to miss.
 *
 * Acceleration only. The absolute RS levels this replaced described the last 20 days; at an
 * inflection point RS is negative by definition and the signal is the second derivative,
 * not the level.
 *
 * SERVER-ONLY.
 */

import "server-only";

import type { PreRunStockData } from "./types";
import { nullNeutralScore, slotCoveragePct, slotBreakdown, type ScoreSlot } from "./score-slot";
import type { ComponentResult } from "./supply-exhaustion";

/** RS acceleration vs SPY 60 · acceleration trend 40 */
export function scoreRSTrajectory(data: PreRunStockData): ComponentResult {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  const rsAccel = data.instRsAccelVsSPY;
  const rsAccelTrend = data.instRsAccelTrend;

  // RS acceleration vs SPY (0-60)
  if (rsAccel !== null) {
    let earned = 0;
    if (rsAccel >= 5) { earned = 60; evidence.push(`RS accelerating strongly vs SPY (+${rsAccel.toFixed(1)})`); }
    else if (rsAccel >= 3) { earned = 48; evidence.push(`RS improving vs SPY (+${rsAccel.toFixed(1)})`); }
    else if (rsAccel >= 1) { earned = 38; evidence.push("RS improving vs SPY"); }
    else if (rsAccel >= 0) { earned = 26; }
    else if (rsAccel >= -2 && (rsAccelTrend ?? 0) > 0) {
      earned = 30; evidence.push("RS trajectory turning while still negative — early inflection");
    } else if (rsAccel >= -3) { earned = 10; }
    else { caution.push("RS deteriorating vs SPY"); }
    slots.push({ label: "rs_acceleration_vs_spy", earned, possible: 60, hasData: true });
  } else {
    slots.push({ label: "rs_acceleration_vs_spy", earned: 0, possible: 0, hasData: false });
  }

  // Acceleration trend (0-40) — is the acceleration itself increasing?
  if (rsAccelTrend !== null) {
    let earned = 0;
    if (rsAccelTrend >= 2) { earned = 40; evidence.push("RS acceleration increasing day over day"); }
    else if (rsAccelTrend > 0.5) { earned = 30; }
    else if (rsAccelTrend > 0) { earned = 20; }
    else if (rsAccelTrend > -1) { earned = 8; }
    else { caution.push("RS momentum fading"); }
    slots.push({ label: "acceleration_trend", earned, possible: 40, hasData: true });
  } else {
    slots.push({ label: "acceleration_trend", earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), coverage: slotCoveragePct(slots), evidence, caution, slots: slotBreakdown(slots) };
}
