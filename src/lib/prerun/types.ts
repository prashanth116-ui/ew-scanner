/** Pre-Run Scanner types */

export type PreRunVerdict = "PRIORITY" | "KEEP" | "WATCH" | "DISCARD";
export type PreRunRisk = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type EmaTimeframe = "15m" | "1h" | "4h" | "12h" | "1d" | "1wk" | "1mo";

export type VCPViewMode = "standard" | "vcp" | "institutional" | "inflection";
export type VCPPhase = "FOCUS_LIST" | "WATCHLIST_CANDIDATE" | "EARLY_SETUP" | "IGNORE";

export const ALL_EMA_TIMEFRAMES: readonly EmaTimeframe[] = ["15m", "1h", "4h", "12h", "1d", "1wk", "1mo"] as const;

export interface M2TimeframeResult {
  scoreM2: number;
  trendStrength: "strong" | "moderate" | "weak" | "bearish" | null;
  bullishCross: boolean | null;
  priceAboveBoth: boolean | null;
  dataPoints: number | null;
  displacementNearCross: boolean | null;
  fvgNearCross: boolean | null;
  // Leading indicators
  volumeRatio: number | null;       // last bar vol / 20-bar avg vol
  converging: boolean | null;       // EMA spread narrowing toward cross
  spreadDelta: number | null;       // rate of change in EMA spread (tooltip detail)
  squeezed: boolean | null;         // ATR(5) < ATR(20) = volatility compression
  atrRatio: number | null;          // ATR(5) / ATR(20) for graduated display
}

