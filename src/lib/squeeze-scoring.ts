import type {
  SqueezeData,
  ScoredSqueezeCandidate,
  SqueezeFilters,
  SqueezeComponentScores,
  SqueezeTier,
} from "./ew-types";

export const DEFAULT_SQUEEZE_FILTERS: SqueezeFilters = {
  minSiPercent: 5,
  minDaysToCover: 1,
  maxFloat: 0, // 0 = no limit
  minVolumeRatio: 0,
  maxMarketCap: 0, // 0 = no limit
  maxNearLowPct: 0, // 0 = no limit
  minScore: 0,
  requireEwAlignment: false,
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

// SI% of float: 0-25 pts (linear 0% → 0, 40%+ → 25)
function scoreSiPercent(si: number | null): number {
  if (si == null || si <= 0) return 0;
  const pct = si > 1 ? si : si * 100;
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
function scoreNear52wLow(
  price: number | null,
  low52w: number | null
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
  return { score, nearLowPct: Math.round(pctAbove * 10) / 10 };
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

export function computeSqueezeScore(data: SqueezeData): ScoredSqueezeCandidate {
  const volumeRatio =
    data.currentVolume != null && data.avgVolume3Month != null && data.avgVolume3Month > 0
      ? data.currentVolume / data.avgVolume3Month
      : null;

  const { score: near52wScore, nearLowPct } = scoreNear52wLow(
    data.currentPrice,
    data.fiftyTwoWeekLow
  );

  const components: SqueezeComponentScores = {
    siPercent: scoreSiPercent(data.shortPercentOfFloat),
    daysTocover: scoreDaysToCover(data.shortRatio),
    floatSize: scoreFloat(data.floatShares),
    volumeSurge: scoreVolumeSurge(volumeRatio),
    near52wLow: near52wScore,
    ewAlignment: scoreEwAlignment(data.ewPosition),
  };

  const squeezeScore = Math.round(
    components.siPercent +
    components.daysTocover +
    components.floatSize +
    components.volumeSurge +
    components.near52wLow +
    components.ewAlignment
  );

  return {
    ...data,
    squeezeScore,
    components,
    tier: getTier(squeezeScore),
    volumeRatio,
    nearLowPct,
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

      const siPct = c.shortPercentOfFloat != null
        ? (c.shortPercentOfFloat > 1 ? c.shortPercentOfFloat : c.shortPercentOfFloat * 100)
        : 0;
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
      return true;
    })
    .sort((a, b) => b.squeezeScore - a.squeezeScore);
}
