/**
 * The Strat — core classification and combo detection engine.
 * Implements Rob Smith's bar classification, combo patterns, TFC, and PMG detection.
 */

import type {
  StratBarType,
  StratDirection,
  StratCombo,
  StratComboName,
  StratTFC,
  TFCAlignment,
  StratTriggers,
  StratPMG,
  StratBroadening,
  StratBar,
} from "./types";

/** Classify a bar relative to the prior bar's range. */
export function classifyBar(
  currentHigh: number,
  currentLow: number,
  priorHigh: number,
  priorLow: number
): StratBarType {
  const highAbove = currentHigh > priorHigh;
  const lowBelow = currentLow < priorLow;

  if (highAbove && lowBelow) return "3"; // outside bar
  if (highAbove) return "2U"; // up bar
  if (lowBelow) return "2D"; // down bar
  return "1"; // inside bar
}

/** Determine directional bias of a classified bar. */
export function barDirection(
  barType: StratBarType,
  open: number,
  close: number
): StratDirection {
  switch (barType) {
    case "2U":
      return "BULL";
    case "2D":
      return "BEAR";
    case "3":
      return close > open ? "BULL" : "BEAR";
    case "1":
      return "NEUTRAL";
  }
}

/** Classify an array of OHLCV bars into StratBars. Requires at least 2 bars. */
export function classifyBars(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  timestamps: number[]
): StratBar[] {
  if (opens.length < 2) return [];

  const result: StratBar[] = [];

  // First bar has no prior — classify as "1" (no reference)
  result.push({
    open: opens[0],
    high: highs[0],
    low: lows[0],
    close: closes[0],
    volume: volumes[0],
    timestamp: timestamps[0],
    barType: "1",
  });

  for (let i = 1; i < opens.length; i++) {
    const barType = classifyBar(highs[i], lows[i], highs[i - 1], lows[i - 1]);
    result.push({
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
      volume: volumes[i],
      timestamp: timestamps[i],
      barType,
    });
  }

  return result;
}

interface ComboPattern {
  name: StratComboName;
  sequence: [StratBarType, StratBarType, StratBarType];
  direction: "BULL" | "BEAR";
  description: string;
}

const COMBO_PATTERNS: ComboPattern[] = [
  // 2-1-2 Reversals
  { name: "2-1-2U_REV", sequence: ["2D", "1", "2U"], direction: "BULL", description: "2-1-2 Bullish Reversal" },
  { name: "2-1-2D_REV", sequence: ["2U", "1", "2D"], direction: "BEAR", description: "2-1-2 Bearish Reversal" },
  // 2-1-2 Continuations
  { name: "2-1-2U_CONT", sequence: ["2U", "1", "2U"], direction: "BULL", description: "2-1-2 Bullish Continuation" },
  { name: "2-1-2D_CONT", sequence: ["2D", "1", "2D"], direction: "BEAR", description: "2-1-2 Bearish Continuation" },
  // 3-1-2
  { name: "3-1-2U", sequence: ["3", "1", "2U"], direction: "BULL", description: "3-1-2 Bullish" },
  { name: "3-1-2D", sequence: ["3", "1", "2D"], direction: "BEAR", description: "3-1-2 Bearish" },
  // 1-2-2 Reversals
  { name: "1-2-2U_REV", sequence: ["1", "2D", "2U"], direction: "BULL", description: "1-2-2 Bullish Reversal" },
  { name: "1-2-2D_REV", sequence: ["1", "2U", "2D"], direction: "BEAR", description: "1-2-2 Bearish Reversal" },
  // 3-2-2 Reversals
  { name: "3-2-2U_REV", sequence: ["3", "2D", "2U"], direction: "BULL", description: "3-2-2 Bullish Reversal" },
  { name: "3-2-2D_REV", sequence: ["3", "2U", "2D"], direction: "BEAR", description: "3-2-2 Bearish Reversal" },
  // 2-2-2 Continuations (consecutive directional bars)
  { name: "2-2-2U_CONT", sequence: ["2U", "2U", "2U"], direction: "BULL", description: "2-2-2 Bullish Continuation" },
  { name: "2-2-2D_CONT", sequence: ["2D", "2D", "2D"], direction: "BEAR", description: "2-2-2 Bearish Continuation" },
  // 1-3-2 Expansion breakout (compression → expansion → follow-through)
  { name: "1-3-2U", sequence: ["1", "3", "2U"], direction: "BULL", description: "1-3-2 Bullish Expansion" },
  { name: "1-3-2D", sequence: ["1", "3", "2D"], direction: "BEAR", description: "1-3-2 Bearish Expansion" },
  // 2-3-2 Reversals (directional → outside → follow-through)
  { name: "2-3-2U_REV", sequence: ["2D", "3", "2U"], direction: "BULL", description: "2-3-2 Bullish Reversal" },
  { name: "2-3-2D_REV", sequence: ["2U", "3", "2D"], direction: "BEAR", description: "2-3-2 Bearish Reversal" },
];

