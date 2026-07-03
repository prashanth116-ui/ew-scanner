import type {
  CopilotInput,
  CopilotResult,
  HtfAlignmentResult,
  RevengeGuardResult,
  PdaLocationResult,
  FomoCondition,
  ScoreBreakdownItem,
  MarketState,
  TradeMode,
  Decision,
  ScoreTier,
  BiasDirection,
} from "./types";
import { getCurrentTimeWindow, getSessionWarning } from "./sessionRules";

// ── Main Entry Point ───────────────────────────────────────────────

export function evaluateCopilot(input: CopilotInput): CopilotResult {
  const timeWindow = getCurrentTimeWindow(input.session);
  const sessionWarning = getSessionWarning(timeWindow, input.session);
  const htfAlignment = computeHtfAlignment(input);
  const marketState = classifyMarketState(input, htfAlignment);
  const revengeGuard = evaluateRevengeGuard(input);
  const pdaLocation = evaluatePdaLocation(input);
  const fomoConditions = detectFomo(input, revengeGuard);
  const { score, breakdown } = computeScore(input, htfAlignment, pdaLocation, revengeGuard);
  const scoreTier = getScoreTier(score);
  const tradeMode = deriveTradeMode(input, marketState, htfAlignment, revengeGuard);
  const decision = deriveDecision(score, tradeMode, revengeGuard, input, timeWindow);
  const narrative = buildNarrative(input, decision, score, scoreTier, marketState, tradeMode, htfAlignment, revengeGuard, timeWindow);

  return {
    decision,
    score,
    scoreTier,
    marketState,
    tradeMode,
    htfAlignment,
    revengeGuard,
    pdaLocation,
    fomoConditions,
    scoreBreakdown: breakdown,
    narrative,
    timeWindow,
    sessionWarning,
  };
}

// ── HTF Alignment ──────────────────────────────────────────────────

function computeHtfAlignment(input: CopilotInput): HtfAlignmentResult {
  const primary = input.dailyBias;
  const timeframes = [
    { timeframe: "Daily", bias: input.dailyBias },
    { timeframe: "4H", bias: input.fourHourBias },
    { timeframe: "1H", bias: input.oneHourBias },
    { timeframe: "15M", bias: input.fifteenMinBias },
  ];

  const details = timeframes.map((tf) => ({
    ...tf,
    aligned: tf.bias === primary && tf.bias !== "neutral",
  }));

  const alignedCount = details.filter((d) => d.aligned).length;

  return {
    score: alignedCount,
    aligned: alignedCount >= 3,
    direction: primary,
    details,
  };
}

// ── Market State Classification ────────────────────────────────────

function classifyMarketState(input: CopilotInput, htf: HtfAlignmentResult): MarketState {
  if (input.manualBlock) return "wait";

  // Strong trend: HTF aligned + displacement or MSS
  if (htf.aligned && htf.direction === "bullish" && (input.displacement || input.mss)) {
    return "trending_bullish";
  }
  if (htf.aligned && htf.direction === "bearish" && (input.displacement || input.mss)) {
    return "trending_bearish";
  }

  // Transition: some alignment but no confirmation
  if (htf.score >= 2 && htf.direction !== "neutral") {
    return "transition";
  }

  // Range: mixed signals or neutral
  if (htf.score <= 1 && !input.displacement) {
    return "range";
  }

  return "wait";
}

// ── Trade Mode ─────────────────────────────────────────────────────

function deriveTradeMode(
  input: CopilotInput,
  state: MarketState,
  htf: HtfAlignmentResult,
  revenge: RevengeGuardResult
): TradeMode {
  if (input.manualBlock || revenge.status === "blocked") return "blocked";
  if (revenge.status === "lockout") return "wait";

  switch (state) {
    case "trending_bullish": return "long_only";
    case "trending_bearish": return "short_only";
    case "range": {
      // Range trade only if we have some structure
      if (input.fvgPresent || input.breaker) return "range_trade";
      return "wait";
    }
    case "transition": {
      if (htf.direction === "bullish") return "long_only";
      if (htf.direction === "bearish") return "short_only";
      return "wait";
    }
    default: return "wait";
  }
}

