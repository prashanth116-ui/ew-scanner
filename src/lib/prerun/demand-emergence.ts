/**
 * Demand Emergence — is someone stepping in?
 *
 * ONE definition, shared by the Inflection and Transition engines, for the same reason as
 * Supply Exhaustion: the two engines previously carried different slot sets and different
 * distance references, so the same stock reported different demand on the two pages.
 *
 * Every input reads today's bar or the slope of recent participation. Nothing here waits for
 * a moving average to cross.
 *
 * The distance slot references the 3-month base high in BOTH engines. Transition also
 * computes a forward trigger level from swing structure, but using it here would make the
 * component incomparable across pages for no gain — trigger proximity is already expressed
 * in Transition's alert state, where READY means within 2 ATR of the trigger.
 *
 * SERVER-ONLY.
 */

import "server-only";

import type { PreRunStockData } from "./types";
import { nullNeutralScore, type ScoreSlot } from "./score-slot";
import type { ComponentResult } from "./supply-exhaustion";

/** Close location 24 · pocket pivots 24 · RVOL 16 · OBV 14 · money flow 10 · distance 12 */
export function scoreDemandEmergence(data: PreRunStockData): ComponentResult {
  const evidence: string[] = [];
  const caution: string[] = [];
  const slots: ScoreSlot[] = [];

  // Close-location persistence (0-24) — institutions accumulate into the close
  const clv = data.closeLocationMean;
  if (clv !== null) {
    const flat = data.closeLocationFlat === true;
    let earned = 0;
    if (clv >= 0.65 && flat) { earned = 24; evidence.push("Closing near the highs while price goes nowhere — accumulation footprint"); }
    else if (clv >= 0.65) { earned = 18; evidence.push("Consistently closing in the upper part of the range"); }
    else if (clv >= 0.55) { earned = 13; }
    else if (clv >= 0.45) { earned = 6; }
    else { caution.push("Closing in the lower half of the daily range"); }
    slots.push({ earned, possible: 24, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // Pocket pivots (0-24) — demand first outweighing all recent visible supply
  if (data.pocketPivots !== null) {
    const p = data.pocketPivots;
    let earned = 0;
    if (p >= 3) { earned = 24; evidence.push(`${p} pocket pivots — repeated institutional footprints`); }
    else if (p >= 2) { earned = 18; evidence.push(`${p} pocket pivots`); }
    else if (p >= 1) { earned = 11; evidence.push("Pocket pivot — up volume exceeded every recent down day"); }
    else { caution.push("No pocket pivots — demand has not outweighed supply"); }
    slots.push({ earned, possible: 24, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // RVOL trajectory (0-16) — participation building ahead of price
  if (data.rvolTrajectory !== null) {
    const t = data.rvolTrajectory;
    let earned = 0;
    if (t >= 0.15) { earned = 16; evidence.push("Relative volume building sharply"); }
    else if (t >= 0.05) { earned = 12; evidence.push("Relative volume building"); }
    else if (t >= 0) { earned = 6; }
    else { caution.push("Participation fading"); }
    slots.push({ earned, possible: 16, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // OBV divergence (0-14) — stealth accumulation
  if (data.obvDivergent !== null) {
    slots.push({ earned: data.obvDivergent ? 14 : 0, possible: 14, hasData: true });
    if (data.obvDivergent) evidence.push("OBV near the top of its range while price is not — stealth buying");
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // Money-flow persistence (0-10)
  if (data.moneyFlowPersistence !== null) {
    const mfp = data.moneyFlowPersistence;
    let earned = 0;
    if (mfp >= 12) { earned = 10; evidence.push("Sustained money flow"); }
    else if (mfp >= 8) { earned = 7; }
    else if (mfp >= 5) { earned = 4; }
    slots.push({ earned, possible: 10, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  // Distance to the breakout level (0-12) — the "when" axis, in ATR so it is comparable
  // across volatility profiles. Peaks in a striking-distance band: sitting ON the level is
  // extension, not readiness.
  const atrPct = data.vcpAtrPct;
  if (data.pctFromBaseHigh !== null && atrPct !== null && atrPct > 0) {
    const atrUnits = data.pctFromBaseHigh / atrPct;
    let earned = 0;
    if (atrUnits <= 0.5) { earned = 5; }
    else if (atrUnits <= 3) { earned = 12; evidence.push(`Breakout level ${atrUnits.toFixed(1)} ATR away — within striking distance`); }
    else if (atrUnits <= 6) { earned = 7; evidence.push(`Breakout level ${atrUnits.toFixed(1)} ATR away`); }
    else if (atrUnits <= 10) { earned = 3; }
    else { caution.push("Breakout level more than 10 ATR away — no move within reach"); }
    slots.push({ earned, possible: 12, hasData: true });
  } else {
    slots.push({ earned: 0, possible: 0, hasData: false });
  }

  return { score: nullNeutralScore(slots), evidence, caution };
}
