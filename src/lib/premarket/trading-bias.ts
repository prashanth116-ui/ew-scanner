/**
 * Pre-Market Trading Bias Engine.
 * Computes structured trading bias from futures, VIX (with daily change),
 * adaptive VIX bounds, sector breadth, and existing bias score.
 * Pure functions — no side effects, no fetching.
 */

import type {
  FuturesSnapshot,
  TradingBias,
  MarketBias,
  DayType,
  SectorBreadth,
  VixData,
  BestToTradeInfo,
} from "./types";
import { PREMARKET_SCORING } from "@/lib/sector-rotation/config";

// ── Helpers ──

interface EquityFuture {
  symbol: string;   // "ES" | "NQ" | "YM" | "RTY"
  changePct: number;
  price: number;
}

export interface VixBounds {
  low: number;   // adaptive 25th percentile (default 17)
  high: number;  // adaptive 75th percentile (default 20)
}

function extractEquityFutures(futures: FuturesSnapshot[]): EquityFuture[] {
  const MAP: Record<string, string> = { "ES=F": "ES", "NQ=F": "NQ", "YM=F": "YM", "RTY=F": "RTY" };
  const result: EquityFuture[] = [];
  for (const f of futures) {
    const label = MAP[f.symbol];
    if (label) result.push({ symbol: label, changePct: f.changePct, price: f.price });
  }
  return result;
}

function sign(n: number, threshold = 0.1): "up" | "down" | "flat" {
  if (n > threshold) return "up";
  if (n < -threshold) return "down";
  return "flat";
}

