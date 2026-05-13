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
  sequence: [StratBarType | StratBarType[], StratBarType | StratBarType[], StratBarType];
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
  { name: "1-2-2U_REV", sequence: [["1"], ["2D"], "2U"], direction: "BULL", description: "1-2-2 Bullish Reversal" },
  { name: "1-2-2D_REV", sequence: [["1"], ["2U"], "2D"], direction: "BEAR", description: "1-2-2 Bearish Reversal" },
  // 3-2-2 Reversals
  { name: "3-2-2U_REV", sequence: [["3"], ["2D"], "2U"], direction: "BULL", description: "3-2-2 Bullish Reversal" },
  { name: "3-2-2D_REV", sequence: [["3"], ["2U"], "2D"], direction: "BEAR", description: "3-2-2 Bearish Reversal" },
];

function matchesType(actual: StratBarType, pattern: StratBarType | StratBarType[]): boolean {
  if (Array.isArray(pattern)) return pattern.includes(actual);
  return actual === pattern;
}

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
      matchesType(bar0.barType, pattern.sequence[0]) &&
      matchesType(bar1.barType, pattern.sequence[1]) &&
      matchesType(bar2.barType, pattern.sequence[2])
    ) {
      // Determine trigger levels based on combo type
      let triggerHigh: number;
      let triggerLow: number;

      if (pattern.name.startsWith("2-1-") || pattern.name.startsWith("3-1-")) {
        // Inside bar triggers
        triggerHigh = bar1.high;
        triggerLow = bar1.low;
      } else if (pattern.name.startsWith("1-2-")) {
        // Prior bar triggers
        triggerHigh = bar1.high;
        triggerLow = bar1.low;
      } else if (pattern.name.startsWith("3-2-")) {
        // 3-bar range triggers
        triggerHigh = bar0.high;
        triggerLow = bar0.low;
      } else {
        triggerHigh = bar1.high;
        triggerLow = bar1.low;
      }

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

  // Detect forming combos: if last bar is "1", a 2-1-? or 3-1-? is setting up
  if (bars.length >= 2) {
    const last2 = bars.slice(-2);
    const [prevBar, curBar] = last2;

    if (curBar.barType === "1") {
      // Inside bar forming — potential 2-1-2 or 3-1-2 setup
      if (prevBar.barType === "2D" || prevBar.barType === "2U" || prevBar.barType === "3") {
        const setupDir = prevBar.barType === "2D" ? "BULL" : prevBar.barType === "2U" ? "BEAR" : "BULL";
        const setupName = prevBar.barType === "3" ? "3-1-2" : "2-1-2";

        combos.push({
          name: `${setupName}${setupDir === "BULL" ? "U" : "D"}_${prevBar.barType === "2D" || prevBar.barType === "3" ? "REV" : "CONT"}` as StratComboName,
          timeframe,
          direction: setupDir,
          barSequence: [prevBar.barType, curBar.barType],
          triggerHigh: curBar.high,
          triggerLow: curBar.low,
          isActionable: false, // Setup forming, not yet triggered
          description: `${setupName} ${setupDir === "BULL" ? "Bullish" : "Bearish"} forming`,
        });
      }
    }
  }

  return combos;
}

/** Compute Timeframe Continuity (TFC) from 3 timeframe directions. */
export function computeTFC(
  monthly: StratDirection,
  weekly: StratDirection,
  daily: StratDirection
): StratTFC {
  const dirs = [monthly, weekly, daily];
  const bullCount = dirs.filter((d) => d === "BULL").length;
  const bearCount = dirs.filter((d) => d === "BEAR").length;

  let alignment: TFCAlignment;
  let score: number;

  if (bullCount === 3) {
    alignment = "FULL_BULL";
    score = 3;
  } else if (bearCount === 3) {
    alignment = "FULL_BEAR";
    score = 3;
  } else {
    alignment = "MIXED";
    score = Math.max(bullCount, bearCount);
  }

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
