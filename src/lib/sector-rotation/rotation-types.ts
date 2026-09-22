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
export type { RotationTurn } from "./rotation-turn";
import type { RotationTurn } from "./rotation-turn";

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

  /**
   * Entry-gate inputs, measured twice: on the rotation start bar and on the
   * latest bar. The screen gates on the AT-START pair because that is what the
   * selection study validated; the NOW pair is a health read only and never
   * decides the verdict.
   *
   * Both use the same formulas so the two readings are comparable:
   *   cmf   - Chaikin Money Flow(20) on the ETF
   *   accel - 20d rate of change minus the 20d rate of change 20 bars earlier.
   *
   * `accel` deliberately does NOT match `health.acceleration`, which is
   * calcAcceleration() and differences the ROC over 5 bars rather than 20. The
   * 20-bar version is the one the study calibrated the "> 0" threshold against.
   */
  cmfAtStart: number | null;
  accelAtStart: number | null;
  cmfNow: number | null;
  accelNow: number | null;
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
  /** Was this member above its own 50d SMA on the rotation start bar? Aggregated
   *  client-side into the at-start breadth reading, over the same member set the
   *  screen runs on — a denominator the sector-level breadthPct does not share. */
  aboveSma50AtStart: boolean | null;

  /**
   * The same three screen inputs re-measured on the LATEST bar.
   *
   * Display only, exactly like `EntryScreenResult.live`: the verdict is decided on the
   * start bar because that is where the 78-rotation study validated it, and re-running the
   * screen against today is a different, untested signal. These exist so the card can show
   * whether the qualifying count is climbing or decaying since the rotation started, which
   * stage 6 found to be the one trajectory metric with any separation — and even that was
   * n=50 with a confidence interval spanning chance, so it informs, never gates.
   *
   * Free: fetchStockPerformance already holds the 6mo chart, so this is a second call to
   * computeEntryScreen on the last index.
   */
  atrPctNow: number | null;
  ret20Now: number | null;
  breakout20Now: boolean | null;

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
  /**
   * Current dated RS turn per sector id.
   *
   * Keyed by sector rather than attached to RotationEvent on purpose: an event is a
   * closed period, the turn is a live read, and stamping a 2025 event with today's turn
   * would read as history that never happened. Consumers look up the sectors they are
   * showing.
   *
   * Worth reading beside `startDate`, which is dated off signalCount and is slower than
   * it looks: the RS golden cross is a 10d-vs-30d SMA cross, so on 2026-09-21 it fired
   * for SMH on the same session the RRG quadrant did, while the turn had it on 09-17.
   */
  rotationTurns?: Record<string, RotationTurn>;
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
