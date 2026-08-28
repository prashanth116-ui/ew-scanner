/**
 * Shared rotation analysis helpers.
 * Extracted from rotation/page.tsx so both /rotation and /sectors can use them.
 */

import type {
  RotationEvent,
  RotationHealthSignals,
  LifecycleStage,
  ConvictionLevel,
  ConvictionResult,
  RegimeData,
} from "./rotation-types";
import { ROTATION_LIFECYCLE, ROTATION_CONVICTION } from "./config";

// ── Safe health accessor (guards against stale cached data missing health) ──

export const DEFAULT_HEALTH: RotationHealthSignals = {
  acceleration: 0,
  cmf20: 0,
  quadrant: "LAGGING",
};

export function getHealth(event: RotationEvent): RotationHealthSignals {
  return event.health ?? DEFAULT_HEALTH;
}

// ── Lifecycle Stage ──

export function computeLifecycleStage(event: RotationEvent): LifecycleStage {
  const h = getHealth(event);

  // Health override: genuinely healthy long-duration rotations stay LATE, not EXHAUSTING.
  // Requires positive acceleration AND positive CMF AND favorable quadrant.
  const healthConfirmed =
    h.acceleration > 0 && h.cmf20 > 0 &&
    (h.quadrant === "IMPROVING" || h.quadrant === "LEADING");

  // Clear structural weakness → EXHAUSTING regardless of duration
  if (h.acceleration < 0 && (h.quadrant === "WEAKENING" || h.quadrant === "LAGGING")) {
    return "EXHAUSTING";
  }

  // Hard cutoff: beyond EXHAUSTING_DAYS — unless health confirms continued strength
  if (event.daysActive > ROTATION_LIFECYCLE.EXHAUSTING_DAYS && !healthConfirmed) {
    return "EXHAUSTING";
  }
  // Soft zone: between EXHAUSTING_SOFT_DAYS and EXHAUSTING_DAYS, only EXHAUSTING if
  // health confirms weakness (both acceleration and CMF negative). Prevents binary cliff at day 30.
  if (
    event.daysActive > ROTATION_LIFECYCLE.EXHAUSTING_SOFT_DAYS &&
    h.acceleration < 0 && h.cmf20 < 0
  ) {
    return "EXHAUSTING";
  }
  if (event.daysActive <= ROTATION_LIFECYCLE.EARLY_MAX_DAYS) return "EARLY";
  if (event.daysActive <= ROTATION_LIFECYCLE.MATURING_MAX_DAYS) return "MATURING";
  return "LATE";
}

// ── Conviction Score ──

export const CONVICTION_HIGH_THRESHOLD = ROTATION_CONVICTION.HIGH;
export const CONVICTION_MODERATE_THRESHOLD = ROTATION_CONVICTION.MODERATE;
export const CONVICTION_LOW_THRESHOLD = ROTATION_CONVICTION.LOW;

