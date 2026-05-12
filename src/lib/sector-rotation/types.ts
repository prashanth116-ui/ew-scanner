/** Sector Rotation Tracker types. */

export type RRGQuadrant = "LEADING" | "WEAKENING" | "LAGGING" | "IMPROVING";

export interface SectorRotationScore {
  sector: string;
  etf: string;
  subsectors: string[];       // Sector ID (1:1 with ETF proxy)

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
  breadthPct: number | null;   // % of stocks > 50d SMA (stock-level if >= 5, ETF proxy otherwise)

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

  // RRG trail (historical positions, oldest first, current last)
  rrgTrail: { rsRatio: number; rsMomentum: number }[];
  rotationVelocity: number;
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
  /** Per-stock quote data from batch fetch (price vs 50d SMA). */
  stockQuotes: Record<string, { price: number; sma50: number | null; sma200: number | null; pctFromSma50: number | null; rsAccel: number | null; volume: number; avgVolume10d: number }>;
  correlationBreak: boolean;
  /** 20d return correlation matrix between sector ETFs (upper triangle, keyed by "ETF1:ETF2") */
  correlationMatrix?: Record<string, number>;
  /** 20d daily returns per sector ETF for sparklines (newest last, ~20 values) */
  etfReturns20d?: Record<string, number[]>;
  /** Regime data (VIX, 10Y, DXY) */
  regime?: {
    regime: "RISK_ON" | "RISK_OFF" | "INFLATIONARY" | "MIXED";
    vix: number;
    vixSlope: "rising" | "falling" | "flat";
    yield10y: number;
    dxy: number;
    dxyTrend: "rising" | "falling" | "flat";
    favoredSectors: string[];
    avoidSectors: string[];
  };
}