function fmt(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

// ── 3a. Leadership Detection ──

function detectLeadership(equities: EquityFuture[]): { leading: string | null; weakest: string | null } {
  if (equities.length < 2) return { leading: null, weakest: null };
  const sorted = [...equities].sort((a, b) => b.changePct - a.changePct);
  return { leading: sorted[0].symbol, weakest: sorted[sorted.length - 1].symbol };
}

// ── 3b. VIX Cross-Reference (now with daily change + adaptive bounds) ──

function interpretVix(
  avgEquityChange: number,
  vixData: VixData | null,
  vixBounds: VixBounds,
): string {
  if (vixData == null) return "VIX data unavailable — cannot cross-reference fear gauge";

  const vix = vixData.level;
  const equityUp = avgEquityChange > 0.1;
  const equityDown = avgEquityChange < -0.1;

  // Use adaptive bounds instead of hardcoded 17/20
  const vixLow = vix < vixBounds.low;
  const vixHigh = vix > vixBounds.high;

  // VIX direction from daily change (percentage-based for consistent sensitivity across VIX levels)
  const vixRising = vixData.changePct > 3;
  const vixFalling = vixData.changePct < -3;
  const vixDirLabel = vixRising ? " (rising)" : vixFalling ? " (falling)" : "";

  if (equityUp && vixLow && !vixRising) {
    return `Bullish confirmation — risk appetite increasing with low fear${vixDirLabel}`;
  }
  if (equityUp && vixHigh) {
    // Only flag as "suspicious" when futures have meaningful magnitude — a +0.09%
    // move with elevated VIX is noise, not a suspicious rally worth trading against.
    return avgEquityChange > 0.3
      ? `Suspicious rally — elevated fear despite significant positive futures, potential reversal risk${vixDirLabel}`
      : `Weak rally with elevated fear — likely noise, wait for directional clarity${vixDirLabel}`;
  }
  if (equityUp && vixRising) {
    return `Cautious rally — futures up but VIX rising${vixDirLabel}, watch for intraday reversal`;
  }
  if (equityDown && vixHigh) {
    return `Bearish confirmation — selling with elevated fear${vixDirLabel}, watch for acceleration`;
  }
  if (equityDown && vixLow) {
    return `Complacent decline — market down but fear not spiking${vixDirLabel}`;
  }
  if (equityDown && vixRising) {
    return `Fear building — VIX rising${vixDirLabel} alongside selling, likely trend day`;
  }

  // Neutral / moderate VIX
  if (equityUp) return `VIX at ${vix.toFixed(1)}${vixDirLabel} — moderate fear, futures leaning positive`;
  if (equityDown) return `VIX at ${vix.toFixed(1)}${vixDirLabel} — moderate fear, futures leaning negative`;
  return `VIX at ${vix.toFixed(1)}${vixDirLabel} — neutral stance, no strong cross-signal`;
}

// ── 3c. Market Bias Classification ──

function classifyBias(equities: EquityFuture[], biasScore: number): MarketBias {
  // Defensive guard — unreachable from computeTradingBias (which returns null
  // when equities < 2), but kept as a safety net for any future callers.
  if (equities.length < 2) {
    if (biasScore >= 7) return "Strong Bull";
    if (biasScore <= -7) return "Strong Bear";
    return "Neutral";
  }

  // Magnitude gate: tiny moves are noise, not signal.
  // Threshold lowered from 0.15 to 0.08 — pre-market sessions often have
  // legitimate directional signals in the 0.08-0.15% range that were
  // previously masked, causing false Neutral readings on calm mornings.
  const avgAbsChange = equities.reduce((s, e) => s + Math.abs(e.changePct), 0) / equities.length;
  if (avgAbsChange < 0.08) return "Neutral";

  const dirs = equities.map((e) => sign(e.changePct));
  const avgChange = equities.reduce((s, e) => s + e.changePct, 0) / equities.length;

  // Unanimous direction
  if (dirs.every((d) => d === "up")) return "Strong Bull";
  if (dirs.every((d) => d === "down")) return "Strong Bear";

  // Magnitude-weighted direction: a small +0.05% shouldn't offset a large -0.80%.
  // Sum positive and negative contributions separately; one side must outweigh
  // the other by 1.5x to claim majority. This prevents misleading bias when
  // 3 futures are barely positive but 1 is strongly negative (or vice versa).
  const bullWeight = equities.reduce((s, e) => s + Math.max(0, e.changePct), 0);
  const bearWeight = equities.reduce((s, e) => s + Math.max(0, -e.changePct), 0);

  if (bearWeight > bullWeight * 1.5) {
    return avgChange < -1.0 ? "Strong Bear" : "Lean Bear";
  }
  if (bullWeight > bearWeight * 1.5) {
    return avgChange > 1.0 ? "Strong Bull" : "Lean Bull";
  }

  // Count-based override: when 3+ of 4 futures agree on direction (using the
  // sign() threshold), one outlier shouldn't drag the classification to Neutral.
  // e.g., ES +0.06%, NQ -0.70%, RTY +0.40%, YM +0.17% → NQ is the outlier,
  // 3 are positive above threshold → Lean Bull despite NQ pulling avg negative.
  const upCount = dirs.filter((d) => d === "up").length;
  const downCount = dirs.filter((d) => d === "down").length;
  if (upCount >= 3 && equities.length >= 4) return "Lean Bull";
  if (downCount >= 3 && equities.length >= 4) return "Lean Bear";

  // Close call — use average change as tiebreaker (lowered from ±0.3 to ±0.15
  // since pre-market averages are typically 0.1-0.4%, making 0.3 too aggressive)
  if (avgChange > 0.15) return "Lean Bull";
  if (avgChange < -0.15) return "Lean Bear";

  // Fallback to biasScore
  if (biasScore >= 3) return "Lean Bull";
  if (biasScore <= -3) return "Lean Bear";
  return "Neutral";
}

// ── 3d. Confidence Score (redesigned: no dead internals, adds VIX direction + breadth) ──

function computeConfidence(
  equities: EquityFuture[],
  vixData: VixData | null,
  vixBounds: VixBounds,
  avgEquityChange: number,
  bias: MarketBias,
  totalFutures: number,
  sectorBreadth: SectorBreadth | null,
): number {
  let confidence = 0;

  const bullBias = bias === "Strong Bull" || bias === "Lean Bull";
  const bearBias = bias === "Strong Bear" || bias === "Lean Bear";

  // Factor 1: Futures alignment (0-30)
  if (equities.length >= 2) {
    const dirs = equities.map((e) => sign(e.changePct));
    const upCount = dirs.filter((d) => d === "up").length;
    const downCount = dirs.filter((d) => d === "down").length;
    const maxSame = Math.max(upCount, downCount);
    if (maxSame === equities.length) confidence += 30;
    else if (maxSame >= equities.length - 1) confidence += 15;
  }

  // Factor 2: Magnitude (0-20)
  const avgAbsChange = equities.length > 0
    ? equities.reduce((sum, e) => sum + Math.abs(e.changePct), 0) / equities.length
    : 0;
  if (avgAbsChange > 0.8) confidence += 20;
  else if (avgAbsChange > 0.5) confidence += 15;
  else if (avgAbsChange > 0.3) confidence += 10;
  else if (avgAbsChange > 0.1) confidence += 5;

  // Factor 3: VIX confirmation with direction (0-25)
  if (vixData != null) {
    const vixLow = vixData.level < vixBounds.low;
    const vixHigh = vixData.level > vixBounds.high;
    const vixRising = vixData.changePct > 3;
    const vixFalling = vixData.changePct < -3;

    // Level-based confirmation (0-15)
    if ((bullBias && vixLow) || (bearBias && vixHigh)) {
      confidence += 15; // Confirming
    } else if ((bullBias && vixHigh) || (bearBias && vixLow)) {
      confidence += 0; // Contradicting — no points
    } else {
      confidence += 8; // Neutral VIX
    }

    // Direction-based confirmation (0-10)
    if ((bullBias && vixFalling) || (bearBias && vixRising)) {
      confidence += 10; // VIX moving in confirming direction
    } else if ((bullBias && vixRising) || (bearBias && vixFalling)) {
      confidence += 0; // VIX contradicting — no points
    } else {
      confidence += 5; // VIX flat
    }
  }

  // Factor 4: Sector breadth confirmation (0-15, replaces dead internals)
  if (sectorBreadth != null) {
    const { advancing, declining } = sectorBreadth;
    const total = advancing + declining;
    if (total > 0) {
      const advPct = advancing / total;
      if (bullBias && advPct >= 0.6) confidence += 15;
      else if (bullBias && advPct >= 0.5) confidence += 8;
      else if (bearBias && advPct <= 0.4) confidence += 15;
      else if (bearBias && advPct <= 0.5) confidence += 8;
      else confidence += 3; // Mixed breadth
    }
  }

  // Factor 5: Data completeness (0-10)
  // Use equities.length (actual non-null equity futures) not totalFutures (raw count
  // which may include nulls), to avoid inflating the data quality score.
  const dataPoints = equities.length + (vixData != null ? 1 : 0) + (sectorBreadth != null ? 1 : 0);
  const maxDataPoints = 6; // 4 equity futures + VIX + breadth
  confidence += Math.round((dataPoints / maxDataPoints) * 10);

  return Math.min(100, Math.max(0, confidence));
}

// ── 3e. Day Type ──

function classifyDayType(
  equities: EquityFuture[],
  vixData: VixData | null,
  vixBounds: VixBounds,
  avgEquityChange: number,
  sectorBreadth: SectorBreadth | null,
): DayType {
  if (equities.length < 2) return "Uncertain";

  const dirs = equities.map((e) => sign(e.changePct));
  const allSameDir = dirs.every((d) => d === dirs[0]) && dirs[0] !== "flat";
  const avgAbsChange = equities.reduce((s, e) => s + Math.abs(e.changePct), 0) / equities.length;

  // Trend Day: all aligned, high magnitude, confirming VIX or extreme breadth.
  // Threshold lowered from 0.5% to 0.3% — pre-market sessions rarely produce
  // 0.5%+ avg moves, so most strong overnight trends (0.3-0.4%) were classified
  // as "Uncertain" instead of "Trend Day", undercutting the playbook guidance.
  const highMag = avgAbsChange > 0.3;
  const vixConfirms = vixData != null && (
    (avgEquityChange > 0 && vixData.level < vixBounds.low) ||
    (avgEquityChange < 0 && vixData.level > vixBounds.high)
  );
  const vixDirConfirms = vixData != null && (
    (avgEquityChange > 0 && vixData.changePct < -3) ||
    (avgEquityChange < 0 && vixData.changePct > 3)
  );
  const breadthExtreme = sectorBreadth != null && (
    sectorBreadth.ratio >= 0.8 || sectorBreadth.ratio <= 0.2
  );

  if (allSameDir && highMag && (vixConfirms || vixDirConfirms || breadthExtreme)) return "Trend Day";

  // Range Day: mixed direction, low magnitude
  const mixedDir = !allSameDir || dirs[0] === "flat";
  const lowMag = avgAbsChange < 0.2;
  if (mixedDir && lowMag) return "Range Day";

  return "Uncertain";
}

// ── 3f. Best/Worst to Trade (now with directional context) ──

function pickBestWorst(
  equities: EquityFuture[],
  bias: MarketBias,
): { bestToTrade: BestToTradeInfo | null; assetToAvoid: string | null } {
  if (equities.length < 2) return { bestToTrade: null, assetToAvoid: null };

  const isBullish = bias === "Strong Bull" || bias === "Lean Bull";
  const isBearish = bias === "Strong Bear" || bias === "Lean Bear";

  // Don't recommend a specific trade direction when bias is Neutral —
  // defaulting to "long" was misleading and could imply bullish conviction
  // when the system has no directional edge.
  let bestToTrade: BestToTradeInfo | null = null;
  if (isBullish || isBearish) {
    // Sort by direction: bullish → most positive first (best long), bearish → most negative first (best short)
    const sorted = [...equities].sort((a, b) =>
      isBearish ? a.changePct - b.changePct : b.changePct - a.changePct
    );
    const best = sorted[0];
    const direction: "long" | "short" = isBearish ? "short" : "long";
    const reason = isBearish
      ? `weakest at ${fmt(best.changePct)}, most short momentum`
      : `leading at ${fmt(best.changePct)}, most long momentum`;
    bestToTrade = { symbol: best.symbol, direction, reason };
  }

  // Avoid = the futures contract whose changePct deviates most from the group median.
  // Previous approach used sign() direction uniqueness, which caused artifacts like
  // ES +0.06% ("flat") being flagged as avoid instead of NQ -0.70% (the real outlier).
  let assetToAvoid: string | null = null;
  if (equities.length >= 3) {
    const sorted = [...equities].sort((a, b) => a.changePct - b.changePct);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1].changePct + sorted[mid].changePct) / 2
      : sorted[mid].changePct;
    let maxDev = 0;
    for (const e of equities) {
      const dev = Math.abs(e.changePct - median);
      if (dev > maxDev) { maxDev = dev; assetToAvoid = e.symbol; }
    }
    // Only flag if the deviation is meaningful (> 0.15pp from median)
    if (maxDev < 0.15) assetToAvoid = null;
  }

  return { bestToTrade, assetToAvoid };
}

