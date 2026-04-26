/**
 * Historical pattern templates for Pre-Run Scanner.
 * Compares current stock characteristics to known multi-bagger setups.
 */

import type { PreRunStockData } from "./types";

export interface PatternTemplate {
  name: string;           // e.g. "SNDK 2013"
  description: string;
  athDropMin: number;     // Min % from ATH (e.g. 40)
  athDropMax: number;     // Max % from ATH (e.g. 80)
  baseWeeksMin: number;   // Min weeks in base
  baseWeeksMax: number;   // Max weeks in base
  shortInterestMin: number; // Min short float %
  shortInterestMax: number; // Max short float %
  marketCapMin: number;   // Min market cap ($)
  marketCapMax: number;   // Max market cap ($)
  volumeRatioMin: number; // Min up/down volume ratio (accumulation)
}

export interface PatternMatchResult {
  template: string;
  similarity: number; // 0-100%
}

/** Known multi-bagger pattern templates. */
const TEMPLATES: PatternTemplate[] = [
  {
    name: "SNDK 2013",
    description: "Flash storage transition. Long base, high SI, structural demand shift.",
    athDropMin: 40,
    athDropMax: 70,
    baseWeeksMin: 52,
    baseWeeksMax: 104,
    shortInterestMin: 12,
    shortInterestMax: 25,
    marketCapMin: 5_000_000_000,
    marketCapMax: 30_000_000_000,
    volumeRatioMin: 1.2,
  },
  {
    name: "CAR 2021",
    description: "Rental car supply shock. High SI, travel rebound, pricing power.",
    athDropMin: 50,
    athDropMax: 85,
    baseWeeksMin: 26,
    baseWeeksMax: 78,
    shortInterestMin: 15,
    shortInterestMax: 35,
    marketCapMin: 1_000_000_000,
    marketCapMax: 15_000_000_000,
    volumeRatioMin: 1.1,
  },
  {
    name: "CVNA 2023",
    description: "Max pessimism turnaround. Near-bankruptcy, extreme SI, operational fix.",
    athDropMin: 80,
    athDropMax: 99,
    baseWeeksMin: 13,
    baseWeeksMax: 52,
    shortInterestMin: 20,
    shortInterestMax: 50,
    marketCapMin: 500_000_000,
    marketCapMax: 10_000_000_000,
    volumeRatioMin: 1.3,
  },
  {
    name: "GME 2021",
    description: "Meme squeeze. Extreme SI, retail momentum, narrative shift.",
    athDropMin: 60,
    athDropMax: 95,
    baseWeeksMin: 8,
    baseWeeksMax: 52,
    shortInterestMin: 25,
    shortInterestMax: 140,
    marketCapMin: 200_000_000,
    marketCapMax: 5_000_000_000,
    volumeRatioMin: 1.5,
  },
  {
    name: "SMCI 2024",
    description: "AI infrastructure demand. Deep base, institutional under-owned, revenue acceleration.",
    athDropMin: 40,
    athDropMax: 75,
    baseWeeksMin: 26,
    baseWeeksMax: 130,
    shortInterestMin: 5,
    shortInterestMax: 20,
    marketCapMin: 3_000_000_000,
    marketCapMax: 25_000_000_000,
    volumeRatioMin: 1.2,
  },
];

/**
 * Calculate how well a stock matches a pattern template.
 * Uses normalized distance on each feature, then averages.
 * Returns 0-100 similarity score.
 */
function matchTemplate(data: PreRunStockData, template: PatternTemplate): number {
  const features: number[] = [];

  // ATH drop: how well the stock's % from ATH fits the template range
  const athDrop = data.pctFromAth ?? 0;
  features.push(rangeScore(athDrop, template.athDropMin, template.athDropMax));

  // Base weeks
  const weeks = data.weeksInBase ?? 0;
  features.push(rangeScore(weeks, template.baseWeeksMin, template.baseWeeksMax));

  // Short interest
  const si = data.shortFloat ?? 0;
  features.push(rangeScore(si, template.shortInterestMin, template.shortInterestMax));

  // Market cap
  const mcap = data.marketCap ?? 0;
  features.push(rangeScore(mcap, template.marketCapMin, template.marketCapMax));

  // Volume ratio
  const avgUp = data.avgVolumeUpDays ?? 0;
  const avgDown = data.avgVolumeDownDays ?? 1;
  const ratio = avgDown > 0 ? avgUp / avgDown : avgUp > 0 ? 2 : 0;
  features.push(rangeScore(ratio, template.volumeRatioMin, template.volumeRatioMin * 2));

  // Average all feature scores
  const avg = features.reduce((a, b) => a + b, 0) / features.length;
  return Math.round(avg * 100);
}

/**
 * Score how well a value fits within a target range.
 * Returns 1.0 if inside range, decays linearly outside.
 */
function rangeScore(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 1.0;

  const rangeWidth = max - min;
  if (rangeWidth === 0) return value === min ? 1.0 : 0;

  // Allow 50% overshoot before score drops to 0
  const margin = rangeWidth * 0.5;

  if (value < min) {
    const dist = min - value;
    return Math.max(0, 1 - dist / margin);
  }
  // value > max
  const dist = value - max;
  return Math.max(0, 1 - dist / margin);
}

/** Find the best matching pattern template for a stock. */
export function matchBestPattern(data: PreRunStockData): PatternMatchResult | null {
  let best: PatternMatchResult | null = null;

  for (const template of TEMPLATES) {
    const similarity = matchTemplate(data, template);
    if (similarity >= 50 && (best === null || similarity > best.similarity)) {
      best = { template: template.name, similarity };
    }
  }

  return best;
}

/** Get all pattern template names. */
export function getPatternTemplates(): PatternTemplate[] {
  return TEMPLATES;
}
