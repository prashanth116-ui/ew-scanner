import type {
  SqueezeData,
  ScoredSqueezeCandidate,
  SqueezeFilters,
  SqueezeComponentScores,
  SqueezeTier,
} from "./ew-types";
import { computeVolumeAcceleration, type VolumeAccelResult } from "./squeeze-volume-accel";

export const DEFAULT_SQUEEZE_FILTERS: SqueezeFilters = {
  minSiPercent: 5,
  minDaysToCover: 1,
  maxFloat: 0, // 0 = no limit
  minVolumeRatio: 0,
  maxMarketCap: 0, // 0 = no limit
  maxNearLowPct: 0, // 0 = no limit
  minScore: 0,
  requireEwAlignment: false,
  requireSiTrendUp: false,
  minFtdScore: 0,
};

/** Wave positions that indicate squeeze-aligned bottoms. */
const SQUEEZE_WAVE_POSITIONS = [
  "wave 2", "wave c", "wave 4",
  "w2", "w4", "wave ii", "wave iv",
  "correction", "corrective",
];

export function isSqueezeAlignedWavePosition(position: string | undefined): boolean {
  if (!position) return false;
  const lower = position.toLowerCase();
  return SQUEEZE_WAVE_POSITIONS.some((p) => lower.includes(p));
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Normalize SI% — Yahoo returns decimal (0.15 = 15%), convert to percentage if needed. */
export function normalizeSiPercent(val: number | null | undefined): number {
  if (val == null || val <= 0) return 0;
  return val > 1 ? val : val * 100;
}

// SI% of float: 0-25 pts (linear 0% → 0, 40%+ → 25)
function scoreSiPercent(si: number | null): number {
  if (si == null || si <= 0) return 0;
  const pct = normalizeSiPercent(si);
  return clamp((pct / 40) * 25, 0, 25);
}

// Days to cover: 0-15 pts (linear 0 → 0, 10+ → 15)
function scoreDaysToCover(dtc: number | null): number {
  if (dtc == null || dtc <= 0) return 0;
  return clamp((dtc / 10) * 15, 0, 15);
}

// Float size: 0-15 pts (tiered)
function scoreFloat(floatShares: number | null): number {
  if (floatShares == null || floatShares <= 0) return 0;
  const floatM = floatShares / 1_000_000;
  if (floatM < 10) return 15;
  if (floatM < 20) return 12;
  if (floatM < 50) return 8;
  if (floatM < 100) return 4;
  if (floatM < 150) return 2;
  return 0;
}

// Volume surge: 0-15 pts (linear 1x → 0, 5x+ → 15)
function scoreVolumeSurge(ratio: number | null): number {
  if (ratio == null || ratio <= 1) return 0;
  return clamp(((ratio - 1) / 4) * 15, 0, 15);
}

// Near 52-week low: 0-15 pts
// At low = 15, within 10% = 12, within 20% = 8, within 30% = 4, above = 0
// Base-forming penalty: if score >= 12 and price < sma50 (freefall), subtract 5
function scoreNear52wLow(
  price: number | null,
  low52w: number | null,
  sma50?: number | null
): { score: number; nearLowPct: number | null } {
  if (price == null || low52w == null || low52w <= 0) {
    return { score: 0, nearLowPct: null };
  }
  const pctAbove = ((price - low52w) / low52w) * 100;
  let score = 0;
  if (pctAbove <= 5) score = 15;
  else if (pctAbove <= 10) score = 12;
  else if (pctAbove <= 20) score = 8;
  else if (pctAbove <= 30) score = 4;

  // Base-forming penalty: near 52w low but below SMA50 = likely freefall, not basing
  if (score >= 12 && sma50 != null && sma50 > 0 && price < sma50) {
    score = Math.max(0, score - 5);
  }

  return { score, nearLowPct: Math.round(pctAbove * 10) / 10 };
}

// FTD pressure: 0-15 pts based on FTD shares as % of float
function scoreFtdPressure(ftdShares: number | null | undefined, floatShares: number | null): number {
  if (ftdShares == null || ftdShares <= 0 || floatShares == null || floatShares <= 0) return 0;
  const pctOfFloat = (ftdShares / floatShares) * 100;
  if (pctOfFloat >= 1.0) return 15;   // >= 1% of float in FTDs — extreme pressure
  if (pctOfFloat >= 0.5) return 12;
  if (pctOfFloat >= 0.2) return 8;
  if (pctOfFloat >= 0.1) return 4;
  return 0;
}

// EW alignment: 0-15 pts
function scoreEwAlignment(position: string | undefined): number {
  if (!position) return 0;
  if (isSqueezeAlignedWavePosition(position)) return 15;
  if (position.toLowerCase().includes("wave")) return 3;
  return 0;
}

function getTier(score: number): SqueezeTier {
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export type SITrendDirection = "up" | "down" | "flat";

/**
 * Compute SI% trend direction from historical data points.
 * Uses simple linear regression (least squares) for 3+ points to smooth noise,
 * falls back to endpoint difference for 2 points.
 * @param siValues - SI% values ordered oldest → newest (min 2 entries)
 * @returns Trend direction and scoring adjustment
 */
export function computeSITrend(
  siValues: number[]
): { direction: SITrendDirection; adjustment: number } {
  if (siValues.length < 2) return { direction: "flat", adjustment: 0 };

  // Use last 3 entries (or fewer if unavailable)
  const recent = siValues.slice(-3);

  let slope: number;

  if (recent.length >= 3) {
    // Linear regression slope (least squares) — robust to single outliers
    const n = recent.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recent[i];
      sumXY += i * recent[i];
      sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  } else {
    // 2 points: simple difference
    slope = recent[recent.length - 1] - recent[0];
  }

  if (slope > 1) return { direction: "up", adjustment: 5 };   // SI increasing → more pressure → +5
  if (slope < -1) return { direction: "down", adjustment: -5 }; // SI decreasing → less pressure → -5
  return { direction: "flat", adjustment: 0 };
}

/**
 * Score volume acceleration for squeeze candidate.
 * @param dailyVolumes - Recent daily volume data (60+ days preferred)
 * @returns Score 0-10 and result data
 */
export function scoreVolumeAcceleration(
  dailyVolumes: number[] | undefined
): { score: number; result: VolumeAccelResult | null } {
  if (!dailyVolumes || dailyVolumes.length < 15) {
    return { score: 0, result: null };
  }
  const result = computeVolumeAcceleration(dailyVolumes);
  return { score: result?.score ?? 0, result };
}

export function computeSqueezeScore(data: SqueezeData): ScoredSqueezeCandidate {
  const volumeRatio =
    data.currentVolume != null && data.avgVolume3Month != null && data.avgVolume3Month > 0
      ? data.currentVolume / data.avgVolume3Month
      : null;

  const { score: near52wScore, nearLowPct } = scoreNear52wLow(
    data.currentPrice,
    data.fiftyTwoWeekLow,
    data.sma50
  );

  const ftdScore = scoreFtdPressure(data.ftdShares, data.floatShares);

  const components: SqueezeComponentScores = {
    siPercent: scoreSiPercent(data.shortPercentOfFloat),
    daysTocover: scoreDaysToCover(data.shortRatio),
    floatSize: scoreFloat(data.floatShares),
    volumeSurge: scoreVolumeSurge(volumeRatio),
    near52wLow: near52wScore,
    ewAlignment: scoreEwAlignment(data.ewPosition),
    ftdPressure: ftdScore,
  };

  const rawScore = Math.round(
    components.siPercent +
    components.daysTocover +
    components.floatSize +
    components.volumeSurge +
    components.near52wLow +
    components.ewAlignment +
    components.ftdPressure
  );

  // SI trend adjustment: +5 if rising, -5 if falling, 0 if flat/unknown
  const siTrendAdj = data.siTrend === "up" ? 5 : data.siTrend === "down" ? -5 : 0;
  const squeezeScore = Math.max(0, rawScore + siTrendAdj);

  return {
    ...data,
    squeezeScore,
    components,
    tier: getTier(squeezeScore),
    volumeRatio,
    nearLowPct,
    siTrendAdjustment: siTrendAdj,
  };
}

export function scoreSqueezeBatch(
  data: SqueezeData[],
  filters: SqueezeFilters
): ScoredSqueezeCandidate[] {
  const scored = data.map(computeSqueezeScore);

  return scored
    .filter((c) => {
      // Min score filter
      if (c.squeezeScore < filters.minScore) return false;

      const siPct = normalizeSiPercent(c.shortPercentOfFloat);
      if (siPct < filters.minSiPercent) return false;
      if ((c.shortRatio ?? 0) < filters.minDaysToCover) return false;
      if (filters.maxFloat > 0 && c.floatShares != null) {
        if (c.floatShares / 1_000_000 > filters.maxFloat) return false;
      }
      if ((c.volumeRatio ?? 0) < filters.minVolumeRatio) return false;
      // Market cap filter
      if (filters.maxMarketCap > 0 && c.marketCap != null) {
        if (c.marketCap / 1_000_000_000 > filters.maxMarketCap) return false;
      }
      // Near 52w low filter
      if (filters.maxNearLowPct > 0 && c.nearLowPct != null) {
        if (c.nearLowPct > filters.maxNearLowPct) return false;
      }
      if (filters.requireEwAlignment && !isSqueezeAlignedWavePosition(c.ewPosition)) {
        return false;
      }
      if (filters.requireSiTrendUp && c.siTrend !== "up") return false;
      if (filters.minFtdScore > 0 && c.components.ftdPressure < filters.minFtdScore) return false;
      return true;
    })
    .sort((a, b) => b.squeezeScore - a.squeezeScore);
}
