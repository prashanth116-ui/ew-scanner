/** The Strat scanner types — Rob Smith methodology. */

export type StratBarType = "1" | "2U" | "2D" | "3";
export type StratDirection = "BULL" | "BEAR" | "NEUTRAL";
export type TFCAlignment = "FULL_BULL" | "FULL_BEAR" | "MIXED";
export type StratSignal = "ACTIONABLE" | "SETTING_UP" | "NEUTRAL" | "CONFLICTED";

export type StratComboName =
  | "2-1-2U_REV"
  | "2-1-2D_REV"
  | "2-1-2U_CONT"
  | "2-1-2D_CONT"
  | "3-1-2U"
  | "3-1-2D"
  | "1-2-2U_REV"
  | "1-2-2D_REV"
  | "3-2-2U_REV"
  | "3-2-2D_REV"
  | "2-2-2U_CONT"
  | "2-2-2D_CONT"
  | "1-3-2U"
  | "1-3-2D"
  | "2-3-2U_REV"
  | "2-3-2D_REV";

export interface StratBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
  barType: StratBarType;
}

export interface StratTimeframe {
  label: "monthly" | "weekly" | "daily";
  bars: StratBar[];
  currentBarType: StratBarType;
  priorBarType: StratBarType;
  direction: StratDirection;
}

export interface StratCombo {
  name: StratComboName;
  timeframe: "monthly" | "weekly" | "daily";
  direction: "BULL" | "BEAR";
  barSequence: StratBarType[];
  triggerHigh: number;
  triggerLow: number;
  isActionable: boolean;
  description: string;
}

export interface StratTFC {
  monthly: StratDirection;
  weekly: StratDirection;
  daily: StratDirection;
  alignment: TFCAlignment;
  score: number;
}

export interface StratTriggers {
  longTrigger: number | null;
  shortTrigger: number | null;
  longSource: string;
  shortSource: string;
}

export interface StratPMG {
  level: number;
  side: "HIGH" | "LOW";
  testCount: number;
  timeframe: string;
}

export interface StratBroadening {
  timeframe: "monthly" | "weekly" | "daily";
  barCount: number;
  newHighCount: number;
  newLowCount: number;
  rangeExpansion: number;
  upperBound: number;
  lowerBound: number;
  strength: "STRONG" | "MODERATE";
}

export interface StratResult {
  ticker: string;
  companyName: string;
  currentPrice: number | null;
  monthly: StratTimeframe | null;
  weekly: StratTimeframe | null;
  daily: StratTimeframe | null;
  tfc: StratTFC;
  combos: StratCombo[];
  triggers: StratTriggers;
  pmgs: StratPMG[];
  broadenings: StratBroadening[];
  scores: {
    tfcScore: number;
    comboScore: number;
    actionabilityScore: number;
    pmgScore: number;
    volumeScore: number;
    totalScore: number;
    normalizedScore: number;
  };
  signal: StratSignal;
  actionDirection: "LONG" | "SHORT" | "BOTH" | null;
}

export interface StratFilters {
  sectorBucket: string;
  tfcAlignment: string;
  activeCombo: string;
  comboTimeframe: string;
  barTypeFilter: string;
  minScore: number;
  signalFilter: string;
  hasBroadening: string;
}

export const DEFAULT_STRAT_FILTERS: StratFilters = {
  sectorBucket: "All",
  tfcAlignment: "All",
  activeCombo: "All",
  comboTimeframe: "All",
  barTypeFilter: "All",
  minScore: 0,
  signalFilter: "All",
  hasBroadening: "All",
};

export interface StratPreset {
  name: string;
  shortName: string;
  description: string;
  filters: Partial<StratFilters>;
  recommended?: boolean;
}

export const STRAT_PRESETS: StratPreset[] = [
  {
    name: "Full Bull TFC",
    shortName: "Bull TFC",
    description: "All 3 timeframes aligned bullish. Strongest long setups.",
    filters: { tfcAlignment: "FULL_BULL", minScore: 5 },
    recommended: true,
  },
  {
    name: "Full Bear TFC",
    shortName: "Bear TFC",
    description: "All 3 timeframes aligned bearish. Strongest short setups.",
    filters: { tfcAlignment: "FULL_BEAR", minScore: 5 },
  },
  {
    name: "2-1-2 Reversals",
    shortName: "2-1-2 Rev",
    description: "Stocks with 2-1-2 reversal combos forming or triggered.",
    filters: { activeCombo: "2-1-2_REV" },
  },
  {
    name: "Inside Day Breakout",
    shortName: "Inside Day",
    description: "Stocks with daily inside bar (type 1) — breakout pending.",
    filters: { barTypeFilter: "1", comboTimeframe: "daily" },
  },
  {
    name: "Actionable Now",
    shortName: "Actionable",
    description: "Only stocks with triggered combos and high scores.",
    filters: { signalFilter: "ACTIONABLE", minScore: 8 },
  },
  {
    name: "Wide Net",
    shortName: "Wide Net",
    description: "Relaxed filters to see full universe. Good for exploration.",
    filters: { minScore: 0, tfcAlignment: "All", signalFilter: "All" },
  },
];

export interface SavedStratScan {
  id: string;
  name: string;
  savedAt: string;
  filters: StratFilters;
  resultCount: number;
  results: StratResult[];
}

export const MAX_STRAT_SCORE = 13;

// ── Watchlist types ──

export interface StratWatchlistItem {
  ticker: string;
  name: string;
  addedAt: string;
  scoreAtAdd: number;
  signalAtAdd: StratSignal;
  tfcAtAdd: TFCAlignment;
  directionAtAdd: "BULL" | "BEAR" | "MIXED";
  longTrigger: number | null;
  shortTrigger: number | null;
}

export interface StratWatchlist {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: StratWatchlistItem[];
}