/** Detect all active combos from last 3 classified bars in a timeframe. */
export function detectCombos(
  bars: StratBar[],
  timeframe: "monthly" | "weekly" | "daily"
): StratCombo[] {
  if (bars.length < 3) return [];

  const combos: StratCombo[] = [];
  const last3 = bars.slice(-3);
  const [bar0, bar1, bar2] = last3;

  for (const pattern of COMBO_PATTERNS) {
    if (
      bar0.barType === pattern.sequence[0] &&
      bar1.barType === pattern.sequence[1] &&
      bar2.barType === pattern.sequence[2]
    ) {
      // Trigger levels: bar1 (middle bar) high/low for all patterns.
      // 2-1-2/3-1-2: inside bar defines breakout levels.
      // 1-2-2: prior bar defines the level to reclaim.
      // 3-2-2: middle bar (not the outside bar) defines the reversal confirmation level.
      const triggerHigh = bar1.high;
      const triggerLow = bar1.low;

      combos.push({
        name: pattern.name,
        timeframe,
        direction: pattern.direction,
        barSequence: [bar0.barType, bar1.barType, bar2.barType],
        triggerHigh,
        triggerLow,
        isActionable: true,
        description: pattern.description,
      });
    }
  }

  // Detect forming combos: if last bar is "1", a 2-1-? or 3-1-? is setting up.
  // Inside bars can break either way, so generate both bull and bear forming combos.
  if (bars.length >= 2) {
    const last2 = bars.slice(-2);
    const [prevBar, curBar] = last2;

    if (curBar.barType === "1") {
      if (prevBar.barType === "2D") {
        // 2D → 1 → could form 2U reversal (bull) or 2D continuation (bear)
        combos.push({
          name: "2-1-2U_REV",
          timeframe,
          direction: "BULL",
          barSequence: [prevBar.barType, curBar.barType],
          triggerHigh: curBar.high,
          triggerLow: curBar.low,
          isActionable: false,
          description: "2-1-2 Bullish Reversal forming",
        });
        combos.push({
          name: "2-1-2D_CONT",
          timeframe,
          direction: "BEAR",
          barSequence: [prevBar.barType, curBar.barType],
          triggerHigh: curBar.high,
          triggerLow: curBar.low,
          isActionable: false,
          description: "2-1-2 Bearish Continuation forming",
        });
      } else if (prevBar.barType === "2U") {
        // 2U → 1 → could form 2D reversal (bear) or 2U continuation (bull)
        combos.push({
          name: "2-1-2D_REV",
          timeframe,
          direction: "BEAR",
          barSequence: [prevBar.barType, curBar.barType],
          triggerHigh: curBar.high,
          triggerLow: curBar.low,
          isActionable: false,
          description: "2-1-2 Bearish Reversal forming",
        });
        combos.push({
          name: "2-1-2U_CONT",
          timeframe,
          direction: "BULL",
          barSequence: [prevBar.barType, curBar.barType],
          triggerHigh: curBar.high,
          triggerLow: curBar.low,
          isActionable: false,
          description: "2-1-2 Bullish Continuation forming",
        });
      } else if (prevBar.barType === "3") {
        // 3 → 1 → could form 3-1-2U (bull) or 3-1-2D (bear)
        combos.push({
          name: "3-1-2U",
          timeframe,
          direction: "BULL",
          barSequence: [prevBar.barType, curBar.barType],
          triggerHigh: curBar.high,
          triggerLow: curBar.low,
          isActionable: false,
          description: "3-1-2 Bullish forming",
        });
        combos.push({
          name: "3-1-2D",
          timeframe,
          direction: "BEAR",
          barSequence: [prevBar.barType, curBar.barType],
          triggerHigh: curBar.high,
          triggerLow: curBar.low,
          isActionable: false,
          description: "3-1-2 Bearish forming",
        });
      }
    }
  }

  return combos;
}

/** Compute Timeframe Continuity (TFC) from 3 timeframe directions.
 *  Weighted by timeframe hierarchy: monthly 2x, weekly 1.5x, daily 1x.
 *  Normalized to 0-3 range to maintain backward compatibility with scoring. */
export function computeTFC(
  monthly: StratDirection,
  weekly: StratDirection,
  daily: StratDirection
): StratTFC {
  const dirs = [monthly, weekly, daily];
  const bullCount = dirs.filter((d) => d === "BULL").length;
  const bearCount = dirs.filter((d) => d === "BEAR").length;

  let alignment: TFCAlignment;

  if (bullCount === 3) {
    alignment = "FULL_BULL";
  } else if (bearCount === 3) {
    alignment = "FULL_BEAR";
  } else {
    alignment = "MIXED";
  }

  // Weighted scoring: monthly 2x, weekly 1.5x, daily 1x (max raw = 4.5)
  const targetDir = bullCount >= bearCount ? "BULL" : "BEAR";
  let rawWeighted = 0;
  if (monthly === targetDir) rawWeighted += 2.0;
  if (weekly === targetDir) rawWeighted += 1.5;
  if (daily === targetDir) rawWeighted += 1.0;

  // Normalize to 0-3 range: rawWeighted / 4.5 * 3
  const score = Math.round((rawWeighted / 4.5) * 3 * 100) / 100;

  return { monthly, weekly, daily, alignment, score };
}

