/**
 * ICT Price Action Pre-Expansion Engine — Type Definitions.
 */

import type { Timeframe } from "./config";

// ── State Machine ──

/** Sequential states ordered from 0 (no setup) to 11 (ignition). */
export enum ICTState {
  NONE = 0,
  SSL_RAID = 1,
  STRUCTURE_HIGH = 2,
  BULLISH_DISPLACEMENT = 3,
  BULLISH_MSS = 4,
  FVG_CONFIRMED = 5,
  FVG_RETRACEMENT = 6,
  HIGHER_LOW = 7,
  BSL_BUILT = 8,
  ARMED = 9,
  TRIGGER = 10,
  IGNITION = 11,
}

/** String labels for display. */
export const ICT_STATE_LABELS: Record<ICTState, string> = {
  [ICTState.NONE]: "None",
  [ICTState.SSL_RAID]: "SSL",
  [ICTState.STRUCTURE_HIGH]: "Struct",
  [ICTState.BULLISH_DISPLACEMENT]: "Disp",
  [ICTState.BULLISH_MSS]: "MSS",
  [ICTState.FVG_CONFIRMED]: "FVG",
  [ICTState.FVG_RETRACEMENT]: "Retrace",
  [ICTState.HIGHER_LOW]: "HL",
  [ICTState.BSL_BUILT]: "BSL",
  [ICTState.ARMED]: "Armed",
  [ICTState.TRIGGER]: "Trigger",
  [ICTState.IGNITION]: "Ignition",
};

// ── Fair Value Gap ──

export interface FVGZone {
  lower: number;  // high[i-2] — bottom of gap
  upper: number;  // low[i]   — top of gap
  barIndex: number;
}

// ── SSL Raid Detail ──

export interface SSLRaidDetail {
  sweptPrice: number;
  raidBarIndex: number;
  raidBarLow: number;
  raidBarTimestamp: number;
}

// ── BSL Detail ──

export interface BSLDetail {
  level: number;
  clusterCount: number;
  barIndex: number;
}

// ── State Transition Event ──

export interface StateTransition {
  fromState: ICTState;
  toState: ICTState;
  barIndex: number;
  timestamp: number;
  price: number;
  evidence: string;
}

// ── CISD Result ──

export interface CISDResult {
  triggered: boolean;
  bearishOpen: number | null;
  bearishBarIndex: number | null;
}

// ── Engine Output (single timeframe) ──

export interface ICTSetup {
  currentState: ICTState;

  // Key levels
  protectedLow: number | null;
  mssLevel: number | null;
  fvgZone: FVGZone | null;
  bslLevel: number | null;
  bslClusterCount: number;

  // SSL detail
  sslRaid: SSLRaidDetail | null;

  // Retracement tracking
  retracementDepth: number | null;  // fraction of FVG penetrated

  // Higher low
  higherLowBar: number | null;

  // CISD
  cisd: CISDResult;

  // Distance to BSL (% of price)
  distanceToBslPct: number | null;

  // Invalidation tracking
  invalidated: boolean;
  invalidationReason: string | null;

  // Evidence
  transitions: StateTransition[];
  bullishEvidence: string[];
  cautionEvidence: string[];

  // Metadata
  barsProcessed: number;
  sslBarIndex: number | null;
}

// ── Score Components ──

export interface ICTScoreComponents {
  stateScore: number;
  displacementQuality: number;
  fvgQuality: number;
  retracementDepth: number;
  bslQuality: number;
  compressionQuality: number;
  structureCoherence: number;
  invalidationDistance: number;
}

export interface ICTScore {
  total: number;  // 0-100
  components: ICTScoreComponents;
  isChasing: boolean;
  isLateEntry: boolean;
}

// ── Multi-Timeframe Result ──

export interface ICTTimeframeResult {
  timeframe: Timeframe;
  setup: ICTSetup;
  score: ICTScore;
}

export interface ICTMultiTFResult {
  ticker: string;
  price: number;

  // Best timeframe
  bestTimeframe: Timeframe;
  bestState: ICTState;
  bestScore: number;
  bestSetup: ICTSetup;
  bestScoreDetail: ICTScore;

  // Per-timeframe results
  timeframes: ICTTimeframeResult[];

  // Confluence
  confluenceScore: number;
  armedTimeframes: Timeframe[];

  // Aggregated levels (from best TF)
  bslTarget: number | null;
  protectedLow: number | null;
  fvgUpper: number | null;
  fvgLower: number | null;
  distanceToBslPct: number | null;

  // Chase flags
  isChasing: boolean;
  isLateEntry: boolean;

  // Evidence (from best TF)
  bullishEvidence: string[];
  cautionEvidence: string[];
}

// ── Persistence Record ──

export interface ICTDailyRecord {
  scan_date: string;
  ticker: string;
  company_name: string;
  sector: string;
  price: number;
  best_state: string;
  best_state_order: number;
  best_timeframe: string;
  best_score: number;
  confluence_score: number;
  armed_timeframes: string[];
  bsl_target: number | null;
  protected_low: number | null;
  fvg_upper: number | null;
  fvg_lower: number | null;
  distance_to_bsl_pct: number | null;
  is_chasing: boolean;
  is_late_entry: boolean;
  state_4h: string | null;
  state_8h: string | null;
  state_12h: string | null;
  state_1d: string | null;
  state_1wk: string | null;
  score_4h: number | null;
  score_8h: number | null;
  score_12h: number | null;
  score_1d: number | null;
  score_1wk: number | null;
  state_score: number;
  displacement_quality: number;
  fvg_quality: number;
  retracement_depth: number;
  bsl_quality: number;
  compression_quality: number;
  structure_coherence: number;
  invalidation_distance: number;
  bullish_evidence: string[];
  caution_evidence: string[];
}
