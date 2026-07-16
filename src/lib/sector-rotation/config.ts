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
  /** Adaptive VIX low bound: minimum for 25th percentile clamp */
  VIX_ADAPTIVE_LOW_MIN: 12,
  /** Adaptive VIX low bound: maximum for 25th percentile clamp */
  VIX_ADAPTIVE_LOW_MAX: 22,
  /** Adaptive VIX high bound: minimum for 75th percentile clamp */
  VIX_ADAPTIVE_HIGH_MIN: 20,
  /** Adaptive VIX high bound: maximum for 75th percentile clamp */
  VIX_ADAPTIVE_HIGH_MAX: 35,
  /** Extreme VIX multiplier below adaptive low (confidence boost) */
  VIX_EXTREME_LOW_MULT: 0.8,
  /** Extreme VIX multiplier above adaptive high (confidence boost) */
  VIX_EXTREME_HIGH_MULT: 1.2,
  /** Regime alignment score bonus for favored sectors */
  ALIGNED_BONUS: 5,
  /** Regime alignment penalty for avoid sectors */
  MISALIGNED_PENALTY: -3,
  /** Confidence boost for extreme VIX/yield */
  CONFIDENCE_BOOST_LARGE: 15,
  /** Confidence boost for moderate confirming signals */
  CONFIDENCE_BOOST_SMALL: 10,
  /** VIX change over 5d to classify as rising/falling */
  VIX_SLOPE_THRESHOLD: 2,
  /** Yield above this + DXY rising = INFLATIONARY */
  YIELD_INFLATIONARY: 4.5,
  /** Yield above this = high confidence INFLATIONARY */
  YIELD_EXTREME: 5,
  /** DXY absolute point change over 20d to classify as rising/falling (not percentage — DXY trades ~90-110) */
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
  /** Hysteresis buffer: sectors with positive acceleration get this buffer on the actionable threshold */
  ACTIONABLE_HYSTERESIS: 2,
  /** Sector composite >= this = watch tier */
  WATCH_THRESHOLD: 40,
  /** Weight redistribution base: momentum, accel, mansfield, cmf, breadth, smartMoney */
  BASE_WEIGHTS: {
    momentum: 25,
    acceleration: 15,
    mansfield: 20,
    cmf: 15,
    breadth: 15,
    smartMoney: 10,
  },
  /** Fixed floor for acceleration normalization (replaces min-max) */
  ACCEL_NORM_FLOOR: -10,
  /** Fixed ceiling for acceleration normalization (replaces min-max) */
  ACCEL_NORM_CEILING: 10,
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
  /** RS SMA short period for rotation tracker golden cross */
  RS_SMA_SHORT: 10,
  /** RS SMA long period for rotation tracker golden cross */
  RS_SMA_LONG: 30,
  /** Minimum aligned bars required for rotation signal computation */
  MIN_ALIGNED_BARS: 50,
  /** Batch size for stock chart fetches in rotation tracker */
  TRACKER_BATCH_SIZE: 15,
  /** Delay (ms) between stock chart fetch batches in rotation tracker */
  TRACKER_BATCH_DELAY: 200,
} as const;

// ── Stock Quality Gates ──

