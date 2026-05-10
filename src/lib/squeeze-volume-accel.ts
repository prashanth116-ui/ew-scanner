/**
 * Volume acceleration detection for Squeeze Scanner.
 * Computes 5-day linear regression slope of daily volume relative to 3-month average.
 * CLIENT-SAFE: Uses pre-fetched daily data.
 */

export interface VolumeAccelResult {
  slope: number; // Linear regression slope of normalized volume
  isAccelerating: boolean; // slope > 0.3
  score: number; // 0-10 pts for squeeze scoring
  ratio5d: number; // Average last 5 days vs 3-month avg
}

/**
 * Compute volume acceleration from daily volume data.
 * @param dailyVolumes - Last 60+ days of daily volume
 * @returns VolumeAccelResult or null if insufficient data
 */
export function computeVolumeAcceleration(
  dailyVolumes: number[]
): VolumeAccelResult | null {
  if (dailyVolumes.length < 15) return null;

  // 3-month average (last 63 trading days or available)
  const avgPeriod = Math.min(63, dailyVolumes.length);
  const avg3mo =
    dailyVolumes.slice(-avgPeriod).reduce((a, b) => a + b, 0) / avgPeriod;

  if (avg3mo <= 0) return null;

  // Normalize last 10 days relative to 3mo average
  const last10 = dailyVolumes.slice(-10).map((v) => v / avg3mo);

  // Linear regression on last 5 days
  const last5 = last10.slice(-5);
  const slope = linearRegressionSlope(last5);

  // 5-day average ratio
  const ratio5d = last5.reduce((a, b) => a + b, 0) / last5.length;

  const isAccelerating = slope > 0.3;

  // Score: 0-10 based on slope magnitude
  let score = 0;
  if (slope > 1.0) score = 10;
  else if (slope > 0.7) score = 8;
  else if (slope > 0.5) score = 6;
  else if (slope > 0.3) score = 4;
  else if (slope > 0.1) score = 2;

  return { slope: Math.round(slope * 100) / 100, isAccelerating, score, ratio5d: Math.round(ratio5d * 100) / 100 };
}

/**
 * Simple linear regression slope for evenly-spaced data.
 * x = 0, 1, 2, ..., n-1
 */
function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) * (i - xMean);
  }

  return denominator !== 0 ? numerator / denominator : 0;
}
