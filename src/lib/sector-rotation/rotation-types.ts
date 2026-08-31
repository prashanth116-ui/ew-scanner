/**
 * Types for the Sector Rotation Tracker.
 * Detects rotation inflection points and tracks individual stock performance.
 */

export interface RotationSignalState {
  rsGoldenCross: boolean;
  volumeSurge: boolean;
  priceAbove50MA: boolean;
  signalCount: number; // 0-3
}

export type { RRGQuadrant } from "./types";
import type { RRGQuadrant } from "./types";

export interface RotationHealthSignals {
  acceleration: number; // change in 20d ROC — positive = gaining steam, negative = fading
  cmf20: number; // Chaikin Money Flow 20d — positive = inflow, negative = outflow
  quadrant: RRGQuadrant; // RRG classification vs SPY
}

export interface RotationEvent {
  sectorId: string;
  sectorName: string;
  etf: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string | null; // null = still active
  daysActive: number;
  etfPriceAtStart: number;
  etfPriceNow: number;
  etfPerformancePct: number;
  signals: RotationSignalState; // current signal state
  health: RotationHealthSignals; // rotation conviction signals
  signalHistory?: { date: string; signalCount: number; close: number }[];
}

export interface RotationStockPerformance {
  symbol: string;
  name: string;
  priceAtRotationStart: number;
  priceNow: number;
  performancePct: number;
  aboveSma50: boolean;
  volumeVsAvg: number;
  rsAcceleration: number; // Sector RS: positive = catching up vs sector ETF recently (5d vs 20d)
  trendAccel: number | null; // Trend Accel: pctFromSma50 - pctFromSma200 (stock's own trend acceleration)
  dailyChangePct: number; // today's % change from regularMarketChangePercent
  isTurnaroundCandidate: boolean; // lagging stock with positive RS acceleration + volume
  daysToEarnings: number | null; // enriched client-side from prerun scan
  /**
   * Which scanners also flagged this name tonight, e.g. [{scanner:"Trans", detail:"READY"}].
   *
   * Attached by /api/rotation-tracker so the page can show the same cross-scanner
   * confluence the Telegram alert shows. It was previously built only inside the alert
   * routes, which meant the most useful part of that message existed nowhere in the UI.
   * Absent when the scanner tables could not be read — that is a missing read, not an
   * absence of hits, so consumers must not render it as "no scanners".
   */
  scannerHits?: { scanner: string; detail: string }[];
  /** Sector-enrichment conviction (HIGH / MEDIUM / WATCH), merged client-side from the
   *  /api/sector-rotation response the page already fetches. Absent for names outside
   *  the enrichment universe — it gates on mcap >= $10B, so most small caps have none. */
  enrichedConviction?: string;
  nextEarningsDate: string | null; // enriched client-side from prerun scan
  rs20d: number | null; // enriched client-side from prerun scan (relativeStrength20d)
  rsAccelPrior: number; // Sector RS 5 days ago (same formula, shifted window)
  rsImproving: boolean; // rsDelta > 0 (RS direction is improving)
  rsDelta: number; // rsAcceleration - rsAccelPrior (positive = inflection)
  volumeConsistency: number; // days in last 5 with vol > 10d avg (0-5 scale)
  verdict: string | null;       // prerun verdict: "PRIORITY" | "KEEP" | "WATCH" | null
  finalScore: number | null;    // prerun final score (0-41)

  /**
   * Entry-screen inputs measured AT the rotation start date, not today.
   *
   * The selection study validated this screen applied on the day the rotation
   * printed. Re-running it against today's bars is a different, untested signal,
   * so these are deliberately as-of-start and labelled that way in the UI.
   * Null when the 6mo chart does not reach 21 bars before the start date.
   */
  atrPctAtStart: number | null;
  ret20AtStart: number | null;
  breakout20AtStart: boolean | null;

  /**
   * Stock 20d return minus the sector ETF's over the same window (current).
   *
   * Measured against the SECTOR, not SPY, on purpose: inside a single basket on a
   * single date, subtracting an index return is the same constant for every member,
   * so RS-vs-SPY ranks identically to raw return and adds no information. RS vs the
   * sector answers a question the return column cannot - is this name leading or
   * lagging the rotation you are buying it for.
   */
  rsVsSector20: number | null;
}

export interface ActiveRotationDetail {
  event: RotationEvent;
  stocks: RotationStockPerformance[]; // sorted by performancePct desc
}

export interface RotationPatternStats {
  sectorId: string;
  sectorName: string;
  etf: string;
  totalRotations: number;
  avgDurationDays: number;
  avgPerformancePct: number;
  bestPerformancePct: number;
  worstPerformancePct: number;
  history: {
    startDate: string;
    endDate: string;
    durationDays: number;
    performancePct: number;
  }[];
}

// ── Enhancement types ──

export type LifecycleStage = "EARLY" | "MATURING" | "LATE" | "EXHAUSTING";
export type ConvictionLevel = "HIGH" | "MODERATE" | "LOW" | "EXIT";
export type StockCategory = "leader" | "catch-up" | "turnaround" | "avoid";

export interface ConvictionResult {
  level: ConvictionLevel;
  score: number;
  reason: string;
  /**
   * Factors that ADDED points, strongest contribution first.
   *
   * Split from `negatives` because the previous single joined string led with
   * `factors[0]` — always the quadrant, since the quadrant slot is pushed
   * unconditionally first — and then concatenated everything else after a "+".
   * A card could therefore read "MODERATE conviction: leading quadrant +
   * negative acceleration, strong inflow", where a factor that SUBTRACTED a
   * point scans as supporting evidence.
   */
  positives: string[];
  /** Factors that subtracted points (or contributed none). Render separately. */
  negatives: string[];
}

export interface RegimeData {
  regime: "RISK_ON" | "RISK_OFF" | "INFLATIONARY" | "MIXED";
  regimeConfidence?: number; // 0-100, allows downstream to weight low-confidence signals
  vix: number;
  vixSlope: "rising" | "falling" | "flat";
  yield10y: number;
  dxy: number;
  dxyTrend: "rising" | "falling" | "flat";
  favoredSectors: string[];
  avoidSectors: string[];
  vixBounds?: { low: number; high: number };
}

export interface PairSignalData {
  pair: string;
  zScore: number;
  isExtreme: boolean;
  signal: "extreme_risk_on" | "extreme_risk_off" | "normal";
}

export interface RotationTrackerResult {
  calculatedAt: string;
  activeRotations: ActiveRotationDetail[];
  recentlyEndedRotations: RotationEvent[]; // ended within last 10 trading days
  patternStats: RotationPatternStats[];
  allEvents: RotationEvent[]; // for timeline visualization
  regime?: RegimeData | null;
  pairSignals?: {
    xlyXlp: PairSignalData | null;
    xlkXlu: PairSignalData | null;
  } | null;
}
