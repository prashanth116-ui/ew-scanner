/**
 * Phase 2 Wave Scanner — scanner modes and filter defaults.
 *
 * Four modes for filtering Elliott Wave patterns:
 *   1. Active Impulse — valid impulse in progress, not invalidated
 *   2. Correction Entry — impulse completed, price near Fibonacci levels
 *   3. Post-Correction — ABC correction completed, new impulse potential
 *   4. High Confidence — patterns with confidence >= 70%
 */

import type { P2ImpulsePattern, P2ElliottWaveResult, P2FibTargets } from "./phase2-wave-detector";
import { getValidPatterns } from "./phase2-wave-detector";

export type WaveScannerMode = "activeImpulse" | "correctionEntry" | "postCorrection" | "highConfidence";

export interface WaveScannerModeConfig {
  id: WaveScannerMode;
  label: string;
  description: string;
  defaultMinConfidence: number;
  defaultScalesWeekly: number[];
  defaultScalesDaily: number[];
}

export const WAVE_SCANNER_MODES: WaveScannerModeConfig[] = [
  {
    id: "activeImpulse",
    label: "Active Impulse",
    description: "Valid impulse patterns in progress — not yet invalidated.",
    defaultMinConfidence: 40,
    defaultScalesWeekly: [3, 5, 8],
    defaultScalesDaily: [4, 8, 16],
  },
  {
    id: "correctionEntry",
    label: "Correction Entry",
    description: "Completed impulse with price near Fibonacci retracement levels (38.2%-61.8%) — no completed ABC yet.",
    defaultMinConfidence: 50,
    defaultScalesWeekly: [3, 5, 8],
    defaultScalesDaily: [4, 8, 16],
  },
  {
    id: "postCorrection",
    label: "Post-Correction",
    description: "ABC correction completed — potential start of a new impulse wave.",
    defaultMinConfidence: 40,
    defaultScalesWeekly: [3, 5, 8],
    defaultScalesDaily: [4, 8, 16],
  },
  {
    id: "highConfidence",
    label: "High Confidence",
    description: "Patterns scoring 70%+ confidence — extended W3, RSI divergence, volume confirmation.",
    defaultMinConfidence: 70,
    defaultScalesWeekly: [3, 5, 8],
    defaultScalesDaily: [4, 8, 16],
  },
];

export interface WaveScanResult {
  ticker: string;
  name: string;
  sector?: string;
  pattern: P2ImpulsePattern;
  fibTargets: P2FibTargets | null;
  currentPrice: number;
  nearestFibLabel: string | null;
  nearestFibDistance: number | null; // % distance from current to nearest fib
}

/**
 * Filter Elliott Wave results for a specific scanner mode.
 * Returns an array of matching patterns from the result.
 */
export function filterByMode(
  result: P2ElliottWaveResult,
  mode: WaveScannerMode,
  minConfidence: number,
  directionFilter: "bull" | "bear" | "all",
  correctionTypeFilter: "all" | "zigzag" | "flat",
  currentPrice?: number,
): P2ImpulsePattern[] {
  let patterns = getValidPatterns(result);

  // Direction filter
  if (directionFilter === "bull") {
    patterns = patterns.filter((p) => p.direction === 1);
  } else if (directionFilter === "bear") {
    patterns = patterns.filter((p) => p.direction === -1);
  }

  // Confidence filter
  patterns = patterns.filter((p) => p.confidence >= minConfidence);

  // Mode-specific filtering
  switch (mode) {
    case "activeImpulse":
      // Valid impulse, not yet completed correction
      patterns = patterns.filter((p) => p.correction === null);
      break;

    case "correctionEntry":
      // Impulse completed, price near fib levels, no completed ABC
      patterns = patterns.filter((p) => {
        if (p.correction !== null) return false;
        if (currentPrice == null) return true; // can't check proximity without price
        // Check if price is between 38.2% and 61.8% retracement
        const idx = result.patterns.indexOf(p);
        const fibs = result.fibTargets.get(idx);
        if (!fibs) return true;
        const f382 = fibs.levels.find((l) => l.ratio === 0.382);
        const f618 = fibs.levels.find((l) => l.ratio === 0.618);
        if (!f382 || !f618) return true;
        const lo = Math.min(f382.price, f618.price);
        const hi = Math.max(f382.price, f618.price);
        return currentPrice >= lo && currentPrice <= hi;
      });
      break;

    case "postCorrection":
      // ABC correction completed
      patterns = patterns.filter((p) => p.correction !== null);
      // Correction type filter
      if (correctionTypeFilter !== "all") {
        patterns = patterns.filter(
          (p) => p.correction!.correctionType === correctionTypeFilter,
        );
      }
      break;

    case "highConfidence":
      // Already filtered by minConfidence above (default 70%)
      break;
  }

  return patterns;
}

/**
 * Find the nearest Fibonacci level to the current price.
 */
export function findNearestFib(
  fibs: P2FibTargets,
  currentPrice: number,
): { label: string; distance: number } | null {
  if (fibs.levels.length === 0) return null;

  let nearest = fibs.levels[0];
  let minDist = Math.abs(currentPrice - nearest.price);

  for (let i = 1; i < fibs.levels.length; i++) {
    const dist = Math.abs(currentPrice - fibs.levels[i].price);
    if (dist < minDist) {
      minDist = dist;
      nearest = fibs.levels[i];
    }
  }

  const pctDistance = currentPrice > 0 ? ((currentPrice - nearest.price) / currentPrice) * 100 : 0;

  return { label: nearest.label, distance: pctDistance };
}