export interface MultiTFM2Result {
  ticker: string;
  timeframes: Partial<Record<EmaTimeframe, M2TimeframeResult | null>>;
}

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
  callVolume: number | null;              // Total call contracts traded (nearest expiry)
  putVolume: number | null;               // Total put contracts traded (nearest expiry)
  relativeStrength20d: number | null;      // J: Stock 20d return minus sector ETF 20d return (pct pts)
  sectorReturn20d: number | null;          // J: Sector ETF 20d return (%)
  pctFromBaseHigh: number | null;          // K: % below 3mo high (base resistance)
  floatShares: number | null;              // F: Float shares for turnover calc
  floatTurnover20d: number | null;         // F: Cumulative 20d volume / float
  // F (leading): OBV-price divergence + volume-price divergence
  obvDivergent: boolean | null;              // OBV near 20-bar high while price is not (stealth accumulation)
  obvPctFromHigh: number | null;             // How far OBV is from its 20-bar high (%)
  pricePctFromHigh20d: number | null;        // How far price is from its 20-bar high (%)
  vpDivergenceBullish: boolean | null;      // Price lower-low + volume-on-downs decreasing
  // F (leading): Distribution day count
  distributionDays20d: number | null;        // Count of down-price + high-volume days in last 20 bars
  // H: Insider buying short window
  insiderBuys45d: number | null;             // Insider buy transactions in last 45d (cluster detection)
  // Data quality
  dataQuality: number | null;                // 0-100: percentage of API calls that succeeded
  // Phase 2: Revenue + earnings enhancement
  quarterlyRevenue: { period: string; value: number }[] | null; // Last 4-8 quarters from SEC EDGAR
  earningsBeatStreak: number | null;       // Consecutive earnings beats (actual > estimate)
  // Phase 3: Stage 1→2 criteria (L, M, N, O)
  higherLowsCount: number | null;          // L: How many of last 3 swing lows are higher (0-3)
  aboveEma21: boolean | null;              // M: Is price currently above 21 EMA
  aboveEma50: boolean | null;              // M: Is price currently above 50 EMA
  emaCrossoverWithin20d: boolean | null;   // M: Did price cross above both EMAs within last 20 trading days
  // M2: EMA 10/20 timing signal (multi-timeframe)
  emaM2Ema10: number | null;               // M2: Current EMA-10 value
  emaM2Ema20: number | null;               // M2: Current EMA-20 value
  emaM2BullishCross: boolean | null;       // M2: EMA-10 > EMA-20 (bullish alignment)
  emaM2CrossedWithin5Bars: boolean | null; // M2: Crossover occurred within last 5 bars
  emaM2PriceAboveBoth: boolean | null;     // M2: Current price above both EMAs
  emaM2SpreadPct: number | null;           // M2: (EMA10 - EMA20) / price × 100
  emaM2TrendStrength: "strong" | "moderate" | "weak" | "bearish" | null; // M2: trend classification
  emaM2BarsSinceCross: number | null;      // M2: how many bars since last cross
  emaM2DataPoints: number | null;          // M2: number of bars available
  emaM2DisplacementNearCross: boolean | null; // M2: displacement candle near EMA cross
  emaM2FvgNearCross: boolean | null;          // M2: bullish FVG near EMA cross
  emaM2Timeframe: EmaTimeframe | null;     // M2: which timeframe was used
  closesNearRangeTop: boolean | null;      // N: Are last 5 closes in upper 25% of 13-week range
  atrContracting: boolean | null;          // N: Is 5-day ATR < 20-day ATR
  failedBreakdownRecovery: number | null;  // O: 0=none, 1=wick test only, 2=broke below + recovered in 3 bars
  analystRevisionTrend: number | null;     // P: Analyst estimate revision direction (-1/0/+1)
  // VCP Breakout Scanner fields
  vcpSma50: number | null;
  vcpSma200: number | null;
  vcpSma10: number | null;
  vcpAvgVolume50d: number | null;
  vcpAvgVolume10d: number | null;
  vcpAvgDollarVolume: number | null;
  vcpDistFromSma50Pct: number | null;
  vcpDistFromSma200Pct: number | null;
  vcpAtrPct: number | null;
  maxAtrPct60d: number | null;         // Max ATR(14)% over last ~60 trading days (quality gate)
  vcpRange5d: number | null;
  vcpRange10d: number | null;
  vcpRange20d: number | null;
  vcpTightCloses: boolean | null;
  vcpInsideBarCount: number | null;
  vcpDryVolumeDays: number | null;
  vcpPivotHigh: number | null;
  vcpRelStrengthVsSPY: number | null;
  vcpAtrMultipleAbove50: number | null;
  // Institutional Acceleration fields
  instRsVsQQQ: number | null;            // Stock 20d ret - QQQ 20d ret
  instRsAccelVsSPY: number | null;        // 5-session change in RS vs SPY
  instRsAccelVsQQQ: number | null;        // 5-session change in RS vs QQQ
  instRsAccelTrend: number | null;        // Slope of RS accel over last 3 sessions (positive = improving)
  instBeta: number | null;                // From Yahoo summaryDetail
  instGapPct: number | null;              // (today open - prev close) / prev close * 100
  instDistFromEma20Atr: number | null;    // (price - EMA20) / ATR(14)
  instAtrDollar: number | null;           // ATR(14) in dollar terms
  // Inflection Engine fields
  rsi14: number | null;                   // Standard Wilder RSI(14)
  avgDownDayBody: number | null;          // Avg body % on down days (last 10 bars)
  avgDownDayBodyPrev: number | null;      // Avg body % on down days (bars 11-20, comparison)
  accumulationDayCount: number | null;    // Up days with above-avg volume (last 20)
  atrRatio5v20: number | null;            // ATR(5) / ATR(20) ratio
  volumeRecent5d: number[] | null;        // Last 5 daily volumes (oldest→newest) for trend display
  // ── QFE: Multi-timeframe relative strength ──
  rs5dVsSPY: number | null;
  rs10dVsSPY: number | null;
  rs50dVsSPY: number | null;
  rs5dVsQQQ: number | null;
  rs10dVsQQQ: number | null;
  rs50dVsQQQ: number | null;
  rs5dVsSector: number | null;
  rs10dVsSector: number | null;
  rs50dVsSector: number | null;
  spyReturn20d: number | null;
  qqqReturn20d: number | null;
  // ── QFE: New signal fields ──
  moneyFlowPersistence: number | null;   // Count of last 20 sessions with above-avg up-volume
  rvolTrajectory: number | null;         // Slope of (vol/50d_avg) over last 5 bars
  weeklyReversalSignal: boolean | null;  // Weekly hammer/engulfing/outside bar
  weeklyReversalType: string | null;     // "hammer" | "engulfing" | "outside_bar" | null
  distFromEma10Atr: number | null;       // (price - EMA10) / ATR(14)
  lastUpdated: string;
}

