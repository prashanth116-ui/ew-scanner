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
export type CorrectionType = "zigzag" | "flat" | "expanded_flat" | "triangle" | "unknown";

/** Structured wave position for mode matching (replaces string-only matching). */
export interface WavePosition {
  waveNumber: number | null;       // 1-5 for impulse, null if unclear
  phase: "impulse" | "correction" | "complete" | "developing" | "unknown";
  subPosition: "early" | "middle" | "late" | "unknown";
  label: string;  // e.g. "A", "B", "C" for corrective
}

export interface WavePoint extends SwingPoint {
  label: WaveLabel;
  degree: WaveDegree;
  confidence: number; // 0-1
}

export interface WaveCount {
  waves: WavePoint[];
  waveStart?: SwingPoint; // p0: start of Wave 1 (for Fibonacci extensions)
  direction?: "up" | "down";
  degree: WaveDegree;
  isValid: boolean;
  violations: string[];
  score: number; // 0-100 quality score
  position: string; // e.g. "In Wave 4 correction"
  alternateCount?: WaveCount;
  /** True if Wave 5 didn't exceed Wave 3 (valid but weaker pattern). */
  truncated?: boolean;
  /** Classification of corrective pattern (A-B-C subtypes). */
  correctionType?: CorrectionType;
  /** Structured position for mode matching. */
  structuredPosition?: WavePosition;
  /** True if pattern is a leading or ending diagonal. */
  isDiagonal?: boolean;
  /** Which ATH/low pair produced this count. */
  cycleSource?: "global" | "recent";
  /** Bars from last wave point to current bar. */
  cycleAgeBars?: number;
  /** True if all targets are behind current price. */
  targetsStale?: boolean;
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
  nextTargets?: { label: string; price: number }[];
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
  dailyWaveCount?: WaveCount;    // Daily intermediate-degree wave count
  dailySeries?: PriceSeries;     // 1-year daily bars (for wave date lookups)
  recentCycleWaveCount?: WaveCount;  // Wave count from recent cycle pivot
  // Series for sparkline
  series?: PriceSeries;
  athIdx?: number;
  lowIdx?: number;
  // Quant enrichment
  correctionVolumeDryUp?: boolean;
  wave3Target?: number | null;
  wavePositionMatch?: boolean;
  // Structural fallback: true ATH/Low when analysis uses prior correction
  trueAth?: number;
  trueAthYear?: number;
  trueLow?: number;
  trueLowYear?: number;
  // Pre-ATH impulse start for Fibonacci analysis
  preAthLow?: number;
  preAthLowYear?: number;
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
    fibFilter?: string;
    volFilter?: string;
    mtfFilter?: string;
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

// ── Short Squeeze Screener Types ──

export interface SqueezeData {
  ticker: string;
  name: string;
  shortPercentOfFloat: number | null;
  shortRatio: number | null; // days to cover
  sharesShort: number | null;
  floatShares: number | null;
  sharesOutstanding: number | null;
  dateShortInterest: number | null; // unix timestamp
  currentVolume: number | null;
  avgVolume3Month: number | null;
  currentPrice: number | null;
  marketCap: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  heldPercentInsiders: number | null;
  heldPercentInstitutions: number | null;
  // Optional EW enrichment
  ewPosition?: string;
  ewConfidence?: string;
  // Optional enrichment for FTD / SMA
  ftdShares?: number | null;
  sma50?: number | null;
}

export interface SqueezeComponentScores {
  siPercent: number; // 0-25
  daysTocover: number; // 0-15
  floatSize: number; // 0-15
  volumeSurge: number; // 0-15
  near52wLow: number; // 0-15
  ewAlignment: number; // 0-15
  ftdPressure: number; // 0-15
}

export type SqueezeTier = "high" | "medium" | "low";

export interface ScoredSqueezeCandidate extends SqueezeData {
  squeezeScore: number; // 0-100
  components: SqueezeComponentScores;
  tier: SqueezeTier;
  volumeRatio: number | null;
  nearLowPct: number | null; // how far above 52w low (0% = at low)
}

export interface SqueezeFilters {
  minSiPercent: number;
  minDaysToCover: number;
  maxFloat: number; // in millions, 0 = no limit
  minVolumeRatio: number;
  maxMarketCap: number; // in billions, 0 = no limit
  maxNearLowPct: number; // max % above 52w low, 0 = no limit
  minScore: number; // 0-100, skip stocks below this
  requireEwAlignment: boolean;
}

export interface SavedSqueezeScan {
  id: string;
  name: string;
  savedAt: string;
  universe: string;
  filters: SqueezeFilters;
  candidateCount: number;
  candidates: ScoredSqueezeCandidate[];
}

// ── Squeeze Watchlist Types ──

export interface SqueezeWatchlistItem {
  ticker: string;
  name: string;
  addedAt: string;
  scoreAtAdd: number; // 0-100 squeeze score
  siPercentAtAdd: number; // SI% at time of add
  tierAtAdd: SqueezeTier;
}

export interface SqueezeWatchlist {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: SqueezeWatchlistItem[];
  scoreThreshold?: number;
}
