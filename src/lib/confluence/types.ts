/** Confluence Scanner types — intersection of all 4 scanners. */

export interface ConfluenceScores {
  ewNormalized: number;       // 0-1 (from enhancedNormalized)
  squeezeNormalized: number;  // 0-1 (squeezeScore / 100)
  prerunNormalized: number;   // 0-1 (finalScore / 24)
  sectorNormalized: number;   // 0-1 (compositeScore / 100)
  waveNormalized: number;     // 0-1 (Phase 2 wave score / 100)
  confluenceScore: number;    // 0-1 weighted blend
  passCount: number;          // 0-5 scanners above threshold
}

export interface ConfluenceWeights {
  ew: number;       // 0-100
  squeeze: number;  // 0-100
  prerun: number;   // 0-100
  sector: number;   // 0-100
  wave: number;     // 0-100
}

export interface ConfluenceThresholds {
  ew: number;       // 0-1
  squeeze: number;  // 0-1
  prerun: number;   // 0-1
  sector: number;   // 0-1
  wave: number;     // 0-1
}

export type ConfluenceSignal = "strong" | "moderate" | "weak" | "none";

export interface ConfluenceEWResult {
  enhancedScore: number;
  enhancedNormalized: number;
  confidenceTier: string;
  fibDepthLabel?: string;
  wavePosition?: string;
}

export interface ConfluenceSqueezeResult {
  squeezeScore: number;
  tier: string;
  shortPercentOfFloat?: number | null;
  shortRatio?: number | null;
  components?: {
    siPercent: number;
    daysTocover: number;
    floatSize: number;
    volumeSurge: number;
    near52wLow: number;
    ewAlignment: number;
  };
}

export interface ConfluencePreRunResult {
  finalScore: number;
  verdict: string;
  pctFromAth?: number | null;
  shortFloat?: number | null;
  daysToEarnings?: number | null;
}

export interface ConfluenceSectorResult {
  compositeScore: number;
  quadrant: string;
  trend: string;
}

export interface ConfluenceStratResult {
  totalScore: number;        // 0-13 raw score
  normalizedScore: number;   // 0-1 (totalScore / 13)
  signal: string;            // "ACTIONABLE" | "SETTING_UP" | "NEUTRAL" | "CONFLICTED"
  actionDirection: string | null;  // "LONG" | "SHORT" | "BOTH" | null
  tfcAlignment: string;      // "FULL_BULL" | "FULL_BEAR" | "MIXED"
  comboCount: number;        // number of active combos
  hasBroadening: boolean;    // broadening formation detected
  longTrigger: number | null;
  shortTrigger: number | null;
}

export interface ConfluenceWaveResult {
  score: number;        // 0-100
  label: string;
  direction: 1 | -1 | null;
  confidence: number;
  hasCorrection: boolean;
}

export interface ConfluenceResult {
  ticker: string;
  name: string;
  sector: string;
  price?: number;
  scores: ConfluenceScores;
  signal: ConfluenceSignal;
  ewResult: ConfluenceEWResult | null;
  squeezeResult: ConfluenceSqueezeResult | null;
  prerunResult: ConfluencePreRunResult | null;
  sectorResult: ConfluenceSectorResult | null;
  stratResult: ConfluenceStratResult | null;
  waveResult: ConfluenceWaveResult | null;
  stratBonus?: number;
  trending?: boolean;
  momentumQuality?: {
    rsAcceleration: number;
    rsImproving: boolean;
    rsDelta: number;
    volumeConsistency: number;
  } | null;
}

/** Raw result from the API (before sector merge + client-side scoring). */
export interface ConfluenceScanResult {
  ticker: string;
  name: string;
  price?: number;
  ewResult: ConfluenceEWResult | null;
  squeezeResult: ConfluenceSqueezeResult | null;
  prerunResult: ConfluencePreRunResult | null;
  stratResult: ConfluenceStratResult | null;
  waveResult: ConfluenceWaveResult | null;
  /** Number of scanners that returned data (0-5). */
  scannerCount?: number;
}

export interface ConfluencePreset {
  name: string;
  shortName: string;
  description: string;
  weights: ConfluenceWeights;
  thresholds: ConfluenceThresholds;
  recommended?: boolean;
}

export const DEFAULT_WEIGHTS: ConfluenceWeights = {
  ew: 25,
  squeeze: 20,
  prerun: 20,
  sector: 20,
  wave: 15,
};

export const DEFAULT_THRESHOLDS: ConfluenceThresholds = {
  ew: 0.40,
  squeeze: 0.30,
  prerun: 0.40,
  sector: 0.40,
  wave: 0.30,
};

export const CONFLUENCE_PRESETS: ConfluencePreset[] = [
  {
    name: "Max Conviction",
    shortName: "Max Conviction",
    description: "All scanners must pass with high thresholds. Fewest results, highest quality.",
    weights: { ew: 25, squeeze: 20, prerun: 20, sector: 20, wave: 15 },
    thresholds: { ew: 0.50, squeeze: 0.40, prerun: 0.50, sector: 0.50, wave: 0.40 },
    recommended: true,
  },
  {
    name: "Value Squeeze",
    shortName: "Value Squeeze",
    description: "Emphasizes EW positioning and squeeze setup. Best for beaten-down stocks with short pressure.",
    weights: { ew: 30, squeeze: 30, prerun: 15, sector: 10, wave: 15 },
    thresholds: { ew: 0.45, squeeze: 0.35, prerun: 0.30, sector: 0.20, wave: 0.25 },
  },
  {
    name: "Catalyst Driven",
    shortName: "Catalyst",
    description: "Weights Pre-Run catalysts and sector momentum. Best for event-driven setups.",
    weights: { ew: 15, squeeze: 15, prerun: 35, sector: 20, wave: 15 },
    thresholds: { ew: 0.30, squeeze: 0.20, prerun: 0.45, sector: 0.40, wave: 0.25 },
  },
  {
    name: "Wide Net",
    shortName: "Wide Net",
    description: "Low thresholds, equal weights. Casts widest net for initial screening.",
    weights: { ew: 20, squeeze: 20, prerun: 20, sector: 20, wave: 20 },
    thresholds: { ew: 0.25, squeeze: 0.20, prerun: 0.25, sector: 0.25, wave: 0.20 },
  },
  {
    name: "Rotation Opportunities",
    shortName: "Rotation",
    description: "Stocks in IMPROVING sectors. Heavy sector weight to surface rotation plays early.",
    weights: { ew: 15, squeeze: 15, prerun: 20, sector: 35, wave: 15 },
    thresholds: { ew: 0.25, squeeze: 0.15, prerun: 0.30, sector: 0.50, wave: 0.20 },
  },
];
