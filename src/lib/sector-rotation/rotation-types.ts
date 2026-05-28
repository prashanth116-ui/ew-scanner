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

export type RRGQuadrant = "LEADING" | "WEAKENING" | "LAGGING" | "IMPROVING";

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
  signalHistory: { date: string; signalCount: number; close: number }[];
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
  nextEarningsDate: string | null; // enriched client-side from prerun scan
  rs20d: number | null; // enriched client-side from prerun scan (relativeStrength20d)
  rsAccelPrior: number; // Sector RS 5 days ago (same formula, shifted window)
  rsImproving: boolean; // rsDelta > 0 (RS direction is improving)
  rsDelta: number; // rsAcceleration - rsAccelPrior (positive = inflection)
  volumeConsistency: number; // days in last 5 with vol > 10d avg (0-5 scale)
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
export type StockCategory = "leader" | "catch-up" | "avoid" | "turnaround";

export interface ConvictionResult {
  level: ConvictionLevel;
  score: number;
  reason: string;
}

export interface RegimeData {
  regime: "RISK_ON" | "RISK_OFF" | "INFLATIONARY" | "MIXED";
  vix: number;
  vixSlope: "rising" | "falling" | "flat";
  yield10y: number;
  dxy: number;
  dxyTrend: "rising" | "falling" | "flat";
  favoredSectors: string[];
  avoidSectors: string[];
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
