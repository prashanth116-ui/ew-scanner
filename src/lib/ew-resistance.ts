/**
 * Price resistance detection for EW Scanner targets.
 * Computes volume-weighted price histogram to find resistance clusters.
 * CLIENT-SAFE: Uses pre-fetched series data (no server deps).
 */

export interface ResistanceCheck {
  isNearResistance: boolean;
  clusterPrice: number | null;
  distancePct: number | null;
}

/**
 * Check if a target price falls near a high-volume price cluster (resistance).
 * Uses 20-bin price histogram from 1y daily closes.
 * @param target - The target price to check
 * @param closes - 1y daily close prices
 * @param volumes - 1y daily volumes (optional, falls back to frequency)
 * @param threshold - % distance to consider "near" (default 2%)
 */
export function checkTargetResistance(
  target: number,
  closes: number[],
  volumes?: number[],
  threshold = 2
): ResistanceCheck {
  if (closes.length < 50 || target <= 0) {
    return { isNearResistance: false, clusterPrice: null, distancePct: null };
  }

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  if (max <= min) {
    return { isNearResistance: false, clusterPrice: null, distancePct: null };
  }

  // Build 20-bin histogram
  const BINS = 20;
  const binSize = (max - min) / BINS;
  const bins = new Array(BINS).fill(0);

  for (let i = 0; i < closes.length; i++) {
    const idx = Math.min(BINS - 1, Math.floor((closes[i] - min) / binSize));
    bins[idx] += volumes && volumes[i] ? volumes[i] : 1;
  }

  // Find top 3 volume clusters
  const indexed = bins.map((count, i) => ({
    count,
    price: min + (i + 0.5) * binSize,
  }));
  indexed.sort((a, b) => b.count - a.count);
  const topClusters = indexed.slice(0, 3);

  // Check if target is within threshold% of any top cluster
  for (const cluster of topClusters) {
    const distance = Math.abs(target - cluster.price) / cluster.price * 100;
    if (distance <= threshold) {
      return {
        isNearResistance: true,
        clusterPrice: Math.round(cluster.price * 100) / 100,
        distancePct: Math.round(distance * 100) / 100,
      };
    }
  }

  return { isNearResistance: false, clusterPrice: null, distancePct: null };
}

/**
 * Check all forward targets against resistance.
 * Returns array of resistance checks for each target.
 */
export function checkTargetsResistance(
  targets: number[],
  closes: number[],
  volumes?: number[]
): ResistanceCheck[] {
  return targets.map((t) => checkTargetResistance(t, closes, volumes));
}
