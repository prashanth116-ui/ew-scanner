/** Sector Rotation Tracker types. */

export type RRGQuadrant = "LEADING" | "WEAKENING" | "LAGGING" | "IMPROVING";

export interface SectorRotationScore {
  sector: string;
  etf: string;

  // Tier 1: Core Rotation (0-100 normalized)
  momentumComposite: number;
  momentumPercentile: number;
  acceleration: number;
  mansfieldRS: number;
  cmf20: number;
  obvTrend: -1 | 0 | 1;

  // Tier 2: Leading Indicators
  flowPriceDivergence: boolean;
  breadthDivergence: boolean;
  accelerationInflection: boolean;
  breadthPct: number | null;

  // Tier 3: Smart Money
  aggregateInsiderBuys: number;
  aggregatePCR: number | null;
  unusualVolume: boolean;
  earningsBeatPct: number;
  smartMoneyScore: number;

  // RRG Classification
  rsRatio: number;
  rsMomentum: number;
  quadrant: RRGQuadrant;

  // Composite
  compositeScore: number;
  trend: "UP" | "DOWN" | "FLAT";
  trendArrow: string;
  stealthAccumulation: boolean;
}

export interface SectorRotationResult {
  calculatedAt: string;
  sectors: SectorRotationScore[];
  rotationActive: boolean;
  rotationSummary: string;
  dispersionIndex: number;
  crossSectorPairs: {
    xlyXlp: { ratio: number; trend: string };
    xlkXlu: { ratio: number; trend: string };
  };
  topStocksToWatch: {
    sector: string;
    stocks: { ticker: string; score: number; reasons: string[] }[];
  }[];
}