export const QUALITY_GATES = {
  /** Minimum stock price ($) */
  MIN_PRICE: 15,
  /** Maximum stock price ($) — excludes ultra-high-price stocks (except Semiconductors) */
  MAX_PRICE: 1000,
  /** Minimum market cap ($) */
  MIN_MARKET_CAP: 8_000_000_000,
  /** Minimum average daily dollar volume ($) */
  MIN_DOLLAR_VOLUME: 150_000_000,
  /** Minimum average daily volume */
  MIN_AVG_VOLUME: 1_000_000,
  /** Maximum volume spike ratio */
  MAX_VOLUME_SPIKE: 5,
  /** Maximum % extension above 200d SMA */
  MAX_EXTENSION_PCT: 80,
  /** Minimum institutional ownership % (low threshold: ADRs report artificially low via Yahoo) */
  MIN_INSTITUTIONAL_PCT: 5,
  /** RS accel threshold for turnaround signal */
  TURNAROUND_RS_ACCEL: 0.5,
  /** Volume ratio for turnaround confirmation */
  TURNAROUND_VOL_RATIO: 1.0,
  /** Max deviation from ETF return (±%) */
  MAX_ETF_DEVIATION: 30,
  /** Reject stocks with null market cap (aligns with PreRun treating null as 0) */
  REJECT_NULL_MARKET_CAP: true,
  /** Apply SCAN_EXCLUSIONS to sector rotation stock enrichment + rotation tracker */
  APPLY_SCAN_EXCLUSIONS: true,
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
  /** Volume ratio floor for stealth conviction credit */
  STEALTH_VOL_FLOOR: 0.8,
  /** Phase penalty: subtracted from weighted score when P4_EXHAUSTING */
  PHASE_P4_PENALTY: 1.5,
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
  /** Hysteresis buffer for posture narrow-leadership gate (score must drop below NARROW_LEADERSHIP - buffer to trigger) */
  NARROW_LEADERSHIP_BUFFER: 3,
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
  /** Final score >= this = "High score" reason */
  HIGH_SCORE_THRESHOLD: 19,
  /** pctFromBaseHigh < this = "Near breakout" reason */
  NEAR_BREAKOUT_PCT: 10,
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
  /** Phase P3_TRENDING: minimum volume ratio (weak-volume stocks shouldn't be P3) */
  P3_MIN_VOL_RATIO: 0.7,
  /** Phase P4_EXHAUSTING: RS accel threshold (negative) */
  P4_RS_ACCEL: -2.0,
  /** Phase P4_EXHAUSTING: sector accel threshold (negative) */
  P4_SECTOR_ACCEL: -3,
} as const;

// ── Sector Scoring Signals ──

export const SCORING_SIGNALS = {
  /** CMF positive count >= this out of 20 bars = flow/price divergence */
  FLOW_DIVERGENCE_MIN_POSITIVE: 15,
  /** ROC must be below this (negative) for flow/price divergence — filters near-zero noise */
  FLOW_DIVERGENCE_ROC_THRESHOLD: -1,
  /** Breadth % > this + declining ETF = breadth divergence */
  BREADTH_DIVERGENCE_PCT: 50,
  /** ROC20d < this + positive accel = acceleration inflection (flat-to-negative) */
  ACCEL_INFLECTION_ROC_MAX: 0,
  /** Minimum leading indicators for stealth accumulation */
  STEALTH_MIN_SIGNALS: 2,
  /** Trend classification breakpoints: strong up */
  TREND_STRONG_UP: 3,
  /** Trend classification: mild up */
  TREND_MILD_UP: 1,
  /** Trend classification: mild down (below this = strong down) */
  TREND_MILD_DOWN: -1,
  /** Trend classification: strong down */
  TREND_STRONG_DOWN: -3,
  /** Pair analysis: ratio change > this = Risk-On */
  PAIR_RISK_ON: 1,
  /** Pair analysis: ratio change < this = Risk-Off */
  PAIR_RISK_OFF: -1,
  /** Momentum composite weights (graduated: less short-term whipsaw, more medium-term stability) */
  MOMENTUM_WEIGHTS: { roc63: 0.35, roc126: 0.25, roc189: 0.25, roc252: 0.15 },
  /** Sigmoid exponent for ETF breadth proxy */
  SIGMOID_EXPONENT: 0.4,
  /** OBV normalized slope threshold for accumulation/distribution */
  OBV_SLOPE_THRESHOLD: 0.01,
  /** RRG quadrant dead zone: when both axes are within ±this of 100, use momentum as tiebreaker */
  RRG_DEAD_ZONE: 0.5,
} as const;

// ── Rotation Lifecycle ──

export const ROTATION_LIFECYCLE = {
  /** Days active > this = EXHAUSTING (hard cutoff) */
  EXHAUSTING_DAYS: 30,
  /** Days active > this = soft EXHAUSTING zone (only if health confirms) */
  EXHAUSTING_SOFT_DAYS: 25,
  /** Days active <= this = EARLY */
  EARLY_MAX_DAYS: 5,
  /** Days active <= this = MATURING (above = LATE) */
  MATURING_MAX_DAYS: 15,
  /** Days to look back for "recently ended" rotations */
  RECENTLY_ENDED_DAYS: 14,
} as const;

// ── Rotation Conviction ──

export const ROTATION_CONVICTION = {
  /** Score >= this = HIGH conviction */
  HIGH: 6,
  /** Score >= this = MODERATE conviction */
  MODERATE: 3,
  /** Score >= this = LOW conviction (below = EXIT) */
  LOW: 0,
  /** Acceleration > this = strong acceleration (2 pts) */
  STRONG_ACCEL: 1,
  /** CMF > this = strong inflow (2 pts) */
  STRONG_CMF: 0.1,
  /** Turnaround candidate: volume vs avg threshold (rotation tracker) */
  TURNAROUND_VOL: 0.8,
} as const;