// ── 3g. Preferred Direction ──

function preferredDirection(bias: MarketBias): "Long" | "Short" | "Flat" {
  if (bias === "Strong Bull" || bias === "Lean Bull") return "Long";
  if (bias === "Strong Bear" || bias === "Lean Bear") return "Short";
  return "Flat";
}

// ── 3h. Playbook Generation ──

function generatePlaybook(
  bias: MarketBias,
  dayType: DayType,
  equities: EquityFuture[],
  vixInterp: string,
  leading: string | null,
  weakest: string | null,
): string {
  const avgChange = equities.length > 0
    ? equities.reduce((s, e) => s + e.changePct, 0) / equities.length
    : 0;

  const isSuspicious = vixInterp.startsWith("Suspicious");
  const isComplacent = vixInterp.startsWith("Complacent");
  const isFearBuilding = vixInterp.startsWith("Fear building");
  const isCautiousRally = vixInterp.startsWith("Cautious rally");

  if (isSuspicious) {
    return "Futures are green but VIX is elevated — be cautious. This pattern often precedes intraday reversals. Consider reducing size or waiting for confirmation after the first 30 minutes.";
  }

  if (isCautiousRally) {
    return "Futures lean positive but VIX is rising — the market is pricing in risk despite green tape. Wait for VIX to stabilize before committing to longs. Tighten stops.";
  }

  if (isFearBuilding) {
    return "VIX rising alongside selling — this often leads to a trend day. Stay short-biased and avoid bottom-fishing. Let the market find a floor before adding risk.";
  }

  if (isComplacent) {
    if (bias === "Strong Bear" || bias === "Lean Bear") {
      return "Selling is orderly with VIX staying low — no panic yet, but don't mistake complacency for a floor. Stay short-biased and watch for failed bounces at resistance.";
    }
    return "Market is down but fear is not spiking — possible bounce setup. Watch for a failed breakdown at key support. Keep stops tight if going long.";
  }

  if (bias === "Strong Bull" && dayType === "Trend Day") {
    return `All equity futures aligned to the upside with confirming internals. Look for pullback entries in leading sectors. Set trailing stops — trend days rarely reverse.`;
  }

  if (bias === "Strong Bull") {
    return `Broad strength across equity futures (avg ${fmt(avgChange)}). Favor long setups in momentum leaders. Monitor breadth for confirmation as the session opens.`;
  }

  if (bias === "Lean Bull" && leading === "NQ") {
    const nq = equities.find((e) => e.symbol === "NQ");
    return `Tech/growth leading this morning${nq ? " — " + fmt(nq.changePct) : ""}. Focus on high-beta growth names.${weakest ? ` Watch ${weakest} for rotation clues.` : ""}`;
  }

  if (bias === "Lean Bull" && leading === "YM") {
    return `Value/defensives leading with Dow futures out front. Favor large-cap value and dividend names.${weakest ? ` ${weakest} lagging — growth may underperform.` : ""}`;
  }

  if (bias === "Lean Bull" && dayType === "Range Day") {
    return `Futures lean positive but low magnitude — likely a choppy, range-bound session. Fade extremes, buy dips near support, and keep position sizes small until a directional breakout appears.`;
  }

  if (bias === "Lean Bull") {
    return `Futures lean positive but not all aligned. Be selective with longs — favor names in leading sectors. Keep position sizes moderate until more signals confirm.`;
  }

  if (bias === "Strong Bear" && dayType === "Trend Day") {
    return `Broad selling with ${fmt(avgChange)} across all equity futures. Avoid bottom-fishing. Let the market find support before considering longs.`;
  }

  if (bias === "Strong Bear") {
    return `All equity futures pointing lower. Reduce exposure and avoid catching falling knives. Wait for a successful retest of support before adding risk.`;
  }

  if (bias === "Lean Bear" && weakest === "NQ") {
    const nq = equities.find((e) => e.symbol === "NQ");
    return `Growth/tech leading the selling${nq ? " — NQ " + fmt(nq.changePct) : ""}. Trim high-beta growth exposure and tighten stops. Value may hold up better.`;
  }

  if (bias === "Lean Bear" && weakest === "RTY") {
    return `Small-caps weakest — risk appetite fading. Trim speculative positions and favor large-cap quality names if staying long.`;
  }

  if (bias === "Lean Bear" && dayType === "Range Day") {
    return `Futures lean negative but low magnitude — expect choppy conditions. Avoid aggressive shorts. Look for failed breakdowns to fade and keep stops tight on any direction.`;
  }

  if (bias === "Lean Bear") {
    return `Futures lean negative${weakest ? ` with ${weakest} weakest` : ""}. Trim weak positions and tighten stops. Look for short setups only on confirmed breakdowns.`;
  }

  // Neutral
  if (dayType === "Range Day") {
    return "Mixed signals across futures. Fade extremes and keep position sizes small. Wait for the first 30-min range to establish before committing.";
  }

  return "No clear directional edge — mixed futures and unclear signals. Stay patient, keep sizing small, and wait for a catalyst to break the stalemate.";
}