export function computeConviction(event: RotationEvent): ConvictionResult {
  const h = getHealth(event);
  const factors: { label: string; pts: number }[] = [];

  // Quadrant (-1 to +3)
  if (h.quadrant === "LEADING") factors.push({ label: "leading quadrant", pts: 3 });
  else if (h.quadrant === "IMPROVING") factors.push({ label: "improving quadrant", pts: 2 });
  else if (h.quadrant === "WEAKENING") factors.push({ label: "weakening quadrant", pts: 0 });
  else factors.push({ label: "lagging quadrant", pts: -1 });

  // Acceleration (-1 to +2)
  if (h.acceleration > ROTATION_CONVICTION.STRONG_ACCEL) factors.push({ label: "strong acceleration", pts: 2 });
  else if (h.acceleration > 0) factors.push({ label: "moderate acceleration", pts: 1 });
  else factors.push({ label: "negative acceleration", pts: -1 });

  // CMF (-1 to +2)
  if (h.cmf20 > ROTATION_CONVICTION.STRONG_CMF) factors.push({ label: "strong inflow", pts: 2 });
  else if (h.cmf20 > 0) factors.push({ label: "moderate inflow", pts: 1 });
  else factors.push({ label: "money outflow", pts: -1 });

  // Signal trend (-1 to +1): compare trailing 5-day averages for stability
  const hist = event.signalHistory ?? [];
  if (hist.length >= 10) {
    const recentWindow = hist.slice(-5);
    const priorWindow = hist.slice(-10, -5);
    const recentAvg = recentWindow.reduce((s, x) => s + x.signalCount, 0) / recentWindow.length;
    const priorAvg = priorWindow.reduce((s, x) => s + x.signalCount, 0) / priorWindow.length;
    factors.push(recentAvg >= priorAvg
      ? { label: "signals improving", pts: 1 }
      : { label: "signals declining", pts: -1 });
  } else if (hist.length >= 3) {
    const trending = hist[hist.length - 1].signalCount >= hist[hist.length - 3].signalCount;
    factors.push(trending
      ? { label: "signals improving", pts: 1 }
      : { label: "signals declining", pts: -1 });
  }

  const score = factors.reduce((s, f) => s + f.pts, 0);

  let level: ConvictionLevel;
  if (score >= ROTATION_CONVICTION.HIGH) level = "HIGH";
  else if (score >= ROTATION_CONVICTION.MODERATE) level = "MODERATE";
  else if (score >= ROTATION_CONVICTION.LOW) level = "LOW";
  else level = "EXIT";

  // Rank by contribution, not by evaluation order. The quadrant slot is always
  // pushed first, so leading with factors[0] presented it as the "top factor"
  // regardless of whether it carried the score.
  const positives = factors.filter((f) => f.pts > 0).sort((a, b) => b.pts - a.pts).map((f) => f.label);
  const negatives = factors.filter((f) => f.pts <= 0).map((f) => f.label);

  // Negatives are appended behind "against:", never behind "+". Joining them into
  // one comma list made "negative acceleration" read as a reason for confidence.
  const support = positives.length ? positives.join(", ") : "no supporting factors";
  const reason = `${level} conviction: ${support}`
    + (negatives.length ? ` — against: ${negatives.join(", ")}` : "");

  return { level, score, reason, positives, negatives };
}

// ── Macro Regime alignment ──

// Maps regime sector names → all display names that fall under that GICS parent.
// Cross-asset (Gold, Treasuries, etc.) and leadership baskets (MAGS, QQQ, etc.)
// are intentionally unmapped — regime opinions are equity-sector focused, so
// rotations in those categories correctly return "neutral" from isRegimeAligned().
export const REGIME_SECTOR_DISPLAY_MAP: Record<string, string[]> = {
  "Technology": [
    "Technology", "Semiconductors", "Software & Cloud", "AI & Robotics",
    "Memory", "Lithography & Photonics", "Cybersecurity", "Robotics", "Quantum",
  ],
  "Health Care": ["Health Care", "Biotech"],
  "Consumer Discretionary": ["Consumer Discretionary", "Homebuilders", "Retail"],
  "Consumer Staples": ["Consumer Staples"],
  "Communication Services": ["Communication Services"],
  "Financials": ["Financials", "Regional Banks", "HPC & Bitcoin Miners"],
  "Industrials": ["Industrials", "Transports", "Aerospace & Defense", "Space & Defense Innovation"],
  "Energy": ["Energy", "Nuclear"],
  "Materials": ["Materials"],
  "Utilities": ["Utilities"],
  "Real Estate": ["Real Estate", "Data Centers"],
};

export function isRegimeAligned(sectorName: string, regime: RegimeData): "aligned" | "headwind" | "neutral" {
  for (const favored of regime.favoredSectors) {
    const mapped = REGIME_SECTOR_DISPLAY_MAP[favored] ?? [favored];
    if (mapped.includes(sectorName)) return "aligned";
  }
  for (const avoid of regime.avoidSectors) {
    const mapped = REGIME_SECTOR_DISPLAY_MAP[avoid] ?? [avoid];
    if (mapped.includes(sectorName)) return "headwind";
  }
  return "neutral";
}

// ── Action Signal ──

export type ActionSignal = {
  action: "ENTER" | "ADD ON PULLBACK" | "WAIT" | "HOLD — TIGHTEN STOPS" | "EXIT";
  color: string;
  bgColor: string;
  borderColor: string;
  icon: "enter" | "add" | "wait" | "hold" | "exit";
  description: string;
};

const HOLD_SIGNAL = (description: string): ActionSignal => ({
  action: "HOLD — TIGHTEN STOPS",
  color: "text-amber-400",
  bgColor: "bg-amber-500/10",
  borderColor: "border-amber-500/30",
  icon: "hold",
  description,
});

/**
 * WAIT exists because the old fallback labelled everything unresolved
 * "HOLD — TIGHTEN STOPS", which instructs you to manage a position you have no
 * reason to hold in a rotation that is five days old.
 */
