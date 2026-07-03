// ── Trading Copilot Types ──────────────────────────────────────────

export type Market = "ES" | "NQ" | "MES" | "MNQ" | "SPY" | "QQQ";

export type Session = "london" | "ny_am" | "ny_pm" | "asian" | "pre_market";

export type BiasDirection = "bullish" | "bearish" | "neutral";

export type MarketState =
  | "trending_bullish"
  | "trending_bearish"
  | "range"
  | "transition"
  | "wait";

export type TradeMode =
  | "long_only"
  | "short_only"
  | "range_trade"
  | "wait"
  | "blocked";

export type Decision = "TRADE" | "WATCH" | "WAIT" | "BLOCKED";

export type ScoreTier = "A+" | "A" | "B" | "C" | "D" | "F";

export type TimeWindowName =
  | "eth_low_liq"
  | "london"
  | "pre_market"
  | "ny_open"
  | "primary"
  | "midday_chop"
  | "power_hour"
  | "eod"
  | "post_market";

export interface TimeWindow {
  name: TimeWindowName;
  label: string;
  start: string; // HH:MM ET
  end: string;
  quality: "high" | "medium" | "low" | "avoid";
}

export interface CopilotInput {
  // Market & Session
  market: Market;
  session: Session;
  currentPrice: number;

  // HTF Bias
  dailyBias: BiasDirection;
  fourHourBias: BiasDirection;
  oneHourBias: BiasDirection;
  fifteenMinBias: BiasDirection;

  // PDA Levels
  pdaHighLevel: number;
  pdaLowLevel: number;
  nearestOBLevel: number;
  nearestFVGLevel: number;

  // ICT Conditions
  liquiditySweep: boolean;
  mss: boolean; // Market Structure Shift
  displacement: boolean;
  fvgPresent: boolean;
  fvgRetest: boolean;
  inFVG: boolean;
  breaker: boolean;

  // Trade State
  lossesToday: number;
  consecutiveLosses: number;
  openPositions: number;
  lastTradeResult: "win" | "loss" | "none";
  timeSinceLastLoss: number; // minutes
  rrRatio: number; // reward:risk ratio

  // Overrides
  manualBlock: boolean;
}

export interface ScoreBreakdownItem {
  label: string;
  points: number;
  active: boolean;
}

export interface HtfAlignmentResult {
  score: number; // 0-4
  aligned: boolean;
  direction: BiasDirection;
  details: { timeframe: string; bias: BiasDirection; aligned: boolean }[];
}

export interface RevengeGuardResult {
  status: "clear" | "warning" | "lockout" | "blocked";
  message: string;
  lossCount: number;
  consecutiveLosses: number;
}

export interface PdaLocationResult {
  nearPdaHigh: boolean;
  nearPdaLow: boolean;
  nearOB: boolean;
  nearFVG: boolean;
  inNoTradeZone: boolean;
  proximityPercent: number; // how close to nearest PDA (0-100)
}

export interface FomoCondition {
  id: string;
  label: string;
  severity: "warning" | "danger";
}

export interface CopilotResult {
  decision: Decision;
  score: number; // 0-10
  scoreTier: ScoreTier;
  marketState: MarketState;
  tradeMode: TradeMode;
  htfAlignment: HtfAlignmentResult;
  revengeGuard: RevengeGuardResult;
  pdaLocation: PdaLocationResult;
  fomoConditions: FomoCondition[];
  scoreBreakdown: ScoreBreakdownItem[];
  narrative: string;
  timeWindow: TimeWindow;
  sessionWarning: string | null;
}

export interface MockPreset {
  name: string;
  description: string;
  input: CopilotInput;
}

// ── Defaults ───────────────────────────────────────────────────────

export const DEFAULT_COPILOT_INPUT: CopilotInput = {
  market: "ES",
  session: "ny_am",
  currentPrice: 0,

  dailyBias: "neutral",
  fourHourBias: "neutral",
  oneHourBias: "neutral",
  fifteenMinBias: "neutral",

  pdaHighLevel: 0,
  pdaLowLevel: 0,
  nearestOBLevel: 0,
  nearestFVGLevel: 0,

  liquiditySweep: false,
  mss: false,
  displacement: false,
  fvgPresent: false,
  fvgRetest: false,
  inFVG: false,
  breaker: false,

  lossesToday: 0,
  consecutiveLosses: 0,
  openPositions: 0,
  lastTradeResult: "none",
  timeSinceLastLoss: 999,
  rrRatio: 3,

  manualBlock: false,
};
