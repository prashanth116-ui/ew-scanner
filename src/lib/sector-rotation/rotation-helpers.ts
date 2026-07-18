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
  // Hard cutoff: beyond EXHAUSTING_DAYS or clear structural weakness
  if (
    event.daysActive > ROTATION_LIFECYCLE.EXHAUSTING_DAYS ||
    (h.acceleration < 0 && (h.quadrant === "WEAKENING" || h.quadrant === "LAGGING"))
  ) {
    return "EXHAUSTING";
  }
  // Soft zone: between EXHAUSTING_SOFT_DAYS and EXHAUSTING_DAYS, only EXHAUSTING if
  // health confirms (both acceleration and CMF negative). Prevents binary cliff at day 30.
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
  let score = 0;
  const factors: string[] = [];

  // Quadrant (0-3)
  if (h.quadrant === "LEADING") { score += 3; factors.push("leading quadrant"); }
  else if (h.quadrant === "IMPROVING") { score += 2; factors.push("improving quadrant"); }
  else if (h.quadrant === "WEAKENING") { score += 0; factors.push("weakening quadrant"); }
  else { score -= 1; factors.push("lagging quadrant"); }

  // Acceleration (-1 to +2)
  if (h.acceleration > ROTATION_CONVICTION.STRONG_ACCEL) { score += 2; factors.push("strong acceleration"); }
  else if (h.acceleration > 0) { score += 1; factors.push("moderate acceleration"); }
  else { score -= 1; factors.push("negative acceleration"); }

  // CMF (-1 to +2)
  if (h.cmf20 > ROTATION_CONVICTION.STRONG_CMF) { score += 2; factors.push("strong inflow"); }
  else if (h.cmf20 > 0) { score += 1; factors.push("moderate inflow"); }
  else { score -= 1; factors.push("money outflow"); }

  // Signal trend (-1 to +1)
  const hist = event.signalHistory ?? [];
  if (hist.length >= 3) {
    const recent = hist.slice(-3);
    const trending = recent[2].signalCount >= recent[0].signalCount;
    if (trending) { score += 1; factors.push("signals improving"); }
    else { score -= 1; factors.push("signals declining"); }
  }

  let level: ConvictionLevel;
  if (score >= ROTATION_CONVICTION.HIGH) level = "HIGH";
  else if (score >= ROTATION_CONVICTION.MODERATE) level = "MODERATE";
  else if (score >= ROTATION_CONVICTION.LOW) level = "LOW";
  else level = "EXIT";

  const topFactor = factors[0] ?? "mixed signals";
  const reason = `${level} conviction: ${topFactor}${factors.length > 1 ? ` + ${factors.slice(1).join(", ")}` : ""}`;

  return { level, score, reason };
}

// ── Macro Regime alignment ──

export const REGIME_SECTOR_DISPLAY_MAP: Record<string, string[]> = {
  "Technology": ["Technology", "Semiconductors", "Software & Cloud"],
  "Health Care": ["Health Care", "Biotech"],
  "Consumer Discretionary": ["Consumer Discretionary"],
  "Consumer Staples": ["Consumer Staples"],
  "Communication Services": ["Communication Services"],
  "Financials": ["Financials"],
  "Industrials": ["Industrials"],
  "Energy": ["Energy"],
  "Materials": ["Materials"],
  "Utilities": ["Utilities"],
  "Real Estate": ["Real Estate"],
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
  action: "ENTER" | "ADD ON PULLBACK" | "HOLD — TIGHTEN STOPS" | "EXIT";
  color: string;
  bgColor: string;
  borderColor: string;
  icon: "enter" | "add" | "hold" | "exit";
  description: string;
};

export function computeActionSignal(
  lifecycle: LifecycleStage,
  conviction: ConvictionResult,
  regimeAlignment: "aligned" | "headwind" | "neutral"
): ActionSignal {
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

  // ADD ON PULLBACK: MATURING + MODERATE+ conviction + not headwind
  if (
    lifecycle === "MATURING" &&
    (conviction.level === "MODERATE" || conviction.level === "HIGH") &&
    regimeAlignment !== "headwind"
  ) {
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

  // ENTER: EARLY + HIGH/MODERATE conviction + not headwind
  if (
    lifecycle === "EARLY" &&
    (conviction.level === "HIGH" || conviction.level === "MODERATE") &&
    regimeAlignment !== "headwind"
  ) {
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

  // Fallback: HOLD for anything else (EARLY + LOW, etc.)
  return {
    action: "HOLD — TIGHTEN STOPS",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    icon: "hold",
    description: "Mixed signals — wait for clarity",
  };
}
