/**
 * ICT Price Action Pre-Expansion Engine — Centralized Configuration.
 * All numeric thresholds live here. Never hardcode in scoring/engine logic.
 */

// ── State Machine Thresholds ──

export const SSL = {
  /** Lookback bars for prior swing low pool */
  LOOKBACK: 10,
};

export const MSS = {
  /** Lookback bars before raid candle for structure high */
  LOOKBACK: 8,
};

export const DISPLACEMENT = {
  /** Minimum body/range ratio for displacement candle */
  MIN_BODY_RATIO: 0.60,
  /** Number of prior candles to compare body/range against */
  COMPARISON_BARS: 3,
};

export const BSL = {
  /** Lookback bars for buy-side liquidity cluster */
  LOOKBACK: 8,
  /** Tolerance for clustering equal highs (as fraction of price) */
  CLUSTER_TOLERANCE: 0.004,
  /** Minimum clustered highs to confirm BSL */
  MIN_CLUSTER_COUNT: 2,
};

export const ARMED = {
  /** Max distance from BSL to qualify as armed (% of price) */
  MAX_DISTANCE_PCT: 3.0,
};

// ── Scoring Components (max points) ──

export const SCORING = {
  STATE_MAX: 30,
  DISPLACEMENT_QUALITY_MAX: 15,
  FVG_SIZE_QUALITY_MAX: 10,
  RETRACEMENT_DEPTH_MAX: 10,
  BSL_CLUSTER_QUALITY_MAX: 10,
  COMPRESSION_QUALITY_MAX: 10,
  STRUCTURE_COHERENCE_MAX: 10,
  INVALIDATION_DISTANCE_MAX: 5,

  /** Optimal retracement depth into FVG zone (fraction) */
  RETRACEMENT_OPTIMAL_MIN: 0.50,
  RETRACEMENT_OPTIMAL_MAX: 0.75,

  /** Max bars from SSL to current state for full coherence score */
  COHERENCE_IDEAL_BARS: 20,
  /** Beyond this many bars, coherence score is 0 */
  COHERENCE_MAX_BARS: 60,

  /** Minimum invalidation distance (%) for full score */
  INVALIDATION_SAFE_PCT: 5.0,
  /** Below this invalidation distance (%), score is 0 */
  INVALIDATION_DANGER_PCT: 0.5,
};

// ── Chase Risk / Extension Flags ──

export const CHASE = {
  /** Number of consecutive expansion candles to flag chasing */
  MAX_EXPANSION_CANDLES: 3,
  /** Distance from FVG zone (% of price) to flag late entry */
  LATE_ENTRY_FVG_DISTANCE_PCT: 5.0,
  /** Candles since TRIGGER state to flag late */
  LATE_ENTRY_CANDLES_SINCE_TRIGGER: 5,
};

// ── Multi-Timeframe ──

export const MULTI_TF = {
  /** Weight for best timeframe score in confluence */
  BEST_TF_WEIGHT: 0.60,
  /** Weight for average of other TF scores */
  OTHER_TF_WEIGHT: 0.40,
  /** Bonus per additional armed timeframe */
  ARMED_BONUS: 10,
  /** Minimum armed TFs before bonus kicks in */
  MIN_ARMED_FOR_BONUS: 1,
};

// ── Cron Settings ──

export const CRON = {
  BATCH_SIZE: 20,
  BATCH_DELAY: 500,
  PERSIST_INTERVAL: 50,
  /** Minimum state order to persist (BULLISH_DISPLACEMENT = 3) */
  MIN_STATE_ORDER: 3,
  /** Minimum score to persist */
  MIN_SCORE: 15,
  /** Minimum price for basic quality gate */
  MIN_PRICE: 10,
  /** Data retention in days */
  RETENTION_DAYS: 14,
  /** Time guard (ms) — leave 60s for final persist */
  TIME_GUARD_MS: 240_000,
};

// ── Timeframes ──

export const TIMEFRAMES = ["4h", "8h", "12h", "1d", "1wk"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
