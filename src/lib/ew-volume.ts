import type { PriceSeries, VolumeAnalysis } from "./ew-types";

export interface VolumeOptions {
  /** When set, analyze only the last N bars (first-half vs second-half trend). */
  recentBars?: number;
}

/**
 * Analyze volume patterns during decline (ATH→Low) vs recovery (Low→Current).
 * Expanding volume on recovery = bullish confirmation.
 * Contracting volume on recovery = weak recovery.
 *
 * When `options.recentBars` is set (e.g., for structural override stocks),
 * analyzes only the recent window: compares first-half vs second-half volume
 * instead of old-correction-decline vs recovery.
 */
export function analyzeVolume(
  series: PriceSeries,
  athIdx: number,
  lowIdx: number,
  options?: VolumeOptions
): VolumeAnalysis {
  const { volume } = series;

  if (options?.recentBars && options.recentBars > 0) {
    // Recent-window mode: split last N bars into first-half vs second-half
    const startIdx = Math.max(0, volume.length - options.recentBars);
    const recentVols = volume.slice(startIdx).filter((v) => v > 0);
    if (recentVols.length < 4) {
      return { declineAvgVol: 0, recoveryAvgVol: 0, volumeTrend: "neutral", confirmation: false };
    }
    const mid = Math.floor(recentVols.length / 2);
    const firstHalf = recentVols.slice(0, mid);
    const secondHalf = recentVols.slice(mid);
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

    let volumeTrend: VolumeAnalysis["volumeTrend"] = "neutral";
    if (Number.isFinite(firstAvg) && firstAvg > 0 && Number.isFinite(secondAvg) && secondAvg > 0) {
      const ratio = secondAvg / firstAvg;
      if (ratio >= 1.15) volumeTrend = "expanding";
      else if (ratio <= 0.85) volumeTrend = "contracting";
    }
    return {
      declineAvgVol: Math.round(firstAvg) || 0,
      recoveryAvgVol: Math.round(secondAvg) || 0,
      volumeTrend,
      confirmation: volumeTrend === "expanding",
    };
  }

  // Standard mode: decline vs recovery volume comparison
  const declineVols = volume.slice(athIdx, lowIdx + 1).filter((v) => v > 0);
  const declineAvgVol =
    declineVols.length > 0
      ? declineVols.reduce((s, v) => s + v, 0) / declineVols.length
      : 0;

  const recoveryVols = volume.slice(lowIdx + 1).filter((v) => v > 0);
  const recoveryAvgVol =
    recoveryVols.length > 0
      ? recoveryVols.reduce((s, v) => s + v, 0) / recoveryVols.length
      : 0;

  // Classify volume trend with NaN/Infinity guards
  let volumeTrend: VolumeAnalysis["volumeTrend"] = "neutral";
  if (Number.isFinite(declineAvgVol) && declineAvgVol > 0 && Number.isFinite(recoveryAvgVol) && recoveryAvgVol > 0) {
    const ratio = recoveryAvgVol / declineAvgVol;
    if (Number.isFinite(ratio)) {
      if (ratio >= 1.15) volumeTrend = "expanding";
      else if (ratio <= 0.85) volumeTrend = "contracting";
    }
  }

  const confirmation = volumeTrend === "expanding";

  return {
    declineAvgVol: Math.round(declineAvgVol) || 0,
    recoveryAvgVol: Math.round(recoveryAvgVol) || 0,
    volumeTrend,
    confirmation,
  };
}
