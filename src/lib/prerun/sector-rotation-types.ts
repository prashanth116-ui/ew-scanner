/** Sector Rotation Tracker types. */

export type RRGQuadrant = "LEADING" | "WEAKENING" | "LAGGING" | "IMPROVING";

export interface SectorRotationScore {
  sector: string;
  etf: string;
  subsectors: string[];       // Original sector names merged into this entry

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
  breadthPct: number | null;   // % of stocks > 20d SMA (null if < 5 stocks)

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
  dataQuality: number;         // 0-100, what % of composite factors have real data
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
  sectorSpread: number;        // Max - min 20d return across sectors
  crossSectorPairs: {
    xlyXlp: { ratio: number; trend: string };
    xlkXlu: { ratio: number; trend: string };
  };
  topStocksToWatch: {
    sector: string;
    stocks: { ticker: string; score: number; reasons: string[] }[];
  }[];
}
