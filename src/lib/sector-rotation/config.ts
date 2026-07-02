/**
 * Centralized threshold configuration for the sector rotation system.
 * All scoring breakpoints, regime thresholds, and quality gates in one place.
 */

// ── Regime Classification ──

export const REGIME = {
  /** VIX below this = RISK_ON (when not rising) */
  VIX_RISK_ON: 18,
  /** VIX above this = RISK_OFF */
  VIX_RISK_OFF: 25,
  /** VIX above this = high confidence RISK_OFF */
  VIX_EXTREME: 30,
  /** VIX below this = high confidence RISK_ON */
  VIX_LOW: 14,
  /** VIX change over 5d to classify as rising/falling */
  VIX_SLOPE_THRESHOLD: 2,
  /** Yield above this + DXY rising = INFLATIONARY */
  YIELD_INFLATIONARY: 4.5,
  /** Yield above this = high confidence INFLATIONARY */
  YIELD_EXTREME: 5,
  /** DXY change over 20d to classify as rising/falling */
  DXY_TREND_THRESHOLD: 1,
  /** Cross-asset acceleration threshold for regime enhancement */
  CROSS_ASSET_ACCEL: 2,
  /** Strong cross-asset acceleration for regime override */
  CROSS_ASSET_STRONG_ACCEL: 5,
  /** Cross-asset falling threshold for MIXED→RISK_ON upgrade */
  CROSS_ASSET_STRONG_FALLING: -3,
} as const;

// ── Composite Scoring ──

export const COMPOSITE = {
  /** Sector composite >= this = actionable tier */
  ACTIONABLE_THRESHOLD: 60,
  /** Weight redistribution base: momentum, accel, mansfield, cmf, breadth, smartMoney */
  BASE_WEIGHTS: {
    momentum: 25,
    acceleration: 15,
    mansfield: 20,
    cmf: 15,
    breadth: 15,
    smartMoney: 10,
  },
} as const;

// ── Rotation Detection ──

export const ROTATION = {
  /** Dispersion index above this = rotation active */
  DISPERSION_ACTIVE: 4,
  /** Moderate dispersion threshold (needs sector spread > 8% to confirm) */
  DISPERSION_MODERATE: 2,
  /** Sector spread above this + moderate dispersion = rotation active */
  SECTOR_SPREAD_THRESHOLD: 8,
  /** Signal count threshold to start/end rotation */
  SIGNAL_START: 2,
  /** Consecutive low-signal days to end rotation */
  SIGNAL_END_DAYS: 3,
  /** Lookback for "no prior signals" check */
  SIGNAL_LOOKBACK: 5,
  /** Volume surge multiplier */
  VOLUME_SURGE: 1.5,
  /** Minimum rotation days before considered real (not false start) */
  MIN_ROTATION_DAYS: 5,
} as const;

// ── Stock Quality Gates ──

export const QUALITY_GATES = {
  /** Minimum market cap ($) */
  MIN_MARKET_CAP: 2_000_000_000,
  /** Minimum average daily volume */
  MIN_AVG_VOLUME: 1_000_000,
  /** Maximum volume spike ratio */
  MAX_VOLUME_SPIKE: 5,
  /** Maximum % extension above 200d SMA */
  MAX_EXTENSION_PCT: 80,
  /** Minimum institutional ownership % */
  MIN_INSTITUTIONAL_PCT: 30,
  /** RS accel threshold for turnaround signal */
  TURNAROUND_RS_ACCEL: 0.5,
  /** Volume ratio for turnaround confirmation */
  TURNAROUND_VOL_RATIO: 1.0,
  /** Max deviation from ETF return (±%) */
  MAX_ETF_DEVIATION: 30,
} as const;

// ── Conviction Scoring ──

export const CONVICTION = {
  /** RS acceleration >= this = strong catch-up signal */
  STRONG_RS_ACCEL: 3.0,
  /** Volume ratio >= this = above-average volume signal */
  HIGH_VOL_RATIO: 1.2,
  /** Sector composite >= this = conviction signal */
  HIGH_COMPOSITE: 70,

  /** Weighted signal values (structural signals worth more than tactical) */
  SIGNAL_WEIGHTS: {
    /** Sector in IMPROVING/LEADING quadrant (structural) */
    sectorQuadrant: 1.5,
    /** Sector composite >= 70 (structural) */
    sectorComposite: 1.5,
    /** Stock is TURNAROUND/LEADER (structural) */
    stockCategory: 1.0,
    /** RS acceleration >= 3.0 (tactical) */
    rsAccel: 1.0,
    /** Sector has stealth accumulation (structural) */
    sectorStealth: 1.0,
    /** Volume ratio >= 1.2 (tactical) */
    volumeRatio: 0.5,
  },
  /** Weighted score >= this = HIGH */
  WEIGHTED_HIGH: 4.0,
  /** Weighted score >= this = MEDIUM */
  WEIGHTED_MEDIUM: 2.5,
} as const;

// ── Leadership Health ──

export const LEADERSHIP = {
  /** Score >= this = "Broad & Healthy" */
  BROAD_HEALTHY: 80,
  /** Score >= this = "Healthy" */
  HEALTHY: 65,
  /** Score >= this = "Narrowing" */
  NARROWING: 50,
  /** Score >= this = "Narrow" */
  NARROW: 35,
  /** MAGS-IWM spread > this = megaCapDominant */
  MEGA_CAP_SPREAD: 25,
  /** IWM composite must be within this of MAGS for broadening */
  BROADENING_GAP: 20,
} as const;