export interface PreRunGates {
  gate1: boolean; // Not already run (20%+ below all-time high)
  gate2: boolean; // No existential risk (manual)
  gate3: boolean; // Base forming, not freefall
}

export interface PreRunScores {
  scoreA: number; // Dead money base (0-2)
  scoreB: number; // Short interest (0-3, expanded)
  scoreC: number; // Narrative catalyst (0-3, manual, expanded)
  scoreD: number; // Earnings inflection (0-3, boosted proximity)
  scoreE: number; // Institutional under-ownership (0-2)
  scoreF: number; // Volume accumulation (0-3, enhanced with OBV/VP leading indicators)
  scoreG: number; // Index inclusion potential (0-2, manual)
  scoreH: number; // Insider buying (0-2)
  scoreI: number; // Options flow / put-call skew (0-2)
  scoreJ: number; // Relative strength vs sector (0-2)
  scoreK: number; // Breakout proximity (0-2)
  scoreL: number; // Higher lows (0-2)
  scoreM: number; // EMA reclaim (0-2)
  scoreM2: number; // 15m EMA timing signal (0-2)
  scoreN: number; // Range coil / tight closes near top (0-2)
  scoreO: number; // Failed breakdown recovery (0-2)
  scoreP: number; // Earnings revision momentum (0-2)
  scoreQ: number; // Short squeeze probability (0-2)
  sectorModifier: number; // +1/0/-1 based on sector momentum
  sectorQuadrant: number; // +2/0/-1/-2 based on RRG quadrant
  totalScore: number; // Sum of A-Q + M2 + modifiers (max 41 + modifiers)
  finalScore: number; // 0 if any gate fails, else totalScore
}

/** Maximum possible raw score (before modifiers: sector momentum + sector quadrant). */
export const MAX_SCORE = 40;

export interface PreRunResult {
  data: PreRunStockData;
  gates: PreRunGates;
  scores: PreRunScores;
  verdict: PreRunVerdict;
  patternMatch: { template: string; similarity: number } | null;
  gate1Bypassed?: boolean;
}

// ── VCP Breakout Scanner types ──

export interface VCPScores {
  trendScore: number;       // 0-25
  volumeScore: number;      // 0-20
  compressionScore: number; // 0-25
  relStrengthScore: number; // 0-15
  riskQualityScore: number; // 0-15
  totalScore: number;       // 0-100
}

export interface VCPGates {
  priceAbove10: boolean;
  avgVolAbove500k: boolean;
  dollarVolAbove20m: boolean;
  mktCapAbove1b: boolean;
  aboveSma200: boolean;
  aboveSma50: boolean;
  allPass: boolean;
}

export interface VCPRiskCalc {
  accountSize: number;
  riskPct: number;
  entry: number | null;
  stop: number | null;
  riskPerShare: number | null;
  shares: number | null;
  target2R: number | null;
  target3R: number | null;
  target6R: number | null;
  target10R: number | null;
  sma10Exit: number | null;
}

export interface VCPResult {
  data: PreRunStockData;
  gates: VCPGates;
  scores: VCPScores;
  phase: VCPPhase;
  riskCalc: VCPRiskCalc;
}

export const VCP_MAX_SCORE = 100;

// ── Institutional Acceleration Scanner types ──

export type InstitutionalClassification =
  | "CONTINUATION_LEADER"
  | "RECOVERY_LEADER"
  | "FRESH_ROTATION"
  | "INSTITUTIONAL_ACCUMULATION"
  | "TIGHT_BASE"
  | "CONSTRUCTIVE_SETUP"
  | "OVERSOLD_REVERSAL"
  | "NEUTRAL_HOLD"
  | "TOO_EXTENDED"
  | "AVOID_DISTRIBUTION"
  | "AVOID_CHOPPY"
  | "AVOID_LOW_QUALITY";