// ── 3i. Why This Bias Reasons ──

function buildReasons(
  equities: EquityFuture[],
  vixData: VixData | null,
  vixBounds: VixBounds,
  leading: string | null,
  weakest: string | null,
  sectorBreadth: SectorBreadth | null,
): string[] {
  const reasons: string[] = [];

  // Equity summary
  if (equities.length > 0) {
    const parts = equities.map((e) => `${e.symbol} ${fmt(e.changePct)}`).join(", ");
    const dirs = equities.map((e) => sign(e.changePct));
    const allUp = dirs.every((d) => d === "up");
    const allDown = dirs.every((d) => d === "down");
    const suffix = allUp ? " — broad equity strength" : allDown ? " — broad equity weakness" : " — mixed signals";
    reasons.push(parts + suffix);
  }

  // Leadership gap
  if (leading && weakest && equities.length >= 2) {
    const lead = equities.find((e) => e.symbol === leading);
    const weak = equities.find((e) => e.symbol === weakest);
    if (lead && weak) {
      const gap = Math.abs(lead.changePct - weak.changePct);
      if (gap > 0.1) {
        const leaderType = leading === "NQ" ? "growth appetite" : leading === "YM" ? "value/safety preference" : leading === "RTY" ? "small-cap risk appetite" : "broad leadership";
        reasons.push(`${leading} leading by ${gap.toFixed(2)}pp — ${leaderType}`);
      }
    }
  }

  // VIX with direction
  if (vixData != null) {
    const vixLevel = vixData.level < vixBounds.low ? "low fear" :
      vixData.level > vixBounds.high * 1.25 ? "elevated fear" :
        vixData.level > vixBounds.high ? "above-average fear" : "moderate fear";
    const vixDir = vixData.changePct > 3 ? `, rising ${fmt(vixData.changePct)}` :
      vixData.changePct < -3 ? `, falling ${fmt(vixData.changePct)}` : "";
    reasons.push(`VIX at ${vixData.level.toFixed(1)} — ${vixLevel} environment${vixDir}`);
  }

  // Sector breadth (replaces dead TICK/TRIN/ADD)
  if (sectorBreadth != null) {
    const { advancing, declining } = sectorBreadth;
    const total = advancing + declining;
    if (total > 0) {
      const breadthLabel = advancing > declining * 2 ? "strong breadth" :
        advancing > declining ? "positive breadth" :
          declining > advancing * 2 ? "weak breadth" :
            declining > advancing ? "negative breadth" : "neutral breadth";
      reasons.push(`${advancing} of ${total} sector ETFs advancing — ${breadthLabel}`);
    }
  }

  // Alignment count (with annotation for near-threshold futures)
  if (equities.length >= 3) {
    const dirs = equities.map((e) => sign(e.changePct));
    const upCount = dirs.filter((d) => d === "up").length;
    const downCount = dirs.filter((d) => d === "down").length;
    const flatCount = dirs.filter((d) => d === "flat").length;
    const maxSame = Math.max(upCount, downCount);
    const dirLabel = upCount > downCount ? "bullish" : "bearish";
    // Annotate which futures are below the 0.1% threshold (classified as "flat")
    const flatNames = equities
      .filter((e) => sign(e.changePct) === "flat")
      .map((e) => e.symbol);
    const annotation = flatCount > 0
      ? ` (${flatNames.join(", ")} below threshold)`
      : "";
    reasons.push(`${maxSame} of ${equities.length} equity futures aligned ${dirLabel}${annotation}`);
  }

  return reasons.slice(0, 6);
}

