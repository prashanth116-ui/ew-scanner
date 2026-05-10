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
