/**
 * Catalyst Scanner shared types.
 * Used by scoring, data, scan, API, and dashboard.
 */

import type { CatalystLayer } from "@/data/catalyst-universe";

// ── Scoring ──

export interface CatalystScores {
  daysToCatalyst: number;        // 0-12
  meanReversion: number;         // 0-8
  momentumBreakout: number;      // 0-7
  shortInterest: number;         // 0-10
  analystUpside: number;         // 0-8
  volumeRatio: number;           // 0-10
  rsiPosition: number;           // 0-8
  peerSpiked: number;            // 0-8
  sectorEtfMomentum: number;     // 0-7
  earningsSurprise: number;      // 0-8  (was revenueAcceleration stub)
  maPosition: number;            // 0-5
  optionsSkew: number;           // 0-4  (was ivRank stub)
  trendAcceleration: number;     // 0-5  (was newsCluster stub)
  relativeStrength: number;      // 0-5
  insiderBuying: number;         // 0-5
  institutionalOwnership: number;// 0-4
  darkPoolActivity: number;      // 0-4
}

/** Max achievable score accounting for mutual exclusivity:
 *  mean reversion (8) vs momentum breakout (7) ~-7, trend accel vs MR ~-3.
 *  Raw max = 118, practical ceiling ~100. */
export const MAX_SCORE = 118;
export const MAX_ACHIEVABLE_SCORE = 100;

// ── Verdicts ──

export type CatalystVerdict = "PRE_SPIKE" | "WATCH" | "MONITOR" | "MISS";

export type MissCategory =
  | "already_moved"
  | "wrong_sector"
  | "wrong_pattern"
  | "too_early"
  | "post_spike";

// ── Result ──

export interface CatalystResult {
  symbol: string;
  name: string;
  layer: CatalystLayer;
  layerLabel: string;
  tier: number;
  price: number;
  ytdChange: number;
  change5d: number;
  change1d: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  shortPercentFloat: number;
  analystTarget: number;
  volumeRatio5d20d: number;
  rsi14: number;
  sma50: number;
  sma200: number;
  scores: CatalystScores;
  totalScore: number;
  verdict: CatalystVerdict;
  missCategory?: MissCategory;
  missReason?: string;
  peersThatSpiked?: string[];
  nextCatalyst?: string;
  nextCatalystDays?: number;
  fireDrill?: boolean;
}

// ── Calendar ──

export type CatalystEventType =
  | "earnings"
  | "fomc"
  | "opex"
  | "russell"
  | "sp_rebalance"
  | "cpi"
  | "jobs";

export interface CatalystCalendarEvent {
  date: string; // YYYY-MM-DD
  type: CatalystEventType;
  label: string;
  symbol?: string; // only for earnings
  daysAway: number;
}

// ── Scan Response ──

export interface CatalystScanResponse {
  prespike: CatalystResult[];
  watch: CatalystResult[];
  monitor: CatalystResult[];
  misses: {
    already_moved: CatalystResult[];
    wrong_sector: CatalystResult[];
    wrong_pattern: CatalystResult[];
    too_early: CatalystResult[];
    post_spike: CatalystResult[];
  };
  calendar: CatalystCalendarEvent[];
  scannedAt: string;
}

// ── Raw Data (from Yahoo Finance) ──

export interface CatalystRawData {
  symbol: string;
  price: number;
  ytdChange: number;
  change5d: number;
  change1d: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  shortPercentFloat: number;
  analystTarget: number;
  volume5dAvg: number;
  volume20dAvg: number;
  closes: number[];      // daily closes (for RSI)
  volumes: number[];     // daily volumes (for dark pool proxy)
  sma50: number;
  sma200: number;
  earningsSurprises: number[];  // last 4 quarters surprise % (newest first)
  putCallRatio: number | null;
  callVolume: number | null;   // total call contracts traded (nearest expiry)
  putVolume: number | null;    // total put contracts traded (nearest expiry)
  insiderNetBuys: { purchases: number; sales: number };
  institutionalPercent: number; // 0-1 fraction
}

// ── ETF Data ──

export interface ETFPriceData {
  symbol: string;
  closes: number[];      // last 20 daily closes
  high20d: number;
  currentPrice: number;
}
