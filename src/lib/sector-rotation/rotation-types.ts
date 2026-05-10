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

export interface RotationTrackerResult {
  calculatedAt: string;
  activeRotations: ActiveRotationDetail[];
  recentlyEndedRotations: RotationEvent[]; // ended within last 10 trading days
  patternStats: RotationPatternStats[];
  allEvents: RotationEvent[]; // for timeline visualization
}
