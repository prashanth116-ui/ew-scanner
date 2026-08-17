/**
 * Scored ICT scanner — centralized configuration.
 *
 * Every threshold lives here. Never hardcode one in a detector or in scoring.
 * Defaults carry over from src/lib/ict/config.ts so the two engines stay
 * comparable while both exist.
 */

// ── Search Window ──

export const WINDOW = {
  /** Bars searched backward for ICT events. */
  EVENT_BARS: 30,
  /** Minimum series length required to assess at all. */
  MIN_BARS: 40,
};

// ── Detector Thresholds ──

export const SSL = {
  /** Bars of prior lows forming the liquidity pool. */
  LOOKBACK: 10,
  /** Close must exceed the swept level by this % for a clean reclaim. */
  CLEAN_RECLAIM_PCT: 0.15,
};

export const DISPLACEMENT = {
  /** Minimum body/range ratio to qualify as a displacement candle. */
  MIN_BODY_RATIO: 0.6,
  /** Prior candles the body and range must both exceed. */
  COMPARISON_BARS: 3,
  /** Body/priorMaxBody ratio scoring band. */
  EXPANSION_FLOOR: 1.0,
  EXPANSION_CEILING: 2.5,
  /** Close-location scoring band (fraction of range). */
  CLOSE_LOCATION_FLOOR: 0.5,
  CLOSE_LOCATION_CEILING: 0.95,
};

export const MSS = {
  /** Bars before the anchor forming the structure high. */
  LOOKBACK: 8,
  /** Margin above the structure high (%) for full credit. */
  FULL_CREDIT_MARGIN_PCT: 1.5,
};

export const FVG = {
  /** Gap size as % of price for full size credit. */
  FULL_CREDIT_GAP_PCT: 1.5,
  /** Retracement into the zone that scores best (fraction of zone height). */
  OPTIMAL_RETRACE_MIN: 0.4,
  OPTIMAL_RETRACE_MAX: 0.85,
  /** Split of FVG points between gap size and retracement behaviour. */
  SIZE_WEIGHT: 0.4,
  RETRACE_WEIGHT: 0.6,
};

export const REACCUMULATION = {
  /** Higher low this far above the protected low (%) earns full credit. */
  FULL_CREDIT_MARGIN_PCT: 3.0,
};

export const BSL = {
  /** Bars of prior highs forming the buy-side pool. */
  LOOKBACK: 8,
  /** Highs within this fraction of the pool high count as clustered. */
  CLUSTER_TOLERANCE: 0.004,
  /** Cluster count scoring band. A single high still scores — it is just weak. */
  COUNT_FLOOR: 1,
  COUNT_CEILING: 4,
};

export const COMPRESSION = {
  /** Bars in the current block, compared against an equal prior block. */
  BLOCK_BARS: 4,
  /** Distance below BSL (%) that still counts as coiled. */
  MAX_DISTANCE_PCT: 6.0,
  /** Distance below BSL (%) earning full proximity credit. */
  IDEAL_DISTANCE_PCT: 2.0,
  /** Weights inside the compression component. */
  CONTRACTION_WEIGHT: 0.4,
  HIGHER_LOW_WEIGHT: 0.3,
  PROXIMITY_WEIGHT: 0.3,
};

// ── Component Weights (must total 100) ──

export const WEIGHTS = {
  SSL: 15,
  DISPLACEMENT: 20,
  MSS: 15,
  FVG: 15,
  REACCUMULATION: 10,
  BSL: 10,
  COMPRESSION: 10,
  COHERENCE: 5,
};

// ── Penalties (subtracted from the component total) ──

export const PENALTIES = {
  /** A close broke the protected low — the structure failed. */
  INVALIDATED: 35,
  /** Price ran far above the FVG — the entry is late. */
  EXTENDED: 12,
  /** Consecutive expansion candles — chasing. */
  CHASING: 10,
};

export const RISK = {
  /** Consecutive bullish expansion candles that flag chasing. */
  CHASE_CANDLES: 3,
  /** Distance above the FVG midpoint (%) that flags an extended entry. */
  EXTENDED_ABOVE_FVG_PCT: 6.0,
};

// ── Grade Bands ──

export const GRADES = {
  /** Coiled under liquidity with the full structure behind it. */
  PRIME: 75,
  /** Structure is there, one or two ingredients light. */
  BUILDING: 55,
  /** Early — the reversal exists but little else. */
  FORMING: 35,

  /**
   * PRIME additionally requires real readiness: points from BSL + compression,
   * out of the 20 those two components carry between them.
   *
   * The score is never altered by this — only the label. A setup can carry
   * flawless sweep/displacement/MSS/FVG structure and still have no liquidity
   * target overhead and no coil, which scores in the 70s on structure alone.
   * That is a genuine BUILDING setup; calling it PRIME would promise a trigger
   * that does not exist yet.
   */
  PRIME_MIN_READINESS: 10,
};
