import type { PriceSeries, VolumeAnalysis, WaveCount } from "./ew-types";

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

// ── A2: Per-Wave Volume Analysis ──

export interface WaveVolumeResult {
  /** Average volume per wave segment (keyed by wave label). */
  perWaveAvg: Record<string, number>;
  /** True if Wave 3 volume > Wave 1 volume (EW guideline). */
  wave3HigherThanWave1: boolean;
  /** True if Wave 5 volume < Wave 3 volume (common divergence signal). */
  wave5LowerThanWave3: boolean;
  /** 0-100 adherence score for per-wave volume pattern. */
  adherenceScore: number;
}

/**
 * Analyze volume segmented by wave boundaries from the wave counter.
 * Checks EW volume guidelines:
 * - Wave 3 should have the highest volume
 * - Wave 5 often has lower volume than Wave 3
 */
export function analyzeWaveVolume(
  series: PriceSeries,
  waveCount: WaveCount | null | undefined
): WaveVolumeResult | null {
  if (!waveCount || !waveCount.waves.length || !series.volume) return null;

  const vols = series.volume;
  const waves = waveCount.waves;
  const waveStart = waveCount.waveStart;

  // Build segments: from waveStart → W1, W1 → W2, W2 → W3, etc.
  const segments: { label: string; startIdx: number; endIdx: number }[] = [];
  const allPoints = waveStart ? [waveStart, ...waves] : [...waves];

  for (let i = 1; i < allPoints.length; i++) {
    const prev = allPoints[i - 1];
    const curr = allPoints[i];
    const label = "label" in curr ? (curr as { label: string }).label : String(i);
    segments.push({ label, startIdx: prev.index, endIdx: curr.index });
  }

  if (segments.length === 0) return null;

  // Calculate average volume per segment
  const perWaveAvg: Record<string, number> = {};
  for (const seg of segments) {
    const start = Math.max(0, seg.startIdx);
    const end = Math.min(vols.length - 1, seg.endIdx);
    if (end <= start) continue;
    let sum = 0;
    let count = 0;
    for (let i = start; i <= end; i++) {
      if (vols[i] > 0) { sum += vols[i]; count++; }
    }
    perWaveAvg[seg.label] = count > 0 ? sum / count : 0;
  }

  const w1Vol = perWaveAvg["1"] ?? 0;
  const w3Vol = perWaveAvg["3"] ?? 0;
  const w5Vol = perWaveAvg["5"] ?? 0;

  const wave3HigherThanWave1 = w3Vol > w1Vol && w1Vol > 0;
  const wave5LowerThanWave3 = w5Vol < w3Vol && w3Vol > 0 && w5Vol > 0;

  // Score: 0-100 based on how well volume follows EW pattern
  let adherenceScore = 50; // baseline
  if (wave3HigherThanWave1) adherenceScore += 25;
  if (wave5LowerThanWave3) adherenceScore += 25;
  // Bonus: W3 is the highest volume wave of all impulse waves
  const impulseVols = [w1Vol, w3Vol, w5Vol].filter(v => v > 0);
  if (impulseVols.length >= 2 && w3Vol === Math.max(...impulseVols)) {
    adherenceScore = Math.min(100, adherenceScore + 10);
  }
  // Penalty: W3 is the lowest volume — contradicts EW guidelines
  if (impulseVols.length >= 2 && w3Vol > 0 && w3Vol === Math.min(...impulseVols)) {
    adherenceScore = Math.max(0, adherenceScore - 20);
  }

  return {
    perWaveAvg,
    wave3HigherThanWave1,
    wave5LowerThanWave3,
    adherenceScore,
  };
}
