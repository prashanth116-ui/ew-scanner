/**
 * Market-regime gate for the Inflection and Transition scanners.
 *
 * Neither engine knew what the tape was doing, so both produced the same volume of long
 * signals in a distribution top as in a healthy base-building market. The setups look
 * identical; what changes is the probability that any of them follow through.
 *
 * This is deliberately NOT another scoring component. Regime says nothing about whether a
 * given stock's supply is exhausted or its structure has flipped, so folding it into the
 * composite would corrupt the thing the composite measures. Instead it raises the bar for
 * the top signal tiers — the same setup needs more evidence to earn an alert in a hostile
 * tape. Scores are untouched, so a backtest can still compare like with like across regimes.
 *
 * SERVER-ONLY: used by the nightly cron routes.
 */

import "server-only";

export type RegimeStance = "RISK_ON" | "RISK_OFF" | "INFLATIONARY" | "MIXED";

export interface RegimeGate {
  /** Added to the score thresholds for primary/stronger signals and for TRIGGERED. */
  scorePenalty: number;
  /** Short description, attached to caution evidence when the gate is active. */
  label: string;
}

export const NEUTRAL_GATE: RegimeGate = { scorePenalty: 0, label: "" };

/**
 * Map a macro regime onto a threshold adjustment.
 *
 * RISK_OFF is the case that matters: long setups in a risk-off tape fail more often, and
 * the scanner should demand a clearly better setup before promoting one to a primary
 * signal. INFLATIONARY and MIXED get a smaller adjustment; RISK_ON none at all.
 *
 * Confidence scales the penalty — a weakly-classified regime should not gate hard.
 */
export function buildRegimeGate(
  regime: RegimeStance | null,
  confidence = 100,
): RegimeGate {
  if (!regime || regime === "RISK_ON") return NEUTRAL_GATE;

  const base = regime === "RISK_OFF" ? 10 : 5;
  const scaled = Math.round(base * Math.min(Math.max(confidence, 0), 100) / 100);
  if (scaled <= 0) return NEUTRAL_GATE;

  return {
    scorePenalty: scaled,
    label: regime === "RISK_OFF"
      ? "Risk-off tape — signal thresholds raised"
      : `${regime === "INFLATIONARY" ? "Inflationary" : "Mixed"} tape — signal thresholds raised`,
  };
}