// ── Main Export ──

export function computeTradingBias(
  futures: FuturesSnapshot[],
  vixData: VixData | null,
  biasScore: number,
  sectorBreadth?: SectorBreadth | null,
  vixBounds?: VixBounds | null,
): TradingBias | null {
  const equities = extractEquityFutures(futures);

  // Need at least 2 equity futures to produce a meaningful bias
  if (equities.length < 2) return null;

  const bounds: VixBounds = vixBounds ?? PREMARKET_SCORING.DEFAULT_VIX_BOUNDS;
  const breadth = sectorBreadth ?? null;
  const avgEquityChange = equities.reduce((s, e) => s + e.changePct, 0) / equities.length;

  const { leading, weakest } = detectLeadership(equities);
  const vixInterp = interpretVix(avgEquityChange, vixData, bounds);
  const bias = classifyBias(equities, biasScore);
  const confidence = computeConfidence(equities, vixData, bounds, avgEquityChange, bias, futures.length, breadth);
  const dayType = classifyDayType(equities, vixData, bounds, avgEquityChange, breadth);
  const { bestToTrade, assetToAvoid } = pickBestWorst(equities, bias);
  const direction = preferredDirection(bias);
  const playbook = generatePlaybook(bias, dayType, equities, vixInterp, leading, weakest);
  const whyThisBias = buildReasons(equities, vixData, bounds, leading, weakest, breadth);

  return {
    bias,
    confidence,
    preferredDirection: direction,
    leadingAsset: leading,
    weakestAsset: weakest,
    bestToTrade,
    assetToAvoid,
    dayType,
    vixInterpretation: vixInterp,
    playbook,
    whyThisBias,
    biasConflict: false, // set by API route after comparing with macro bias label
  };
}