// ── Risk Flags ──

export const RISK_FLAGS = {
  /** Data quality below this % = flag */
  LOW_DATA_QUALITY: 50,
  /** Score delta must exceed this to be a "mover" */
  SCORE_MOVER_DELTA: 3,
  /** Dispersion change must exceed this to flag */
  DISPERSION_CHANGE: 2,
  /** Panic rotation: dispersion above this + RISK_OFF */
  PANIC_DISPERSION: 10,
  /** Cross-asset acceleration threshold for risk-off signal */
  CROSS_ASSET_RISK_OFF_ACCEL: 2,
  /** Rotation velocity threshold for rollover risk */
  HIGH_ROTATION_VELOCITY: 1.5,
  /** Acceleration threshold for rollover (negative) */
  ROLLOVER_ACCEL: -2,
  /** Leadership health score below this = risk flag */
  NARROW_LEADERSHIP: 50,
  /** Leadership health score below this = high severity flag */
  DETERIORATING_LEADERSHIP: 35,
} as const;

// ── Posture Thresholds ──

export const POSTURE = {
  /** Minimum HIGH/MODERATE conviction rotations for AGGRESSIVE */
  AGGRESSIVE_MIN_ROTATIONS: 2,
  /** Minimum dispersion for AGGRESSIVE */
  AGGRESSIVE_MIN_DISPERSION: 5,
  /** Minimum HIGH/MODERATE rotations for SELECTIVE */
  SELECTIVE_MIN_ROTATIONS: 1,
  /** Minimum LEADING/IMPROVING sectors for SELECTIVE (alternative) */
  SELECTIVE_MIN_SECTORS: 3,
} as const;

// ── Smart Money Composite ──

export const SMART_MONEY = {
  /** Points for any insider buying activity */
  INSIDER_ANY: 25,
  /** Bonus points for 3+ insider buys */
  INSIDER_HEAVY: 10,
  /** Put/call ratio below this = bullish options flow */
  BULLISH_PCR: 0.7,
  /** Points for bullish options flow */
  PCR_SCORE: 25,
  /** Points for unusual ETF volume */
  UNUSUAL_VOLUME: 20,
  /** Points for earnings beat majority */
  EARNINGS_BEAT: 20,
  /** Minimum earnings beat % to score */
  EARNINGS_BEAT_MIN_PCT: 50,
} as const;

// ── Top Stock Scoring ──

export const TOP_STOCK_WEIGHTS = {
  /** Weight for final pre-run score */
  FINAL_SCORE: 0.4,
  /** Weight for J-score (normalized to 12-pt scale) */
  SCORE_J: 0.2,
  /** Weight for K-score (normalized to 12-pt scale) */
  SCORE_K: 0.2,
  /** Score normalization multiplier for J/K */
  JK_MULTIPLIER: 12,
  /** Weight for insider buying signal */
  INSIDER: 0.1,
  /** Points awarded for insider buying */
  INSIDER_POINTS: 10,
  /** Weight for bullish options flow signal */
  PCR: 0.1,
  /** Points awarded for bullish PCR */
  PCR_POINTS: 10,
  /** RS percentile threshold for bonus */
  RS_PERCENTILE_THRESHOLD: 80,
  /** Bonus points for top RS percentile */
  RS_BONUS: 3,
} as const;

// ── Stock Classification ──

export const CLASSIFICATION = {
  /** Volume ratio >= this for LEADER classification */
  LEADER_VOL_RATIO: 1.0,
  /** RS accel >= this = "strong catch-up" description */
  RS_DESC_STRONG: 3.0,
  /** RS accel >= this = "moderate" description */
  RS_DESC_MODERATE: 0.5,
  /** RS accel >= this = "neutral" description (below = "decelerating") */
  RS_DESC_NEUTRAL: -0.5,
  /** Phase P2_TURNAROUND: pctFrom50ma lower bound */
  P2_PCT_LOW: -5,
  /** Phase P2_TURNAROUND: pctFrom50ma upper bound */
  P2_PCT_HIGH: 3,
  /** Phase P2_TURNAROUND: minimum RS accel */
  P2_RS_ACCEL: 0.5,
  /** Phase P2_TURNAROUND: minimum volume ratio */
  P2_VOL_RATIO: 1.2,
  /** Phase P3_TRENDING: pctFrom50ma lower bound */
  P3_PCT_LOW: 3,
  /** Phase P4_EXHAUSTING: RS accel threshold (negative) */
  P4_RS_ACCEL: -2.0,
  /** Phase P4_EXHAUSTING: sector accel threshold (negative) */
  P4_SECTOR_ACCEL: -3,
} as const;

// ── Extension Tiers ──

export const EXTENSION_TIERS = {
  /** % from 200d SMA for MODERATE_EXTENSION ceiling */
  MODERATE_CEILING: 100,
  /** % from 200d SMA for HIGH_EXTENSION ceiling (also must be ≤15% from 50d SMA) */
  HIGH_CEILING: 150,
  /** Max % from 50d SMA for HIGH tier */
  HIGH_MAX_FROM_50: 15,
} as const;
