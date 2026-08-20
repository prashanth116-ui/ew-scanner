/**
 * ICT Price Action Pre-Expansion Engine — Type Definitions.
 *
 * Bullish only. See config.ts "DIRECTIONAL SCOPE".
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

/** Ladder order, weakest first — used for ordering UI filter pills. */
export const ICT_STATE_ORDER: ICTState[] = [
  ICTState.SSL_RAID,
  ICTState.STRUCTURE_HIGH,
  ICTState.BULLISH_DISPLACEMENT,
  ICTState.BULLISH_MSS,
  ICTState.FVG_CONFIRMED,
  ICTState.FVG_RETRACEMENT,
  ICTState.HIGHER_LOW,
  ICTState.BSL_BUILT,
  ICTState.ARMED,
  ICTState.TRIGGER,
  ICTState.IGNITION,
];

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
  /** How many lows rested at the swept level — 2+ is a pool, not a single low. */
  poolCount: number;
}

// ── BSL Detail ──

export interface BSLDetail {
  level: number;
  clusterCount: number;
  barIndex: number;
  /** False when price has already cleared every pivot in the window. */
  unbroken: boolean;
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
  /** Open of the FIRST candle of the bearish delivery leg. */
  bearishOpen: number | null;
  /** Index of that first candle. */
  bearishBarIndex: number | null;
  /** Length of the contiguous bearish run being reversed. */
  runLength: number;
}

// ── Prior Invalidation ──

/**
 * A setup that broke before the one being reported. Kept as caution context;
 * the engine always reports the LIVE setup, never a dead high-water mark.
 */
export interface PriorInvalidation {
  state: ICTState;
  barsAgo: number;
  reason: string;
}

// ── Dealing Range ──

export interface DealingRange {
  low: number;
  high: number;
  equilibrium: number;
  /** Retracement of the low-to-high leg at the current close. 0 = at high, 1 = at low. */
  retracement: number;
  inDiscount: boolean;
  inOTE: boolean;
}

// ── Engine Output (single timeframe) ──

export interface ICTSetup {
  currentState: ICTState;

  // Key levels
  protectedLow: number | null;
  /** The raid-bar low, before any trailing. Kept for audit. */
  originalProtectedLow: number | null;
  protectedLowTrailed: boolean;
  mssLevel: number | null;
  fvgZone: FVGZone | null;
  bslLevel: number | null;
  bslClusterCount: number;
  bslUnbroken: boolean;

  // SSL detail
  sslRaid: SSLRaidDetail | null;

  // Retracement tracking
  retracementDepth: number | null;  // deepest fraction of FVG penetrated

  // Premium / discount
  dealingRange: DealingRange | null;
  /**
   * Deepest range-retracement reached at or after the MSS bar — the entry this
   * setup actually OFFERED, as distinct from where price happens to sit now.
   * Null before structure shifts.
   */
  entryRetracement: number | null;

  // Higher low
  higherLowBar: number | null;

  // CISD
  cisd: CISDResult;

  // Distance to BSL (% of price) — negative once cleared
  distanceToBslPct: number | null;

  // Invalidation tracking
  invalidated: boolean;
  invalidationReason: string | null;
  priorInvalidation: PriorInvalidation | null;

  // Freshness
  /** Bar at which currentState was reached. */
  stateBarIndex: number | null;
  /** Bars elapsed since currentState was reached (0 = this bar). */
  stateBarsAgo: number | null;
  stateTimestamp: number | null;

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
  entryQuality: number;
  bslQuality: number;
  compressionQuality: number;
  structureCoherence: number;
  invalidationDistance: number;
  recency: number;
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

/** Higher-timeframe (1d/1wk) structural bias for the setup direction. */
export type HTFBias = "ALIGNED" | "NEUTRAL" | "COUNTER";

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
  /** Families (intraday/swing) with an armed member — what the bonus counts. */
  armedFamilies: string[];

  // Higher-timeframe context
  htfBias: HTFBias;
  htfEvidence: string;

  // Aggregated levels (from best TF)
  bslTarget: number | null;
  protectedLow: number | null;
  fvgUpper: number | null;
  fvgLower: number | null;
  distanceToBslPct: number | null;
  /** (bslTarget - price) / (price - protectedLow). Null when undefined. */
  riskReward: number | null;

  // Premium / discount at the best TF
  rangeRetracement: number | null;
  inDiscount: boolean | null;
  inOTE: boolean | null;

  // Freshness
  stateBarsAgo: number | null;

  // Prior damage
  priorInvalidationState: string | null;
  priorInvalidationBarsAgo: number | null;
  priorInvalidationReason: string | null;

  // Chase flags
  isChasing: boolean;
  isLateEntry: boolean;

  /** Not invalidated, HTF not counter, and past the displacement stage. */
  isTradeable: boolean;

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
  risk_reward: number | null;
  htf_bias: string;
  range_retracement: number | null;
  in_discount: boolean | null;
  in_ote: boolean | null;
  state_bars_ago: number | null;
  is_tradeable: boolean;
  prior_invalidation_state: string | null;
  prior_invalidation_bars_ago: number | null;
  prior_invalidation_reason: string | null;
  is_chasing: boolean;
  is_late_entry: boolean;
  state_1h: string | null;
  state_4h: string | null;
  state_1d: string | null;
  state_1wk: string | null;
  score_1h: number | null;
  score_4h: number | null;
  score_1d: number | null;
  score_1wk: number | null;
  state_score: number;
  displacement_quality: number;
  fvg_quality: number;
  retracement_depth: number;
  entry_quality: number;
  bsl_quality: number;
  compression_quality: number;
  structure_coherence: number;
  invalidation_distance: number;
  recency_score: number;
  bullish_evidence: string[];
  caution_evidence: string[];
}