// ── Sub-Sector Divergence ──

export const SUB_SECTOR = {
  /** Score delta > this = sub-sector leading/lagging signal */
  DIVERGENCE_THRESHOLD: 10,
} as const;

// ── Crypto Quality Gates ──

export const CRYPTO_QUALITY_GATES = {
  /** Minimum market cap ($) */
  MIN_MARKET_CAP: 50_000_000,
  /** Minimum dollar volume ($) */
  MIN_DOLLAR_VOLUME: 500_000,
  /** Maximum volume spike ratio */
  MAX_VOLUME_SPIKE: 10.0,
  /** Maximum % extension above 200-SMA */
  MAX_EXTENSION_PCT: 150,
  /** Minimum volume-to-market-cap ratio (liquidity depth) */
  MIN_VOL_TO_MCAP: 0.001,
  /** Extreme decline threshold (% below 200-SMA) */
  EXTREME_DECLINE_PCT: -50,
  /** Conviction signals >= this = HIGH in regime reclassification */
  CONVICTION_HIGH_SIGNALS: 4,
  /** Conviction signals >= this = MEDIUM in regime reclassification */
  CONVICTION_MEDIUM_SIGNALS: 2,
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

// ── Pre-Runner Radar ──

export const PRERUNNER = {
  /** RS accel cap for normalization (above = full marks) */
  RS_ACCEL_MAX: 6,
  /** Volume ratio cap for normalization */
  VOL_RATIO_MAX: 2.0,
  /** Volume ratio floor for normalization */
  VOL_RATIO_FLOOR: 0.8,
  /** Bonus when RS direction is improving */
  RS_IMPROVING_BONUS: 5,
  /** Minimum composite score to qualify */
  MIN_SCORE: 55,
  /** Max candidates in UI panel */
  MAX_UI_CANDIDATES: 20,
  /** Max in Telegram alert */
  MAX_TELEGRAM_CANDIDATES: 5,

  /** Leader scoring weights (sum = 100) */
  LEADER_RS_WEIGHT: 30,
  LEADER_SECTOR_WEIGHT: 25,
  LEADER_VOLUME_WEIGHT: 15,
  LEADER_CONVICTION_WEIGHT: 15,
  LEADER_REGIME_WEIGHT: 5,
  LEADER_MOMENTUM_WEIGHT: 10,

  /** Turnaround scoring weights (sum = 100) */
  TURNAROUND_RS_WEIGHT: 35,
  TURNAROUND_LIFECYCLE_WEIGHT: 20,
  TURNAROUND_VOLUME_WEIGHT: 15,
  TURNAROUND_SECTOR_WEIGHT: 15,
  TURNAROUND_REGIME_WEIGHT: 5,
  TURNAROUND_MOMENTUM_WEIGHT: 10,

  /** Blend factor for sector composite vs quadrant (0 = pure quadrant, 1 = pure composite) */
  SECTOR_COMPOSITE_BLEND: 0.5,

  /** Outperformance bonus: cap and scale for ret20d > 0 */
  OUTPERFORMANCE_BONUS_CAP: 5,
  OUTPERFORMANCE_SCALE: 10,

  /** Turnaround conviction: RS accel blend factor (vs lifecycle score) */
  TURNAROUND_CONVICTION_RS_BLEND: 0.4,
  /** Turnaround conviction breakpoints */
  TURNAROUND_CONVICTION_HIGH: 0.7,
  TURNAROUND_CONVICTION_MEDIUM: 0.4,

  /** Momentum normalization range: ret% mapped to [0,1] */
  MOMENTUM_RANGE_MIN: -10,
  MOMENTUM_RANGE_MAX: 10,

  /** Quadrant score mapping (used for sector health component) */
  QUADRANT_SCORES: { LEADING: 25, IMPROVING: 20, WEAKENING: 8, LAGGING: 0 } as Record<string, number>,

  /** Lifecycle score mapping (used for turnaround lifecycle component) */
  LIFECYCLE_SCORES: { EARLY: 20, MATURING: 15, LATE: 5, EXHAUSTING: 0 } as Record<string, number>,
} as const;

// ── Crypto Rotation Weights ──

export const CRYPTO_WEIGHTS = {
  MOMENTUM: 30,
  ACCELERATION: 20,
  MANSFIELD: 25,
  CMF: 25,
} as const;

// ── Crypto Regime Classification ──

export const CRYPTO_REGIME_THRESHOLDS = {
  /** BTC realized vol below this = low volatility (favors RISK_ON) */
  BTC_VOL_LOW: 60,
  /** BTC realized vol above this = high volatility (favors RISK_OFF) */
  BTC_VOL_HIGH: 80,
  /** BTC dominance delta above this = "rising" */
  DOMINANCE_DELTA_RISING: 2,
  /** BTC dominance delta below this = "falling" */
  DOMINANCE_DELTA_FALLING: -2,
  /** Market trend median threshold (rising/falling) */
  MARKET_TREND_THRESHOLD: 3,
  /** RISK_ON confidence: BTC vol below this = strong signal */
  CONFIDENCE_VOL_STRONG: 50,
  /** RISK_ON confidence: total market momentum above this = signal */
  CONFIDENCE_MOMENTUM_POSITIVE: 5,
  /** RISK_OFF confidence: BTC vol above this = strong signal */
  CONFIDENCE_VOL_EXTREME: 90,
  /** RISK_OFF confidence: total market momentum below this = signal */
  CONFIDENCE_MOMENTUM_NEGATIVE: -5,
  /** Alt-season dispersion threshold */
  ALT_SEASON_DISPERSION: 8,
} as const;

// ── Crypto Brief Thresholds ──

export const CRYPTO_BRIEF = {
  /** BTC vol above this triggers risk flags and posture downgrades */
  BTC_VOL_SPIKE: 80,
  /** Dispersion above this = eligible for AGGRESSIVE posture */
  AGGRESSIVE_DISPERSION: 5,
  /** Composite score >= this for actionable crypto sector classification */
  ACTIONABLE_COMPOSITE: 55,
  /** Dispersion above this = panic rotation flag when RISK_OFF */
  PANIC_DISPERSION: 10,
  /** Bias score: dispersion above this = bullish signal */
  BIAS_DISPERSION_HIGH: 6,
  /** Bias score: dispersion below this = bearish signal */
  BIAS_DISPERSION_LOW: 2,
  /** Regime confidence below this numeric value = cap posture at SELECTIVE */
  LOW_CONFIDENCE_THRESHOLD: 50,
  /** BTC % from 50MA above/below this = bullish/bearish bias signal */
  BTC_RETURN_THRESHOLD: 5,
  /** Sector leading/lagging count difference above this = bias signal */
  SECTOR_BALANCE_THRESHOLD: 2,
} as const;

// ── Sector Comparison ──

export const COMPARISON = {
  /** Score delta > this = sector improved/declined in comparison view */
  CHANGE_THRESHOLD: 2,
} as const;

// ── Pre-Market Bias Scoring ──

export const PREMARKET_SCORING = {
  /** Posture points */
  POSTURE_AGGRESSIVE: 3,
  POSTURE_SELECTIVE: 1,
  POSTURE_DEFENSIVE: -2,
  POSTURE_CASH: -4,
  /** Regime points */
  REGIME_RISK_ON: 2,
  REGIME_RISK_OFF: -2,
  REGIME_INFLATIONARY: -1,
  REGIME_MIXED: 0,
  /** Default VIX bounds when regime data is unavailable */
  DEFAULT_VIX_BOUNDS: { low: 17, high: 20 },
  /** Bias label thresholds */
  STRONG_BULL: 6,
  LEAN_BULL: 2,
  NEUTRAL: -1,
  LEAN_BEAR: -5,
} as const;

// ── Policy Pulse Classification ──

export const POLICY_PULSE = {
  /** Source authority scores (out of 25) */
  SOURCE_WHITEHOUSE_RSS: 25,
  SOURCE_FED_REGISTER: 23,
  SOURCE_HIGH_AUTHORITY: 20,
  SOURCE_DEFAULT: 10,
  /** Impact score component max weights */
  WEIGHT_SOURCE: 25,
  WEIGHT_DENSITY: 25,
  WEIGHT_STRONG_KEYWORD: 15,
  WEIGHT_HEADLINE: 15,
  WEIGHT_MULTI_KEYWORD: 20,
  /** Minimum impact score to persist */
  MIN_PERSIST_SCORE: 40,
} as const;
