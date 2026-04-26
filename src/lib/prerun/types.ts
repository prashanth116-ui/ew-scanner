/** Pre-Run Scanner types */

export type PreRunVerdict = "PRIORITY" | "KEEP" | "WATCH" | "DISCARD";
export type PreRunRisk = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export interface PreRunStockData {
  ticker: string;
  companyName: string;
  currentPrice: number | null;
  high52w: number | null;
  low52w: number | null;
  pctFromAth: number | null;
  marketCap: number | null;
  shortFloat: number | null;
  nextEarningsDate: string | null;
  daysToEarnings: number | null;
  revenueGrowthYoY: number | null;
  analystCount: number | null;
  sma20: number | null;
  avgVolumeUpDays: number | null;
  avgVolumeDownDays: number | null;
  allTimeHigh: number | null;      // True ATH from 5y weekly data
  weeksInBase: number | null;      // Weeks since price was near ATH
  institutionalPct: number | null; // Institutional ownership % (0-100)
  // Phase 1: New data fields
  insiderBuys90d: number | null;           // H: Insider buy transactions in last 90d
  putCallRatio: number | null;             // I: Put/call OI ratio for near-term expiry
  relativeStrength20d: number | null;      // J: Stock 20d return minus sector ETF 20d return (pct pts)
  sectorReturn20d: number | null;          // J: Sector ETF 20d return (%)
  pctFromBaseHigh: number | null;          // K: % below 3mo high (base resistance)
  floatShares: number | null;              // F: Float shares for turnover calc
  floatTurnover20d: number | null;         // F: Cumulative 20d volume / float
  // Phase 2: Revenue + earnings enhancement
  quarterlyRevenue: { period: string; value: number }[] | null; // Last 4-8 quarters from SEC EDGAR
  earningsBeatStreak: number | null;       // Consecutive earnings beats (actual > estimate)
  lastUpdated: string;
}

export interface PreRunGates {
  gate1: boolean; // Not already run (40%+ below all-time high)
  gate2: boolean; // No existential risk (manual)
  gate3: boolean; // Base forming, not freefall
}

export interface PreRunScores {
  scoreA: number; // Dead money base (0-2)
  scoreB: number; // Short interest (0-3, expanded)
  scoreC: number; // Narrative catalyst (0-3, manual, expanded)
  scoreD: number; // Earnings inflection (0-2)
  scoreE: number; // Institutional under-ownership (0-2)
  scoreF: number; // Volume accumulation (0-2)
  scoreG: number; // Index inclusion potential (0-2, manual)
  scoreH: number; // Insider buying (0-2)
  scoreI: number; // Options flow / put-call skew (0-2)
  scoreJ: number; // Relative strength vs sector (0-2)
  scoreK: number; // Breakout proximity (0-2)
  sectorModifier: number; // +1/0/-1 based on sector momentum
  totalScore: number; // Sum of A-K + sector modifier (max 24 + modifier)
  finalScore: number; // 0 if any gate fails, else totalScore
}

/** Maximum possible raw score (before sector modifier). */
export const MAX_SCORE = 24;

export interface PreRunResult {
  data: PreRunStockData;
  gates: PreRunGates;
  scores: PreRunScores;
  verdict: PreRunVerdict;
  patternMatch: { template: string; similarity: number } | null;
}

export interface PreRunWatchlistItem {
  id: string;
  ticker: string;
  companyName: string;
  verdict: PreRunVerdict;
  riskLevel: PreRunRisk;
  stopLoss: number;
  thesis: string;
  catalystDescription: string;
  gate2Pass: boolean;
  scoreC: number;
  scoreG: number;
  notes: string;
  addedAt: string;
  updatedAt: string;
  // Joined data (from latest scan/cache)
  latestData?: PreRunStockData;
  latestScores?: PreRunScores;
  latestGates?: PreRunGates;
}

export interface PreRunScanResult {
  id: string;
  scanDate: string;
  ticker: string;
  companyName: string;
  currentPrice: number | null;
  pctFromAth: number | null;
  shortFloat: number | null;
  daysToEarnings: number | null;
  autoScore: number;
  verdict: PreRunVerdict;
  gate1Pass: boolean;
  gate3Pass: boolean;
  reasonFlagged: string;
  sectorBucket: string;
  actioned: boolean;
  addedToWatchlist: boolean;
}

export interface PreRunAlert {
  id: string;
  ticker: string;
  alertType: string;
  message: string;
  price: number | null;
  stopLoss: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface PreRunHistoryEntry {
  id: string;
  ticker: string;
  changeType: string;
  fromValue: string;
  toValue: string;
  notes: string;
  changedAt: string;
}

export interface SavedPreRunScan {
  id: string;
  name: string;
  savedAt: string;
  filters: PreRunFilters;
  candidateCount: number;
  candidates: PreRunResult[];
}

export interface PreRunFilters {
  minPctFromAth: number;
  minShortFloat: number;
  maxMarketCap: number; // 0 = no limit
  minScore: number;
  sectorBucket: string; // "All" or specific bucket name
  earningsWithin: number; // 0 = any, else days
  verdict: string; // "All" | "KEEP" | "WATCH" | "PRIORITY"
}

export const DEFAULT_PRERUN_FILTERS: PreRunFilters = {
  minPctFromAth: 40,
  minShortFloat: 8,
  maxMarketCap: 0,
  minScore: 11,
  sectorBucket: "All",
  earningsWithin: 0,
  verdict: "All",
};

export interface PreRunPreset {
  name: string;
  shortName: string;
  description: string;
  filters: Partial<PreRunFilters>;
  recommended?: boolean;
}

export const PRERUN_PRESETS: PreRunPreset[] = [
  {
    name: "SNDK Pattern",
    shortName: "SNDK",
    description: "Min 40% from ATH, min 15% SI, score ≥15. Classic multi-bagger setup.",
    filters: { minPctFromAth: 40, minShortFloat: 15, minScore: 15 },
    recommended: true,
  },
  {
    name: "Earnings <14d",
    shortName: "Earnings",
    description: "Shows only PRIORITY tier — stocks with earnings within 14 days.",
    filters: { earningsWithin: 14, minScore: 15, verdict: "PRIORITY" },
  },
  {
    name: "Sector Scan: Semis",
    shortName: "Semis",
    description: "Scans AI optical + power semi + advanced packaging buckets.",
    filters: { sectorBucket: "AI Optical/Connectivity Semis", minScore: 11 },
  },
  {
    name: "High SI",
    shortName: "High SI",
    description: "Min 20% short float, any ATH discount. Maximum squeeze fuel.",
    filters: { minShortFloat: 20, minPctFromAth: 0, minScore: 11 },
  },
  {
    name: "Wide Net",
    shortName: "Wide Net",
    description: "Relaxed filters, score ≥11. Good for initial screening.",
    filters: { minPctFromAth: 0, minShortFloat: 0, minScore: 11 },
  },
];
