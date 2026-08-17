/**
 * Scored ICT scanner — type definitions.
 *
 * Deliberately free of `server-only` imports so every type here is usable
 * from tests and client components.
 */

/** Raw OHLC input. Structurally compatible with OHLCData in src/lib/ict/data.ts. */
export interface CandleSeries {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  timestamps?: number[];
}

/** Fields every detection shares. */
export interface DetectionBase {
  /** Absolute index into the series of the bar that produced this detection. */
  barIndex: number;
  /** Bars between that bar and the bar being assessed. 0 = current bar. */
  barsAgo: number;
  /** Detection strength, 0..1. Feeds the component score. */
  quality: number;
}

export interface SSLRaidHit extends DetectionBase {
  /** The prior-low pool that was swept. */
  sweptLevel: number;
  /** Low of the raid bar — the structural protected low. */
  raidLow: number;
  /** Whether the bar closed back above the swept level. */
  reclaimed: boolean;
  /** Where the bar closed within its own range, 0..1. */
  closeLocation: number;
}

export interface DisplacementHit extends DetectionBase {
  bodyRatio: number;
  /** Body relative to the largest of the prior N bodies. */
  expansionRatio: number;
  closeLocation: number;
  /** Low of the displacement candle — secondary invalidation level. */
  candleLow: number;
  candleHigh: number;
}

export interface MSSHit extends DetectionBase {
  /** The structure high that was reclaimed. */
  structureHigh: number;
  /** How far the close exceeded it, in %. */
  marginPct: number;
  /** True when the structure high was frozen at an SSL anchor. */
  anchored: boolean;
}

export interface FVGHit extends DetectionBase {
  lower: number;
  upper: number;
  /** Gap height as % of price at formation. */
  gapPct: number;
  /** Deepest penetration back into the zone since formation, 0..1. */
  retracedFraction: number;
  /** Price traded fully through the zone. */
  filled: boolean;
}

export interface ReaccumulationHit extends DetectionBase {
  /** The higher low that was set. */
  higherLow: number;
  /** Its distance above the protected low, in %. */
  marginPct: number;
}

export interface BSLHit extends DetectionBase {
  level: number;
  clusterCount: number;
  /** Current distance below the pool, in %. Negative once price is above it. */
  distancePct: number;
}

export interface CompressionHit extends DetectionBase {
  /** Current block range vs prior equal-length block. < 1 means contracting. */
  contractionRatio: number;
  consecutiveHigherLows: number;
  /** Distance below BSL in %, or null when no BSL was found. */
  distanceToBslPct: number | null;
}

/** Every detection assembled for one series. Any field may be null. */
export interface ICTDetections {
  ssl: SSLRaidHit | null;
  displacement: DisplacementHit | null;
  mss: MSSHit | null;
  fvg: FVGHit | null;
  reaccumulation: ReaccumulationHit | null;
  bsl: BSLHit | null;
  compression: CompressionHit | null;
}

/** Per-component points awarded, before penalties. */
export interface ICTComponents {
  ssl: number;
  displacement: number;
  mss: number;
  fvg: number;
  reaccumulation: number;
  bsl: number;
  compression: number;
  coherence: number;
}

export type ICTGrade = "PRIME" | "BUILDING" | "FORMING" | "NONE";

export interface ICTRiskFlags {
  /** A close broke the protected low. The structure failed. */
  invalidated: boolean;
  /** Price ran far above the FVG. */
  extended: boolean;
  /** Consecutive expansion candles into the current bar. */
  chasing: boolean;
}

export interface ICTAssessment {
  /** Final score, 0..100, after penalties. */
  score: number;
  /** Component total before penalties. */
  rawScore: number;
  grade: ICTGrade;
  components: ICTComponents;
  detections: ICTDetections;
  flags: ICTRiskFlags;

  /** Penalty points actually subtracted, itemized for display. */
  penalties: { reason: string; points: number }[];

  /** Structural stop: the raid low, else the displacement low. */
  protectedLow: number | null;
  /** Upside objective: the buy-side pool. */
  bslTarget: number | null;

  /** How many of the seven ingredients were found. */
  ingredientsFound: number;
  /** Chronological pairs in correct order / pairs testable. */
  coherenceRatio: number;

  /** Human-readable, one line per component. Drives UI and chart validation. */
  evidence: string[];
  /** Bars in the series that were assessed. */
  barsAssessed: number;
}
