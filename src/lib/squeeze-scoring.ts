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

function scoreSiPercent(si: number | null): number {
  if (si == null || si <= 0) return 0;
  // SI is often 0-1 from Yahoo (e.g. 0.15 = 15%), convert if needed
  const pct = si > 1 ? si : si * 100;
  // Linear: 0% = 0, 40%+ = 30
  return clamp((pct / 40) * 30, 0, 30);
}

function scoreDaysToCover(dtc: number | null): number {
  if (dtc == null || dtc <= 0) return 0;
  // Linear: 0 = 0, 10+ = 20
  return clamp((dtc / 10) * 20, 0, 20);
}

function scoreFloat(floatShares: number | null): number {
  if (floatShares == null || floatShares <= 0) return 0;
  const floatM = floatShares / 1_000_000;
  if (floatM < 10) return 15;
  if (floatM < 20) return 12;
  if (floatM < 50) return 8;
  if (floatM < 100) return 4;
  return 0;
}

function scoreVolumeSurge(ratio: number | null): number {
  if (ratio == null || ratio <= 1) return 0;
  // Linear: 1x = 0, 5x+ = 20
  return clamp(((ratio - 1) / 4) * 20, 0, 20);
}

function scoreEwAlignment(position: string | undefined): number {
  if (!position) return 0;
  if (isSqueezeAlignedWavePosition(position)) return 15;
  // Any wave position gets a small bonus
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

  const components: SqueezeComponentScores = {
    siPercent: scoreSiPercent(data.shortPercentOfFloat),
    daysTocover: scoreDaysToCover(data.shortRatio),
    floatSize: scoreFloat(data.floatShares),
    volumeSurge: scoreVolumeSurge(volumeRatio),
    ewAlignment: scoreEwAlignment(data.ewPosition),
  };

  const squeezeScore = Math.round(
    components.siPercent +
    components.daysTocover +
    components.floatSize +
    components.volumeSurge +
    components.ewAlignment
  );

  return {
    ...data,
    squeezeScore,
    components,
    tier: getTier(squeezeScore),
    volumeRatio,
  };
}

export function scoreSqueezeBatch(
  data: SqueezeData[],
  filters: SqueezeFilters
): ScoredSqueezeCandidate[] {
  const scored = data.map(computeSqueezeScore);

  return scored
    .filter((c) => {
      const siPct = c.shortPercentOfFloat != null
        ? (c.shortPercentOfFloat > 1 ? c.shortPercentOfFloat : c.shortPercentOfFloat * 100)
        : 0;
      if (siPct < filters.minSiPercent) return false;
      if ((c.shortRatio ?? 0) < filters.minDaysToCover) return false;
      if (filters.maxFloat > 0 && c.floatShares != null) {
        if (c.floatShares / 1_000_000 > filters.maxFloat) return false;
      }
      if ((c.volumeRatio ?? 0) < filters.minVolumeRatio) return false;
      if (filters.requireEwAlignment && !isSqueezeAlignedWavePosition(c.ewPosition)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.squeezeScore - a.squeezeScore);
}
