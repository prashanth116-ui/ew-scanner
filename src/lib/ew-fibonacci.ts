import type { FibLevel, FibAnalysis, FibExtension, ConfluenceZone, WaveCount } from "./ew-types";

const FIB_RATIOS = [
  { ratio: 0.236, label: "23.6%" },
  { ratio: 0.382, label: "38.2%" },
  { ratio: 0.5, label: "50.0%" },
  { ratio: 0.618, label: "61.8%" },
  { ratio: 0.786, label: "78.6%" },
  { ratio: 1.0, label: "100%" },
];

/**
 * Calculate Fibonacci retracement levels from ATH to Low,
 * and analyze where current price sits relative to them.
 */
export function analyzeFibonacci(
  ath: number,
  low: number,
  current: number
): FibAnalysis {
  const range = ath - low;
  if (range <= 0) {
    return {
      levels: [],
      nearestLevel: null,
      withinGoldenZone: false,
      retracementDepth: 0,
      depthLabel: "N/A",
    };
  }

  // Fib retracement levels (from low going up toward ATH)
  const levels: FibLevel[] = FIB_RATIOS.map(({ ratio, label }) => ({
    ratio,
    label,
    price: Math.round((low + range * ratio) * 100) / 100,
  }));

  // How much of the decline has been retraced (0 = at low, 1 = at ATH)
  const retracementDepth = (current - low) / range;

  // Find nearest Fib level (within 3%)
  let nearestLevel: FibLevel | null = null;
  let minDistance = Infinity;
  for (const level of levels) {
    const distance = Math.abs(retracementDepth - level.ratio);
    if (distance < minDistance && distance <= 0.03) {
      minDistance = distance;
      nearestLevel = level;
    }
  }

  // Golden zone: 38.2% - 61.8% retracement
  const withinGoldenZone =
    retracementDepth >= 0.382 && retracementDepth <= 0.618;

  // Depth label
  let depthLabel: string;
  if (retracementDepth < 0) depthLabel = "Below low (new low)";
  else if (retracementDepth < 0.236) depthLabel = "Shallow (<23.6%)";
  else if (retracementDepth < 0.382) depthLabel = "Light (23.6-38.2%)";
  else if (retracementDepth < 0.5) depthLabel = "Golden low (38.2-50%)";
  else if (retracementDepth < 0.618) depthLabel = "Golden high (50-61.8%)";
  else if (retracementDepth < 0.786) depthLabel = "Deep (61.8-78.6%)";
  else if (retracementDepth < 1.0) depthLabel = "Very deep (>78.6%)";
  else depthLabel = "Full retrace (100%+)";

  return {
    levels,
    nearestLevel,
    withinGoldenZone,
    retracementDepth: Math.round(retracementDepth * 1000) / 1000,
    depthLabel,
  };
}

/**
 * Get the Fibonacci zone label for display.
 */
export function getFibZoneLabel(depth: number): string {
  if (depth < 0.236) return "<23.6%";
  if (depth < 0.382) return "23.6-38.2%";
  if (depth < 0.5) return "38.2-50%";
  if (depth < 0.618) return "50-61.8%";
  if (depth < 0.786) return "61.8-78.6%";
  if (depth < 1.0) return "78.6-100%";
  return ">100%";
}

// ── V3: Fibonacci Extensions ──

const FIB_EXTENSION_RATIOS = [
  { ratio: 1.0, label: "100%" },
  { ratio: 1.272, label: "127.2%" },
  { ratio: 1.618, label: "161.8%" },
  { ratio: 2.0, label: "200%" },
  { ratio: 2.618, label: "261.8%" },
  { ratio: 4.236, label: "423.6%" },
];

/**
 * Calculate Fibonacci extension targets from a 3-point pattern (Wave 1 start, Wave 1 end, Wave 2 end).
 * Projects where Wave 3 or Wave 5 might reach.
 */
export function calculateFibExtensions(
  wave1Start: number,
  wave1End: number,
  wave2End: number
): FibExtension[] {
  const wave1Range = wave1End - wave1Start;
  if (Math.abs(wave1Range) < 0.01) return [];

  return FIB_EXTENSION_RATIOS.map(({ ratio, label }) => ({
    ratio,
    price: Math.round((wave2End + wave1Range * ratio) * 100) / 100,
    label,
  }));
}

/**
 * Find confluence zones where multiple Fibonacci levels cluster within 2% of each other.
 */
export function findFibConfluence(
  extensions: FibExtension[],
  retracements: FibLevel[]
): ConfluenceZone[] {
  const allLevels: { price: number; label: string }[] = [
    ...extensions.map((e) => ({ price: e.price, label: `Ext ${e.label}` })),
    ...retracements.map((r) => ({ price: r.price, label: `Ret ${r.label}` })),
  ];

  if (allLevels.length < 2) return [];

  // Sort by price
  allLevels.sort((a, b) => a.price - b.price);

  const zones: ConfluenceZone[] = [];
  let i = 0;

  while (i < allLevels.length) {
    const clusterLevels: string[] = [allLevels[i].label];
    const basePrice = allLevels[i].price;
    let priceSum = basePrice;
    let j = i + 1;

    // Group levels within 2% of the base price
    while (j < allLevels.length) {
      const pctDiff = Math.abs(allLevels[j].price - basePrice) / Math.abs(basePrice || 1);
      if (pctDiff <= 0.02) {
        clusterLevels.push(allLevels[j].label);
        priceSum += allLevels[j].price;
        j++;
      } else {
        break;
      }
    }

    // Only record as confluence if 2+ levels cluster
    if (clusterLevels.length >= 2) {
      zones.push({
        price: Math.round((priceSum / clusterLevels.length) * 100) / 100,
        levels: clusterLevels,
      });
    }

    i = j;
  }

  return zones;
}

/**
 * Enhanced Fibonacci analysis that includes extensions from wave count data.
 */
export function analyzeFibonacciEnhanced(
  ath: number,
  low: number,
  current: number,
  waveCount?: WaveCount | null
): FibAnalysis {
  const base = analyzeFibonacci(ath, low, current);

  if (!waveCount || waveCount.waves.length < 2) return base;

  // Calculate extensions from the wave count
  const waves = waveCount.waves;
  let extensions: FibExtension[] = [];
  let confluenceZones: ConfluenceZone[] = [];

  // If we have at least waves 1 and 2, project Wave 3 targets
  if (waves.length >= 2) {
    const w1Label = waves.find((w) => w.label === "1");
    const w2Label = waves.find((w) => w.label === "2");

    if (w1Label && w2Label) {
      // Use waveStart (p0) if available for accurate Wave 1 start,
      // otherwise fall back to ath/low approximation
      let w1Start: number;
      if (waveCount.waveStart) {
        w1Start = waveCount.waveStart.price;
      } else {
        w1Start = w1Label.price > w2Label.price ? low : ath;
      }
      extensions = calculateFibExtensions(w1Start, w1Label.price, w2Label.price);
      confluenceZones = findFibConfluence(extensions, base.levels);
    }
  }

  return {
    ...base,
    extensions: extensions.length > 0 ? extensions : undefined,
    confluenceZones: confluenceZones.length > 0 ? confluenceZones : undefined,
  };
}
