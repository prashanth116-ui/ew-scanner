export interface FuturesSnapshot {
  symbol: string; // "ES=F", "NQ=F", "RTY=F"
  name: string;
  price: number;
  change: number; // absolute
  changePct: number; // percent
  volume: number;
  timestamp: number;
}

export interface InternalsSnapshot {
  addLine: number | null; // ^ADD (NYSE Advance-Decline)
  tick: number | null; // ^TICK (NYSE TICK)
  trin: number | null; // ^TRIN (Arms Index)
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

export interface TradingBias {
  bias: MarketBias;
  confidence: number;           // 0-100
  preferredDirection: "Long" | "Short" | "Flat";
  leadingAsset: string | null;  // "ES" | "NQ" | "YM" | null
  weakestAsset: string | null;  // "ES" | "NQ" | "YM" | null
  bestToTrade: string | null;   // asset with highest absolute changePct
  assetToAvoid: string | null;  // asset diverging from consensus
  dayType: DayType;
  vixInterpretation: string;    // Human-readable VIX cross-reference
  playbook: string;             // 2-3 sentence explanation
  whyThisBias: string[];        // bullet-point reasons (3-5 items)
}

export interface PremarketData {
  futures: FuturesSnapshot[];
  internals: InternalsSnapshot;
  checklist: ChecklistItem[];
  biasScore: number; // -10 to +10
  biasLabel: string; // "Strong Bull" / "Lean Bull" / "Neutral" / "Lean Bear" / "Strong Bear"
  tradingBias: TradingBias | null; // null when insufficient data
  timestamp: number;
}