/** Detect Pivot Machine Gun (PMG) — 3+ tests of same high or low level. */
export function detectPMG(
  bars: StratBar[],
  timeframe: string,
  tolerancePct = 0.002
): StratPMG[] {
  if (bars.length < 3) return [];

  const pmgs: StratPMG[] = [];
  const lookback = Math.min(8, bars.length);
  const recentBars = bars.slice(-lookback);

  // Check highs
  for (let i = 0; i < recentBars.length; i++) {
    const level = recentBars[i].high;
    let tests = 1;

    for (let j = i + 1; j < recentBars.length; j++) {
      const diff = Math.abs(recentBars[j].high - level) / level;
      if (diff <= tolerancePct) tests++;
    }

    if (tests >= 3) {
      // Avoid duplicates at similar levels
      if (!pmgs.some((p) => p.side === "HIGH" && Math.abs(p.level - level) / level <= tolerancePct)) {
        pmgs.push({ level, side: "HIGH", testCount: tests, timeframe });
      }
    }
  }

  // Check lows
  for (let i = 0; i < recentBars.length; i++) {
    const level = recentBars[i].low;
    let tests = 1;

    for (let j = i + 1; j < recentBars.length; j++) {
      const diff = Math.abs(recentBars[j].low - level) / level;
      if (diff <= tolerancePct) tests++;
    }

    if (tests >= 3) {
      if (!pmgs.some((p) => p.side === "LOW" && Math.abs(p.level - level) / level <= tolerancePct)) {
        pmgs.push({ level, side: "LOW", testCount: tests, timeframe });
      }
    }
  }

  return pmgs;
}

/** Compute trigger levels from all detected combos. */
export function computeTriggers(combos: StratCombo[]): StratTriggers {
  let longTrigger: number | null = null;
  let shortTrigger: number | null = null;
  let longSource = "";
  let shortSource = "";

  for (const combo of combos) {
    if (combo.direction === "BULL" && combo.isActionable) {
      if (longTrigger === null || combo.triggerHigh < longTrigger) {
        longTrigger = combo.triggerHigh;
        longSource = `${combo.description} (${combo.timeframe})`;
      }
    }
    if (combo.direction === "BEAR" && combo.isActionable) {
      if (shortTrigger === null || combo.triggerLow > shortTrigger) {
        shortTrigger = combo.triggerLow;
        shortSource = `${combo.description} (${combo.timeframe})`;
      }
    }
  }

  // Also include forming combos if no actionable triggers
  if (longTrigger === null || shortTrigger === null) {
    for (const combo of combos) {
      if (!combo.isActionable) {
        if (combo.direction === "BULL" && longTrigger === null) {
          longTrigger = combo.triggerHigh;
          longSource = `${combo.description} (${combo.timeframe})`;
        }
        if (combo.direction === "BEAR" && shortTrigger === null) {
          shortTrigger = combo.triggerLow;
          shortSource = `${combo.description} (${combo.timeframe})`;
        }
      }
    }
  }

  return { longTrigger, shortTrigger, longSource, shortSource };
}

/** Detect broadening formations — expanding price envelope over 3+ bars. */
export function detectBroadening(
  bars: StratBar[],
  timeframe: "monthly" | "weekly" | "daily"
): StratBroadening[] {
  if (bars.length < 4) return [];

  const lookback = Math.min(8, bars.length);
  const recentBars = bars.slice(-lookback);

  let runningHigh = recentBars[0].high;
  let runningLow = recentBars[0].low;
  let newHighCount = 0;
  let newLowCount = 0;
  let firstExpansionIdx = -1;
  let lastExpansionIdx = -1;

  for (let i = 1; i < recentBars.length; i++) {
    const madeNewHigh = recentBars[i].high > runningHigh;
    const madeNewLow = recentBars[i].low < runningLow;

    if (madeNewHigh) {
      runningHigh = recentBars[i].high;
      newHighCount++;
      if (firstExpansionIdx === -1) firstExpansionIdx = i;
      lastExpansionIdx = i;
    }

    if (madeNewLow) {
      runningLow = recentBars[i].low;
      newLowCount++;
      if (firstExpansionIdx === -1) firstExpansionIdx = i;
      lastExpansionIdx = i;
    }
  }

  // Need both sides expanding: at least 2 new highs AND 2 new lows
  if (newHighCount >= 2 && newLowCount >= 2) {
    const barCount = lastExpansionIdx - firstExpansionIdx + 1;
    const refBar = recentBars[firstExpansionIdx];
    const initialRange = refBar.high - refBar.low;
    const finalRange = runningHigh - runningLow;
    const expansion = initialRange > 0 ? finalRange / initialRange : 0;
    const strength: "STRONG" | "MODERATE" =
      barCount >= 5 || expansion >= 2.0 ? "STRONG" : "MODERATE";

    return [
      {
        timeframe,
        barCount,
        newHighCount,
        newLowCount,
        rangeExpansion: Math.round(expansion * 100) / 100,
        upperBound: runningHigh,
        lowerBound: runningLow,
        strength,
      },
    ];
  }

  return [];
}