// ── Revenge Guard ──────────────────────────────────────────────────

function evaluateRevengeGuard(input: CopilotInput): RevengeGuardResult {
  const { lossesToday, consecutiveLosses, lastTradeResult, timeSinceLastLoss } = input;

  if (lossesToday >= 3 || consecutiveLosses >= 3) {
    return {
      status: "blocked",
      message: `${lossesToday} losses today (${consecutiveLosses} consecutive). Done for the day.`,
      lossCount: lossesToday,
      consecutiveLosses,
    };
  }

  if (consecutiveLosses >= 2) {
    return {
      status: "lockout",
      message: `${consecutiveLosses} consecutive losses. Step away and reset.`,
      lossCount: lossesToday,
      consecutiveLosses,
    };
  }

  if (lastTradeResult === "loss" && timeSinceLastLoss < 15) {
    return {
      status: "warning",
      message: `Last trade was a loss ${timeSinceLastLoss}m ago. Wait at least 15 minutes before next entry.`,
      lossCount: lossesToday,
      consecutiveLosses,
    };
  }

  return {
    status: "clear",
    message: "No revenge trading risk detected.",
    lossCount: lossesToday,
    consecutiveLosses,
  };
}

// ── FOMO Detection ─────────────────────────────────────────────────

function detectFomo(input: CopilotInput, revenge: RevengeGuardResult): FomoCondition[] {
  const conditions: FomoCondition[] = [];

  if (input.lastTradeResult === "loss" && input.timeSinceLastLoss < 10) {
    conditions.push({
      id: "quick_reentry",
      label: "Quick re-entry after loss — likely FOMO",
      severity: "danger",
    });
  }

  if (revenge.status === "warning" || revenge.status === "lockout") {
    conditions.push({
      id: "revenge_risk",
      label: "Revenge trading risk detected",
      severity: "danger",
    });
  }

  if (input.rrRatio < 2) {
    conditions.push({
      id: "poor_rr",
      label: `R:R ratio is ${input.rrRatio.toFixed(1)} — below 2:1 minimum`,
      severity: "warning",
    });
  }

  if (input.openPositions >= 3) {
    conditions.push({
      id: "overexposed",
      label: `${input.openPositions} open positions — max exposure reached`,
      severity: "danger",
    });
  }

  if (!input.fvgPresent && !input.mss && !input.liquiditySweep) {
    conditions.push({
      id: "no_setup",
      label: "No ICT setup present — chasing price",
      severity: "warning",
    });
  }

  return conditions;
}

// ── PDA Location ───────────────────────────────────────────────────

function evaluatePdaLocation(input: CopilotInput): PdaLocationResult {
  const { currentPrice, pdaHighLevel, pdaLowLevel, nearestOBLevel, nearestFVGLevel } = input;

  if (currentPrice === 0) {
    return { nearPdaHigh: false, nearPdaLow: false, nearOB: false, nearFVG: false, inNoTradeZone: false, proximityPercent: 0 };
  }

  const range = pdaHighLevel - pdaLowLevel;
  const threshold = range > 0 ? range * 0.05 : 5; // 5% of range or 5 pts default

  const nearPdaHigh = pdaHighLevel > 0 && Math.abs(currentPrice - pdaHighLevel) <= threshold;
  const nearPdaLow = pdaLowLevel > 0 && Math.abs(currentPrice - pdaLowLevel) <= threshold;
  const nearOB = nearestOBLevel > 0 && Math.abs(currentPrice - nearestOBLevel) <= threshold;
  const nearFVG = nearestFVGLevel > 0 && Math.abs(currentPrice - nearestFVGLevel) <= threshold;

  // Mid-range = no trade zone
  const midPoint = range > 0 ? pdaLowLevel + range / 2 : 0;
  const inNoTradeZone = range > 0 && Math.abs(currentPrice - midPoint) <= range * 0.15;

  // Proximity: how close to nearest PDA level
  const distances = [pdaHighLevel, pdaLowLevel, nearestOBLevel, nearestFVGLevel]
    .filter((l) => l > 0)
    .map((l) => Math.abs(currentPrice - l));
  const minDist = distances.length > 0 ? Math.min(...distances) : 0;
  const proximityPercent = range > 0 ? Math.max(0, Math.min(100, 100 - (minDist / range) * 100)) : 0;

  return { nearPdaHigh, nearPdaLow, nearOB, nearFVG, inNoTradeZone, proximityPercent };
}

