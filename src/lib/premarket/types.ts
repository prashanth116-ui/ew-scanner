export interface FuturesSnapshot {
  symbol: string; // "ES=F", "NQ=F", "RTY=F"
  name: string;
  price: number;
  change: number; // absolute
  changePct: number; // percent
  volume: number;
  timestamp: number;
}

/** @deprecated Internals (^TICK, ^TRIN, ^ADD) are permanently unavailable on Yahoo Finance. */
export interface InternalsSnapshot {
  addLine: number | null;
  tick: number | null;
  trin: number | null;
}

export interface SectorBreadth {
  advancing: number;  // count of GICS sector ETFs positive today
  declining: number;  // count of GICS sector ETFs negative today
  ratio: number;      // advancing / (advancing + declining), 0-1
}

export interface VixData {
  level: number;          // current VIX price
  previousClose: number;  // previous session close
  change: number;         // level - previousClose
  changePct: number;      // (change / previousClose) * 100
}

export interface ChecklistItem {
  id: string;
  category: "macro" | "futures" | "internals" | "sectors";
  label: string;
  status: "bullish" | "bearish" | "neutral";
  detail: string;
  autoChecked: boolean; // system-determined pass/fail
}

export type MarketBias = "Strong Bull" | "Lean Bull" | "Neutral" | "Lean Bear" | "Strong Bear";
export type DayType = "Trend Day" | "Range Day" | "Uncertain";

export interface BestToTradeInfo {
  symbol: string;
  direction: "long" | "short";
  reason: string;
}

export interface TradingBias {
  bias: MarketBias;
  confidence: number;           // 0-100
  preferredDirection: "Long" | "Short" | "Flat";
  leadingAsset: string | null;  // "ES" | "NQ" | "YM" | "RTY" | null
  weakestAsset: string | null;  // "ES" | "NQ" | "YM" | "RTY" | null
  bestToTrade: BestToTradeInfo | null;  // asset with highest absolute changePct + directional context
  assetToAvoid: string | null;  // asset diverging from consensus
  dayType: DayType;
  vixInterpretation: string;    // Human-readable VIX cross-reference
  playbook: string;             // 2-3 sentence explanation
  whyThisBias: string[];        // bullet-point reasons (3-5 items)
  biasConflict: boolean;        // true when macro bias (regime/posture) and futures bias diverge by 2+ levels
  biasConflictDetail?: string;  // explanation when biasConflict is true
}

export interface PremarketData {
  futures: FuturesSnapshot[];
  internals: InternalsSnapshot;
  sectorBreadth: SectorBreadth | null;
  vixData: VixData | null;
  checklist: ChecklistItem[];
  biasScore: number; // -10 to +10
  biasLabel: string; // "Strong Bull" / "Lean Bull" / "Neutral" / "Lean Bear" / "Strong Bear"
  tradingBias: TradingBias | null; // null when insufficient data
  timestamp: number;
}