export type ShortlistTier = "SHORTLIST" | "WATCHLIST" | "SPECULATIVE" | null;

export type InstitutionalEntryQuality = "HIGH" | "MODERATE" | "LOW";

export type InstitutionalEntryTrigger =
  | "breakout_above_pivot"
  | "higher_low_hold"
  | "ema_reclaim"
  | "pullback_to_ema20"
  | "gap_and_go"
  | "range_breakout"
  | "none";

export interface InstitutionalGates {
  priceAbove20: boolean;
  mktCapAbove20b: boolean;
  avgDollarVolAbove100m: boolean;
  avgShareVolAbove1_5m: boolean;
  allPass: boolean;
}

export interface InstitutionalScores {
  institutionalScore: number;  // 0-100
  executionScore: number;      // 0-100
  riskScore: number;           // 0-100 (inverted: 100 = low risk)
  disciplineScore: number;     // 0-100
  compositeScore: number;      // weighted composite
}

export interface InstitutionalCommentary {
  summary: string;
  classificationReason: string;
  institutionalDetail: string;
  executionDetail: string;
  riskDetail: string;
  primaryTrigger: string;
  secondaryTrigger: string;
  invalidation: string;
  whatImprovesTomorrow: string;
}

export interface InstitutionalResult {
  data: PreRunStockData;
  gates: InstitutionalGates;
  scores: InstitutionalScores;
  classification: InstitutionalClassification;
  entryQuality: InstitutionalEntryQuality;
  bestTrigger: InstitutionalEntryTrigger;
  avoidReason: string | null;
  commentary: InstitutionalCommentary;
  tier: ShortlistTier;
}

export const INST_MAX_SCORE = 100;

// ── Inflection Engine types ──

export type InflectionStage = "DISTRIBUTION" | "SELLER_EXHAUSTION" | "INFLECTION" | "EARLY_ACCUMULATION" | "EXPANSION";
export type InflectionTradeRead = "AVOID" | "WATCH" | "STARTER_POSITION_CANDIDATE" | "ADD_ON_CONFIRMATION";

export interface InflectionScores {
  sellerExhaustion: number;           // 0-100
  volatilityCompression: number;      // 0-100
  buyerEmergence: number;             // 0-100
  relativeStrength: number;           // 0-100
  liquidityAuction: number;           // 0-100
  institutionalParticipation: number; // 0-100
  overallScore: number;               // 0-100 weighted composite
}

export interface InflectionGates {
  priceAbove5: boolean;
  avgDollarVolAbove10m: boolean;
  mktCapAbove500m: boolean;
  allPass: boolean;
}

export interface InflectionResult {
  data: PreRunStockData;
  gates: InflectionGates;
  scores: InflectionScores;
  stage: InflectionStage;
  tradeRead: InflectionTradeRead;
  extensionRisk: boolean;
  bullishEvidence: string[];
  cautionEvidence: string[];
  invalidationLevel: number | null;
  isPrimarySignal: boolean;
  isStrongerSignal: boolean;
}

export const INFLECTION_MAX_SCORE = 100;

// ── Transition Scanner types ──

/** 11-state market transition model (ordered: each state requires prior state to have occurred) */
export type TransitionState =
  | "MARKDOWN"              // STATE 0: Active downtrend, lower highs + lower lows
  | "SELLING_EXHAUSTION"    // STATE 1: Down-volume declining, RSI recovering, candle bodies shrinking
  | "ACCUMULATION"          // STATE 2: Range-bound, OBV divergence, volume drying up
  | "DEMAND_INCREASING"     // STATE 3: Up-volume expanding, higher lows forming
  | "BULLISH_CHOCH"         // STATE 4: Price closes above most recent swing high (change of character)
  | "HIGHER_LOW_FORMATION"  // STATE 5: First higher low forms after ChoCH
  | "BULLISH_BOS"           // STATE 6: Price breaks above swing high preceding the higher low
  | "COMPRESSION"           // STATE 7: ATR contracting, range tightening near highs
  | "EARLY_EXPANSION"       // STATE 8: Breakout with volume, price above resistance
  | "SUSTAINED_MARKUP"      // STATE 9: Trending higher, higher highs + higher lows confirmed
  | "EXTENDED";             // STATE 10: Overextended from moving averages, late entry risk

