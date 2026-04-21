import type { PriceSeries, VolumeAnalysis } from "./ew-types";

/**
 * Analyze volume patterns during decline (ATH→Low) vs recovery (Low→Current).
 * Expanding volume on recovery = bullish confirmation.
 * Contracting volume on recovery = weak recovery.
 */
export function analyzeVolume(
  series: PriceSeries,
  athIdx: number,
  lowIdx: number
): VolumeAnalysis {
  const { volume } = series;

  // Average volume during decline
  const declineVols = volume.slice(athIdx, lowIdx + 1).filter((v) => v > 0);
  const declineAvgVol =
    declineVols.length > 0
      ? declineVols.reduce((s, v) => s + v, 0) / declineVols.length
      : 0;

  // Average volume during recovery (after low bar to end)
  const recoveryVols = volume.slice(lowIdx + 1).filter((v) => v > 0);
  const recoveryAvgVol =
    recoveryVols.length > 0
      ? recoveryVols.reduce((s, v) => s + v, 0) / recoveryVols.length
      : 0;

  // Classify volume trend
  let volumeTrend: VolumeAnalysis["volumeTrend"] = "neutral";
  if (declineAvgVol > 0 && recoveryAvgVol > 0) {
    const ratio = recoveryAvgVol / declineAvgVol;
    if (ratio >= 1.15) volumeTrend = "expanding";
    else if (ratio <= 0.85) volumeTrend = "contracting";
  }

  // Confirmation: expanding volume during recovery is bullish
  const confirmation = volumeTrend === "expanding";

  return {
    declineAvgVol: Math.round(declineAvgVol),
    recoveryAvgVol: Math.round(recoveryAvgVol),
    volumeTrend,
    confirmation,
  };
}
