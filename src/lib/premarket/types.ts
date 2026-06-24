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

export interface PremarketData {
  futures: FuturesSnapshot[];
  internals: InternalsSnapshot;
  checklist: ChecklistItem[];
  biasScore: number; // -10 to +10
  biasLabel: string; // "Strong Bull" / "Lean Bull" / "Neutral" / "Lean Bear" / "Strong Bear"
  timestamp: number;
}