/** Numeric state ordering for comparison */
export const TRANSITION_STATE_ORDER: Record<TransitionState, number> = {
  MARKDOWN: 0,
  SELLING_EXHAUSTION: 1,
  ACCUMULATION: 2,
  DEMAND_INCREASING: 3,
  BULLISH_CHOCH: 4,
  HIGHER_LOW_FORMATION: 5,
  BULLISH_BOS: 6,
  COMPRESSION: 7,
  EARLY_EXPANSION: 8,
  SUSTAINED_MARKUP: 9,
  EXTENDED: 10,
};

/** Alert state for Transition scanner setups */
export type TransitionAlertState =
  | "WATCH"        // Stock enters a qualifying state (STATE 1-3)
  | "ARMED"        // Reaches STATE 4+ and trigger level is computed
  | "READY"        // Price approaches trigger level (within 2 ATR)
  | "TRIGGERED"    // Price crosses trigger level with volume confirmation
  | "INVALIDATED"; // Price breaks below invalidation level

export interface TransitionScores {
  sellerExhaustion: number;      // 0-100: Down-volume decline, RSI recovery, candle shrinking
  accumulationQuality: number;   // 0-100: OBV divergence, volume dry-up, range formation
  chochConfirmation: number;     // 0-100: Swing high break quality, volume on break, follow-through
  bosConfirmation: number;       // 0-100: Higher-low + swing high break, structural confirmation
  compressionQuality: number;    // 0-100: ATR contraction, range nesting, tight closes
  higherLowQuality: number;      // 0-100: HL count, depth quality, hold duration
  rsTrajectory: number;          // 0-100: RS acceleration, improving vs absolute
  volumeProfile: number;         // 0-100: Accum/distrib ratio, OBV slope, money flow
  overallScore: number;          // 0-100: Weighted composite of above 8 components
}

export interface TransitionResult {
  data: PreRunStockData;
  gates: InflectionGates;        // Reuses same gate structure (price, dollarVol, mcap)
  scores: TransitionScores;
  state: TransitionState;
  alertState: TransitionAlertState;
  triggerLevel: number | null;       // Price above which transition is confirmed
  invalidationLevel: number | null;  // Price below which thesis fails
  bullishEvidence: string[];
  cautionEvidence: string[];
  /** True if state >= BULLISH_CHOCH and score >= 45 */
  isPrimarySignal: boolean;
  /** True if state >= BULLISH_BOS and score >= 55 */
  isStrongerSignal: boolean;
}

export const TRANSITION_MAX_SCORE = 100;

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
  /** Extended state (added post-launch, optional for backward compat) */
  viewMode?: VCPViewMode;
  vcpMinScore?: number;
  quadrantFilter?: string;
  skipGate1?: boolean;
  skipGate3?: boolean;
  criteriaFilters?: PreRunCriteriaFilter[];
  multiTF?: boolean;
  filterObvDivergence?: boolean;
  filterVpDivergence?: boolean;
}

export interface PreRunFilters {
  minPctFromAth: number;
  maxPctFromAth: number; // 0 = no limit
  minShortFloat: number;
  maxMarketCap: number; // 0 = no limit
  minScore: number;
  sectorBucket: string; // "All" or specific bucket name
  earningsWithin: number; // 0 = any, else days
  verdict: string; // "All" | "KEEP" | "WATCH" | "PRIORITY"
  emaTimeframe: EmaTimeframe;
}

export const DEFAULT_PRERUN_FILTERS: PreRunFilters = {
  minPctFromAth: 20,
  maxPctFromAth: 0,
  minShortFloat: 0,
  maxMarketCap: 0,
  minScore: 11,
  sectorBucket: "All",
  earningsWithin: 0,
  verdict: "All",
  emaTimeframe: "15m",
};

export interface PreRunCriteriaFilter {
  criterion: string; // "A" | "B" | ... | "Q" | "M2"
  min: number;       // minimum score for this criterion
}

