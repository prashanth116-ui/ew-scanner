// ── Re-exported types ──

export type TradingAction = "TRADE" | "BUILD" | "WATCH" | "TRIM" | "AVOID";
export type SortMode = "score" | "action" | "quadrant" | "acceleration" | "name";
export type SmaFilter = "all" | "above" | "below";
export type VolFilter = "all" | "above" | "below";
export type VerdictFilter = "all" | "priority" | "keep" | "watch";
export type RsAccelFilter = "all" | "positive" | "negative";
export type PhaseFilter = "all" | "basing" | "turnaround" | "trending" | "exhausting";
export type PicksSortKey = "conviction" | "symbol" | "category" | "phase" | "rsAccel" | "volRatio" | "price" | "pctFrom50ma" | "ret20d";
export type PullbackSortKey = "tier" | "symbol" | "sector" | "price" | "pctFrom200ma" | "distanceTo80Pct" | "pctFrom50ma" | "volRatio";

export interface StockInSector {
  ticker: string;
  companyName: string;
  rs20d: number | null;
  rsAccel: number | null;
  sectorRS: number | null;
  pctFromAth: number | null;
  finalScore: number;
  verdict: string;
  price: number | null;
  aboveSma50: boolean | null;
  volumeVsAvg: number | null;
  sectorName: string;
  daysToEarnings: number | null;
  nextEarningsDate: string | null;
  rsImproving: boolean;
  rsDelta: number;
  volumeConsistency: number;
  institutionalPct: number | null;
  inActiveRotation: boolean;
  rotationPerfPct: number | null;
}

export interface SectorAlert {
  id: string;
  sectorEtf: string;
  condition: "enters_quadrant" | "acceleration_positive" | "cmf_positive";
  value?: string;
  enabled: boolean;
}