// ── Score Computation ──────────────────────────────────────────────

function computeScore(
  input: CopilotInput,
  htf: HtfAlignmentResult,
  pda: PdaLocationResult,
  revenge: RevengeGuardResult
): { score: number; breakdown: ScoreBreakdownItem[] } {
  const breakdown: ScoreBreakdownItem[] = [];
  let raw = 0;

  // Additive factors (max +11)
  const htfPoints = htf.aligned ? 2 : 0;
  breakdown.push({ label: "HTF Alignment (4 TFs agree)", points: htfPoints, active: htf.aligned });
  raw += htfPoints;

  const fifteenConfirm = input.fifteenMinBias !== "neutral" && input.fifteenMinBias === htf.direction;
  const fifteenPts = fifteenConfirm ? 2 : 0;
  breakdown.push({ label: "15M Confirmation", points: fifteenPts, active: fifteenConfirm });
  raw += fifteenPts;

  const liqPts = input.liquiditySweep ? 2 : 0;
  breakdown.push({ label: "Liquidity Sweep", points: liqPts, active: input.liquiditySweep });
  raw += liqPts;

  const mssPts = input.mss ? 2 : 0;
  breakdown.push({ label: "Market Structure Shift", points: mssPts, active: input.mss });
  raw += mssPts;

  const dispPts = input.displacement ? 1 : 0;
  breakdown.push({ label: "Displacement", points: dispPts, active: input.displacement });
  raw += dispPts;

  const fvgPts = input.fvgPresent ? 1 : 0;
  breakdown.push({ label: "FVG Present", points: fvgPts, active: input.fvgPresent });
  raw += fvgPts;

  const retestPts = input.fvgRetest ? 1 : 0;
  breakdown.push({ label: "FVG Retest", points: retestPts, active: input.fvgRetest });
  raw += retestPts;

  // Subtractive factors (max -17)
  const midRangePts = pda.inNoTradeZone ? -3 : 0;
  breakdown.push({ label: "Mid-Range (no-trade zone)", points: midRangePts, active: pda.inNoTradeZone });
  raw += midRangePts;

  // Opposing PDA: near high when bearish or near low when bullish
  const opposingPda =
    (htf.direction === "bearish" && pda.nearPdaLow) ||
    (htf.direction === "bullish" && pda.nearPdaHigh);
  const oppPts = opposingPda ? -3 : 0;
  breakdown.push({ label: "Opposing PDA Proximity", points: oppPts, active: opposingPda });
  raw += oppPts;

  const no15m = input.fifteenMinBias === "neutral";
  const no15mPts = no15m ? -2 : 0;
  breakdown.push({ label: "No 15M Bias", points: no15mPts, active: no15m });
  raw += no15mPts;

  const poorRR = input.rrRatio < 2;
  const rrPts = poorRR ? -2 : 0;
  breakdown.push({ label: "Poor R:R (< 2:1)", points: rrPts, active: poorRR });
  raw += rrPts;

  const tooFar = input.currentPrice > 0 && !pda.nearOB && !pda.nearFVG && !pda.nearPdaHigh && !pda.nearPdaLow;
  const farPts = tooFar ? -2 : 0;
  breakdown.push({ label: "Price Far From PDA", points: farPts, active: tooFar });
  raw += farPts;

  const revengePts = revenge.status === "blocked" || revenge.status === "lockout" ? -5 : revenge.status === "warning" ? -3 : 0;
  breakdown.push({ label: "Revenge Guard Penalty", points: revengePts, active: revengePts !== 0 });
  raw += revengePts;

  // Clamp to 0-10
  const score = Math.max(0, Math.min(10, raw));

  return { score, breakdown };
}