export interface PreRunPreset {
  name: string;
  shortName: string;
  description: string;
  filters: Partial<PreRunFilters>;
  criteriaFilters?: PreRunCriteriaFilter[];
  recommended?: boolean;
  multiTF?: boolean;
  skipGate1?: boolean;
  skipGate3?: boolean;
  quadrantFilter?: string;
  viewMode?: VCPViewMode;
  vcpMinScore?: number;
  filterObvDivergence?: boolean;
  filterVpDivergence?: boolean;
}

export const PRERUN_PRESETS: PreRunPreset[] = [
  {
    name: "SNDK Pattern",
    shortName: "SNDK",
    description: "Min 40% from ATH, min 15% SI, score ≥18. Classic multi-bagger setup.",
    filters: { minPctFromAth: 40, minShortFloat: 15, minScore: 18 },
    recommended: true,
  },
  {
    name: "Early Mover",
    shortName: "Early Mover",
    description: "Stage 1→2 breakout: EMA timing + higher lows + volume accumulation.",
    filters: { minPctFromAth: 25, minScore: 14 },
    criteriaFilters: [
      { criterion: "M2", min: 1 },
      { criterion: "L", min: 1 },
      { criterion: "F", min: 1 },
    ],
    multiTF: true,
  },
  {
    name: "Pullback Buy",
    shortName: "Pullback",
    description: "Catch 20-40% pullbacks from ATH with higher lows + M2 timing + volume confirmation.",
    filters: { maxPctFromAth: 40, minScore: 15 },
    criteriaFilters: [
      { criterion: "M2", min: 1 },
      { criterion: "F", min: 1 },
      { criterion: "L", min: 1 },
    ],
    multiTF: true,
  },
  {
    name: "Leading Sector Scan",
    shortName: "Leading",
    description: "Stocks in RRG LEADING or IMPROVING sectors with EMA confirmation. Skips ATH gate to find sector leaders.",
    filters: { minPctFromAth: 0, minScore: 12 },
    criteriaFilters: [
      { criterion: "M", min: 1 },
    ],
    skipGate1: true,
    skipGate3: true,
    quadrantFilter: "LEADING,IMPROVING",
  },
  {
    name: "Inst. VCP Breakout",
    shortName: "VCP",
    description: "Institutional-quality stocks in confirmed uptrends forming tight volatility contractions near breakout pivots.",
    filters: { minPctFromAth: 0, minShortFloat: 0, minScore: 0 },
    viewMode: "vcp",
    vcpMinScore: 65,
  },
  {
    name: "Stealth Accumulation",
    shortName: "Stealth",
    description: "OBV-price divergence OR seller exhaustion (VP divergence) with EMA timing. Finds institutional buying while price stays flat.",
    filters: { minScore: 11 },
    criteriaFilters: [
      { criterion: "M2", min: 1 },
    ],
    filterObvDivergence: true,
    filterVpDivergence: true,
  },
  {
    name: "Aggressive Early",
    shortName: "Early+",
    description: "Pre-breakout detection: volume divergence + range coil + EMA timing. Lower score threshold catches setups 1-2 weeks before breakout.",
    filters: { minScore: 10 },
    criteriaFilters: [
      { criterion: "M2", min: 1 },
      { criterion: "N", min: 1 },
    ],
    filterObvDivergence: true,
    filterVpDivergence: true,
    multiTF: true,
  },
  {
    name: "Inst. Acceleration",
    shortName: "Inst",
    description: "Large-cap institutional runners — RS acceleration, volume accumulation, structure analysis. Scores NOW, AVGO, NVDA-type setups.",
    filters: { minPctFromAth: 0, minShortFloat: 0, minScore: 0 },
    viewMode: "institutional",
  },
  {
    name: "Inflection Engine",
    shortName: "Inflection",
    description: "Detects state transitions — seller exhaustion, compression, buyer emergence. Identifies stocks at inflection points before moves.",
    filters: { minPctFromAth: 0, minShortFloat: 0, minScore: 0 },
    viewMode: "inflection",
  },
];
