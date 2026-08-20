/**
 * ICT Price Action Pre-Expansion Engine — Centralized Configuration.
 * All numeric thresholds live here. Never hardcode in scoring/engine logic.
 *
 * DIRECTIONAL SCOPE: this engine models the BULLISH half of the ICT framework
 * only — sell-side raid, bullish MSS, BISI, buy-side draw. There is no bearish
 * mirror. Every state, score and page label should be read as "long setup".
 */

// ── Sell-Side Liquidity ──

export const SSL = {
  /** Lookback bars for prior swing low pool */
  LOOKBACK: 10,
  /**
   * Tolerance for clustering equal lows (as fraction of price).
   * Matches BSL.CLUSTER_TOLERANCE — a raid and a draw are the same construct
   * pointing in opposite directions, so they are held to the same standard.
   */
  CLUSTER_TOLERANCE: 0.004,
  /**
   * Minimum lows resting at the swept level. 2 = "relatively equal lows",
   * the ICT definition of a pool. The extreme low counts as one of them, so
   * 2 means the extreme plus one other touch.
   */
  MIN_CLUSTER_COUNT: 2,
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

export const FVG = {
  /**
   * Minimum body/range ratio for the middle candle of a fair value gap.
   * An FVG matters because an energetic leg left it behind; a gap opened by
   * a doji is a data artefact, not a PD array.
   */
  MIN_LEG_BODY_RATIO: 0.50,
};

export const BSL = {
  /**
   * Lookback bars for the buy-side draw. Deliberately long: the target is a
   * liquidity objective price has to travel to, not the local high.
   */
  LOOKBACK: 40,
  /** Bars either side for pivot-high confirmation */
  PIVOT_BARS: 2,
  /** Tolerance for clustering equal highs (as fraction of price) */
  CLUSTER_TOLERANCE: 0.004,
  /** Minimum clustered highs to confirm BSL (the pivot counts as one) */
  MIN_CLUSTER_COUNT: 2,
};

export const ARMED = {
  /** Max distance from BSL to qualify as armed (% of price) */
  MAX_DISTANCE_PCT: 3.0,
};

// ── Dealing Range / Premium-Discount ──

export const RANGE = {
  /**
   * Optimal Trade Entry, expressed as retracement of the raid-low → range-high
   * leg. 0.62-0.79 is the ICT OTE band.
   */
  OTE_MIN: 0.62,
  OTE_MAX: 0.79,
  /** At or below equilibrium (0.50 retracement) price is in discount. */
  EQUILIBRIUM: 0.50,
};

// ── Scoring Components (max points) ──

export const SCORING = {
  /**
   * State contributes 12, not 30. Every other component is already gated on
   * reaching a state, so a tall state ladder paid twice for the same evidence
   * and made `score` a near-restatement of `state_order`.
   */
  STATE_MAX: 12,
  DISPLACEMENT_QUALITY_MAX: 14,
  FVG_SIZE_QUALITY_MAX: 10,
  RETRACEMENT_DEPTH_MAX: 8,
  /** Premium/discount + OTE location within the dealing range. */
  ENTRY_QUALITY_MAX: 14,
  BSL_CLUSTER_QUALITY_MAX: 10,
  COMPRESSION_QUALITY_MAX: 10,
  STRUCTURE_COHERENCE_MAX: 8,
  INVALIDATION_DISTANCE_MAX: 8,
  /** How recently the reported state was actually reached. */
  RECENCY_MAX: 6,

  /** Optimal retracement depth into FVG zone (fraction) */
  RETRACEMENT_OPTIMAL_MIN: 0.50,
  RETRACEMENT_OPTIMAL_MAX: 0.75,

  /**
   * Invalidation distance is a BAND, not a ramp. Precision is the ICT edge:
   * a stop 12% away is not "safer", it is a worse setup carrying more risk
   * for the same objective. Below MIN it is inside noise; above IDEAL_MAX the
   * score decays to zero at MAX.
   */
  INVALIDATION_MIN_PCT: 0.5,
  INVALIDATION_IDEAL_MIN: 1.5,
  INVALIDATION_IDEAL_MAX: 5.0,
  INVALIDATION_MAX_PCT: 12.0,
};

/**
 * Coherence and recency are measured in bars, so their budgets have to be
 * per-timeframe — 20 bars is three days of 4h and five months of weekly.
 */
export const BAR_BUDGETS: Record<string, { coherenceIdeal: number; coherenceMax: number; recencyFresh: number; recencyStale: number }> = {
  "1h": { coherenceIdeal: 40, coherenceMax: 160, recencyFresh: 8, recencyStale: 40 },
  "4h": { coherenceIdeal: 20, coherenceMax: 60, recencyFresh: 4, recencyStale: 20 },
  "1d": { coherenceIdeal: 15, coherenceMax: 45, recencyFresh: 3, recencyStale: 12 },
  "1wk": { coherenceIdeal: 8, coherenceMax: 26, recencyFresh: 2, recencyStale: 8 },
};

export const DEFAULT_BAR_BUDGET = { coherenceIdeal: 20, coherenceMax: 60, recencyFresh: 4, recencyStale: 20 };

// ── Chase Risk / Extension Flags ──

export const CHASE = {
  /** Number of consecutive expansion candles to flag chasing */
  MAX_EXPANSION_CANDLES: 3,
  /** Distance from FVG zone (% of price) to flag late entry */
  LATE_ENTRY_FVG_DISTANCE_PCT: 5.0,
  /** Candles since TRIGGER state to flag late */
  LATE_ENTRY_CANDLES_SINCE_TRIGGER: 5,
  /**
   * Flags arm from ARMED, not TRIGGER. A name that has already ripped five
   * bars into its draw is the definition of a chase whether or not CISD has
   * printed, and ARMED is where a trader is actually deciding.
   */
  MIN_STATE_FOR_FLAGS: 9,
};

// ── Multi-Timeframe ──

export const MULTI_TF = {
  /** Weight for best timeframe family score in confluence */
  BEST_TF_WEIGHT: 0.60,
  /** Weight for average of other timeframe families */
  OTHER_TF_WEIGHT: 0.40,
  /** Bonus per additional armed FAMILY (not per timeframe) */
  ARMED_BONUS: 10,
  /** Minimum armed families before bonus kicks in */
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

/**
 * 1h and 4h share a source chart; 1d and 1wk are native and independent.
 * They are grouped into families so the confluence blend cannot count one
 * chart twice — see TF_FAMILY.
 *
 * 8h and 12h were removed. A US equity RTH session is 6.5 hours, so neither
 * candle can be formed without merging bars across days, which is what the
 * old index-based aggregation silently did.
 */
export const TIMEFRAMES = ["1h", "4h", "1d", "1wk"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export type TFFamily = "intraday" | "swing";

export const TF_FAMILY: Record<Timeframe, TFFamily> = {
  "1h": "intraday",
  "4h": "intraday",
  "1d": "swing",
  "1wk": "swing",
};

/** Timeframes whose structure defines higher-timeframe bias. */
export const HTF_TIMEFRAMES: Timeframe[] = ["1d", "1wk"];