// ── Score Tier ──────────────────────────────────────────────────────

function getScoreTier(score: number): ScoreTier {
  if (score >= 9) return "A+";
  if (score >= 7) return "A";
  if (score >= 5) return "B";
  if (score >= 3) return "C";
  if (score >= 1) return "D";
  return "F";
}

// ── Decision ───────────────────────────────────────────────────────

function deriveDecision(
  score: number,
  tradeMode: TradeMode,
  revenge: RevengeGuardResult,
  input: CopilotInput,
  timeWindow: { quality: string }
): Decision {
  if (input.manualBlock) return "BLOCKED";
  if (revenge.status === "blocked") return "BLOCKED";
  if (tradeMode === "blocked") return "BLOCKED";
  if (revenge.status === "lockout") return "BLOCKED";
  if (timeWindow.quality === "avoid") return "WAIT";
  if (tradeMode === "wait") return "WAIT";
  if (score >= 7) return "TRADE";
  if (score >= 4) return "WATCH";
  return "WAIT";
}

// ── Narrative Builder ──────────────────────────────────────────────

function buildNarrative(
  input: CopilotInput,
  decision: Decision,
  score: number,
  tier: ScoreTier,
  state: MarketState,
  mode: TradeMode,
  htf: HtfAlignmentResult,
  revenge: RevengeGuardResult,
  timeWindow: { label: string; quality: string }
): string {
  const parts: string[] = [];

  // Market context
  const stateLabels: Record<MarketState, string> = {
    trending_bullish: "trending bullish",
    trending_bearish: "trending bearish",
    range: "in a range",
    transition: "in transition",
    wait: "unclear",
  };
  const priceStr = input.currentPrice > 0 ? ` at ${input.currentPrice.toFixed(2)}` : "";
  parts.push(`${input.market} is ${stateLabels[state]} during ${timeWindow.label}${priceStr}.`);

  // HTF alignment
  if (htf.aligned) {
    parts.push(`HTF bias is aligned ${htf.direction} across ${htf.score}/4 timeframes.`);
  } else {
    parts.push(`HTF bias is mixed (${htf.score}/4 aligned) — wait for clearer alignment.`);
  }

  // ICT conditions
  const conditions: string[] = [];
  if (input.liquiditySweep) conditions.push("liquidity sweep");
  if (input.mss) conditions.push("MSS");
  if (input.displacement) conditions.push("displacement");
  if (input.fvgPresent) conditions.push("FVG");
  if (input.fvgRetest) conditions.push("FVG retest");
  if (conditions.length > 0) {
    parts.push(`Active ICT conditions: ${conditions.join(", ")}.`);
  } else {
    parts.push("No ICT setup conditions present.");
  }

  // Revenge guard
  if (revenge.status !== "clear") {
    parts.push(revenge.message);
  }

  // Decision
  const directionLabel = (d: BiasDirection) =>
    d === "bullish" ? "long" : d === "bearish" ? "short" : "neutral";
  const modeLabels: Record<TradeMode, string> = {
    long_only: "longs only",
    short_only: "shorts only",
    range_trade: "range trades",
    wait: "waiting",
    blocked: "blocked from trading",
  };

  switch (decision) {
    case "TRADE":
      parts.push(`Score: ${score}/10 (${tier}). Setup qualifies for ${modeLabels[mode]} — ${directionLabel(htf.direction)} entries with R:R of ${input.rrRatio.toFixed(1)}:1.`);
      break;
    case "WATCH":
      parts.push(`Score: ${score}/10 (${tier}). Conditions are developing — watch for confirmation before entering.`);
      break;
    case "WAIT":
      parts.push(`Score: ${score}/10 (${tier}). Conditions do not support trading right now. Wait for setup.`);
      break;
    case "BLOCKED":
      parts.push(`Score: ${score}/10 (${tier}). Trading is blocked — ${revenge.status === "blocked" ? "loss limit reached" : "manual override active"}.`);
      break;
  }

  return parts.join(" ");
}