const WAIT_SIGNAL = (description: string): ActionSignal => ({
  action: "WAIT",
  color: "text-[#9aa4b2]",
  bgColor: "bg-[#2a2a2a]",
  borderColor: "border-[#3a3a3a]",
  icon: "wait",
  description,
});

export function computeActionSignal(
  lifecycle: LifecycleStage,
  conviction: ConvictionResult,
  regimeAlignment: "aligned" | "headwind" | "neutral",
  health?: RotationHealthSignals,
): ActionSignal {
  // Momentum gate on the two capital-committing actions. `acceleration` is the change
  // in 20d ROC, so <= 0 means the rotation is decelerating even when the quadrant and
  // money flow still read well — the exact state that put an ENTER banner on a 5-day-old
  // Materials rotation sitting at -0.6%. Conviction can clear MODERATE on quadrant and
  // flow alone (+2 improving, +1 inflow, +1 signals, -1 acceleration = 3, the MODERATE
  // floor), so the score cannot catch this on its own.
  //
  // Optional so callers with no health handy keep the previous behaviour; every call
  // site in this repo passes getHealth(event).
  const decelerating = health !== undefined && health.acceleration <= 0;
  // EXIT: exhausting lifecycle, or EXIT conviction, or headwind + LOW conviction
  if (
    lifecycle === "EXHAUSTING" ||
    conviction.level === "EXIT" ||
    (regimeAlignment === "headwind" && conviction.level === "LOW")
  ) {
    const reason =
      lifecycle === "EXHAUSTING"
        ? "Rotation exhausting — momentum fading"
        : conviction.level === "EXIT"
          ? "Exit signals triggered — conviction collapsed"
          : "Regime headwind with low conviction";
    return {
      action: "EXIT",
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      icon: "exit",
      description: reason,
    };
  }

  // HOLD: LATE lifecycle, or MATURING + LOW conviction, or headwind + MODERATE
  if (
    lifecycle === "LATE" ||
    (lifecycle === "MATURING" && conviction.level === "LOW") ||
    (regimeAlignment === "headwind" && conviction.level === "MODERATE")
  ) {
    const reason =
      lifecycle === "LATE"
        ? "Extended rotation — protect gains"
        : regimeAlignment === "headwind"
          ? "Regime headwind — reduce exposure"
          : "Maturing with weakening conviction";
    return {
      action: "HOLD — TIGHTEN STOPS",
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/30",
      icon: "hold",
      description: reason,
    };
  }

  // ADD ON PULLBACK: MATURING + MODERATE+ conviction + not headwind + still accelerating
  if (
    lifecycle === "MATURING" &&
    (conviction.level === "MODERATE" || conviction.level === "HIGH") &&
    regimeAlignment !== "headwind"
  ) {
    // Already established, so a decelerating read is a reason to stop adding rather
    // than a reason to leave — downgrade to HOLD, not WAIT.
    if (decelerating) {
      return HOLD_SIGNAL("Momentum decelerating — hold what you have, do not add");
    }
    const reason =
      regimeAlignment === "aligned"
        ? "Established trend with regime support — add on dips"
        : "Established trend — add on pullbacks";
    return {
      action: "ADD ON PULLBACK",
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
      borderColor: "border-cyan-500/30",
      icon: "add",
      description: reason,
    };
  }

  // ENTER: EARLY + HIGH/MODERATE conviction + not headwind + momentum actually positive
  if (
    lifecycle === "EARLY" &&
    (conviction.level === "HIGH" || conviction.level === "MODERATE") &&
    regimeAlignment !== "headwind"
  ) {
    // Nothing to hold yet at this age, so the honest answer is to stand down.
    if (decelerating) {
      return WAIT_SIGNAL("Rotation is young but momentum is still decelerating — wait for it to turn");
    }
    const reason =
      regimeAlignment === "aligned"
        ? "Early rotation with high conviction and regime alignment"
        : "New rotation with strong conviction — consider entry";
    return {
      action: "ENTER",
      color: "text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30",
      icon: "enter",
      description: reason,
    };
  }

  // Fallback (EARLY + LOW, etc.). "Tighten stops" only makes sense on a position you
  // would plausibly already hold, so a young unresolved rotation gets WAIT instead.
  return lifecycle === "EARLY"
    ? WAIT_SIGNAL("Mixed signals — wait for clarity")
    : HOLD_SIGNAL("Mixed signals — wait for clarity");
}
