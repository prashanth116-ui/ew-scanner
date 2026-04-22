/** Central types for EW Scanner V3 */

export interface PriceSeries {
  timestamps: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export interface EnrichedQuote {
  ticker: string;
  name: string;
  sector?: string;
  ath: number;
  low: number;
  current: number;
  athYear: number;
  lowYear: number;
  series?: PriceSeries;
}

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
  timestamp?: number;
}

export interface FibLevel {
  ratio: number;
  label: string;
  price: number;
}

export interface FibAnalysis {
  levels: FibLevel[];
  nearestLevel: FibLevel | null;
  withinGoldenZone: boolean;
  retracementDepth: number;
  depthLabel: string;
  extensions?: FibExtension[];
  confluenceZones?: ConfluenceZone[];
}

export interface VolumeAnalysis {
  declineAvgVol: number;
  recoveryAvgVol: number;
  volumeTrend: "expanding" | "contracting" | "neutral";
  confirmation: boolean;
}

export interface MomentumAnalysis {
  declineRoc: number;
  recoveryRoc: number;
  divergence: boolean;
  score: number; // -1 to 1
}

export interface StructureAnalysis {
  swingCount: number;
  classification: "impulsive" | "corrective" | "unclear";
  swings: SwingPoint[];
}

// ── V3: Algorithmic Wave Counting Types ──

export type WaveLabel = "1" | "2" | "3" | "4" | "5" | "A" | "B" | "C";
export type WaveDegree = "primary" | "intermediate" | "minor";

export interface WavePoint extends SwingPoint {
  label: WaveLabel;
  degree: WaveDegree;
  confidence: number; // 0-1
}

export interface WaveCount {
  waves: WavePoint[];
  degree: WaveDegree;
  isValid: boolean;
  violations: string[];
  score: number; // 0-100 quality score
  position: string; // e.g. "In Wave 4 correction"
  alternateCount?: WaveCount;
}

export interface FibExtension {
  ratio: number;
  price: number;
  label: string;
}

export interface ConfluenceZone {
  price: number;
  levels: string[];
}

// ── V3: Multi-Timeframe Types ──

export interface MTFConfirmation {
  alignment: "confirmed" | "conflicting" | "unclear";
  alignmentScore: number; // 0-1
  htfPosition: string;
  ltfPosition: string;
  details: string;
}

export type ScannerMode = "wave2" | "wave4" | "wave5" | "breakout";

export interface DeepAnalysisResult {
  wavePosition: string;
  confidence: "high" | "medium" | "low";
  primaryCount: string;
  alternateCount: string;
  nextTarget: number | null;
  invalidation: number | null;
  keyLevels: { label: string; price: number }[];
  riskLevel: "Low" | "Medium" | "High";
  summary: string;
}

export type ConfidenceTier = "high" | "probable" | "speculative";

export interface EnhancedScoredCandidate {
  ticker: string;
  name: string;
  sector?: string;
  // Base scoring (original 7-pt)
  score: number;
  normalizedScore: number;
  ath: number;
  low: number;
  current: number;
  athYear: number;
  lowYear: number;
  declinePct: number;
  monthsDecline: number;
  recoveryPct: number;
  passed: boolean;
  // Enhanced scoring (20-pt)
  enhancedScore: number;
  enhancedMax: number;
  enhancedNormalized: number;
  confidenceTier: ConfidenceTier;
  // Analysis results
  fibAnalysis?: FibAnalysis;
  volumeAnalysis?: VolumeAnalysis;
  momentumAnalysis?: MomentumAnalysis;
  structureAnalysis?: StructureAnalysis;
  relativeStrength?: number;
  // V3: Wave counting
  waveCount?: WaveCount;
  mtfConfirmation?: MTFConfirmation;
  // Series for sparkline
  series?: PriceSeries;
  athIdx?: number;
  lowIdx?: number;
}

export interface SavedScan {
  id: string;
  name: string;
  savedAt: string;
  mode: ScannerMode;
  universe: string;
  filters: {
    minDecline: number;
    minMonths: number;
    minRecovery: number;
  };
  candidateCount: number;
  candidates: Omit<EnhancedScoredCandidate, "series">[];
  labels: Record<string, string>;
  notes?: string;
  tags?: string[];
  topTickers?: string[];
}

export interface WatchlistItem {
  ticker: string;
  name: string;
  sector?: string;
  addedAt: string;
  scoreAtAdd: number;
  confidenceAtAdd: ConfidenceTier;
  mode: ScannerMode;
}

export interface Watchlist {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: WatchlistItem[];
  alertEnabled?: boolean;
  scoreThreshold?: number;
}

export interface ScanComparison {
  scanA: SavedScan;
  scanB: SavedScan;
  newTickers: string[];
  droppedTickers: string[];
  scoreChanges: { ticker: string; name: string; scoreA: number; scoreB: number; delta: number }[];
}

export interface AlertConfig {
  mode: ScannerMode;
  universe: string;
  minConfidence: ConfidenceTier;
  filters: {
    minDecline: number;
    minMonths: number;
    minRecovery: number;
  };
}
