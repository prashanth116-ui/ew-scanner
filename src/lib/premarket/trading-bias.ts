/**
 * Pre-Market Trading Bias Engine.
 * Computes structured trading bias from futures, internals, VIX, and existing bias score.
 * Pure functions — no side effects, no fetching.
 */

import type { FuturesSnapshot, InternalsSnapshot, TradingBias, MarketBias, DayType } from "./types";

// ── Helpers ──

interface EquityFuture {
  symbol: string;   // "ES" | "NQ" | "YM"
  changePct: number;
  price: number;
}

function extractEquityFutures(futures: FuturesSnapshot[]): EquityFuture[] {
  const MAP: Record<string, string> = { "ES=F": "ES", "NQ=F": "NQ", "YM=F": "YM" };
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

// ── 3b. VIX Cross-Reference ──

function interpretVix(avgEquityChange: number, vix: number | null): string {
  if (vix == null) return "VIX data unavailable — cannot cross-reference fear gauge";

  const equityUp = avgEquityChange > 0.1;
  const equityDown = avgEquityChange < -0.1;

  // Determine VIX direction from level (simplified — we don't have VIX change, so use level bands)
  // VIX < 15 = low/declining, VIX 15-20 = moderate, VIX > 20 = elevated/rising
  const vixLow = vix < 17;
  const vixHigh = vix > 20;

  if (equityUp && vixLow) {
    return "Bullish confirmation — risk appetite increasing with low fear";
  }
  if (equityUp && vixHigh) {
    return "Suspicious rally — rising fear despite positive futures, potential reversal risk";
  }
  if (equityDown && vixHigh) {
    return "Bearish confirmation — selling with elevated fear, watch for acceleration";
  }
  if (equityDown && vixLow) {
    return "Complacent decline — market down but fear not spiking, possible bounce setup";
  }

  // Neutral / moderate VIX
  if (equityUp) return `VIX at ${vix.toFixed(1)} — moderate fear, futures leaning positive`;
  if (equityDown) return `VIX at ${vix.toFixed(1)} — moderate fear, futures leaning negative`;
  return `VIX at ${vix.toFixed(1)} — neutral stance, no strong cross-signal`;
}

// ── 3c. Market Bias Classification ──

function classifyBias(equities: EquityFuture[], biasScore: number): MarketBias {
  if (equities.length < 2) {
    // Fallback to biasScore
    if (biasScore >= 6) return "Strong Bull";
    if (biasScore >= 3) return "Lean Bull";
    if (biasScore <= -6) return "Strong Bear";
    if (biasScore <= -3) return "Lean Bear";
    return "Neutral";
  }

  const dirs = equities.map((e) => sign(e.symbol === "NQ" ? e.changePct : e.changePct));
  const allUp = dirs.every((d) => d === "up");
  const allDown = dirs.every((d) => d === "down");

  if (allUp) return "Strong Bull";
  if (allDown) return "Strong Bear";

  // Leadership patterns
  const sorted = [...equities].sort((a, b) => b.changePct - a.changePct);
  const leader = sorted[0];
  const laggard = sorted[sorted.length - 1];

  // NQ leading with meaningful gap
  if (leader.symbol === "NQ" && leader.changePct > 0.3) return "Lean Bull";
  // YM leading (value/safety)
  if (leader.symbol === "YM" && leader.changePct > 0.3) return "Lean Bull";

  // NQ weakest with meaningful selling
  if (laggard.symbol === "NQ" && laggard.changePct < -0.3) return "Lean Bear";

  // Fallback to biasScore
  if (biasScore >= 3) return "Lean Bull";
  if (biasScore <= -3) return "Lean Bear";
  return "Neutral";
}

// ── 3d. Confidence Score ──

function computeConfidence(
  equities: EquityFuture[],
  internals: InternalsSnapshot,
  vix: number | null,
  avgEquityChange: number,
  bias: MarketBias,
  totalFutures: number,
): number {
  let confidence = 0;

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

  // Factor 3: VIX confirmation (0-20)
  if (vix != null) {
    const bullBias = bias === "Strong Bull" || bias === "Lean Bull";
    const bearBias = bias === "Strong Bear" || bias === "Lean Bear";
    const vixLow = vix < 17;
    const vixHigh = vix > 20;

    if ((bullBias && vixLow) || (bearBias && vixHigh)) {
      confidence += 20; // Confirming
    } else if ((bullBias && vixHigh) || (bearBias && vixLow)) {
      confidence += 5; // Suspicious / contradicting
    } else {
      confidence += 10; // Neutral VIX
    }
  }

  // Factor 4: Internals alignment (0-15)
  const isBullBias = avgEquityChange > 0.1;
  const isBearBias = avgEquityChange < -0.1;
  let internalsConfirm = 0;
  if (internals.tick != null) {
    if ((isBullBias && internals.tick > 200) || (isBearBias && internals.tick < -200)) internalsConfirm++;
  }
  if (internals.trin != null) {
    if ((isBullBias && internals.trin < 1.0) || (isBearBias && internals.trin > 1.0)) internalsConfirm++;
  }
  if (internals.addLine != null) {
    if ((isBullBias && internals.addLine > 0) || (isBearBias && internals.addLine < 0)) internalsConfirm++;
  }
  const internalsAvailable = [internals.tick, internals.trin, internals.addLine].filter((v) => v != null).length;
  if (internalsAvailable > 0) {
    if (internalsConfirm === internalsAvailable) confidence += 15;
    else if (internalsConfirm >= 2) confidence += 10;
    else if (internalsConfirm >= 1) confidence += 5;
  }

  // Factor 5: Data completeness (0-15)
  const dataPoints = totalFutures + internalsAvailable + (vix != null ? 1 : 0);
  const maxDataPoints = 10; // 6 futures + 3 internals + 1 VIX
  confidence += Math.round((dataPoints / maxDataPoints) * 15);

  return Math.min(100, Math.max(0, confidence));
}

// ── 3e. Day Type ──

function classifyDayType(
  equities: EquityFuture[],
  internals: InternalsSnapshot,
  vix: number | null,
  avgEquityChange: number,
): DayType {
  if (equities.length < 2) return "Uncertain";

  const dirs = equities.map((e) => sign(e.changePct));
  const allSameDir = dirs.every((d) => d === dirs[0]) && dirs[0] !== "flat";
  const avgAbsChange = equities.reduce((s, e) => s + Math.abs(e.changePct), 0) / equities.length;

  // Trend Day: all aligned, high magnitude, confirming VIX, extreme TICK
  const highMag = avgAbsChange > 0.5;
  const vixConfirms = vix != null && (
    (avgEquityChange > 0 && vix < 17) || (avgEquityChange < 0 && vix > 20)
  );
  const tickExtreme = internals.tick != null && (internals.tick > 500 || internals.tick < -500);

  if (allSameDir && highMag && (vixConfirms || tickExtreme)) return "Trend Day";

  // Range Day: mixed direction, low magnitude
  const mixedDir = !allSameDir || dirs[0] === "flat";
  const lowMag = avgAbsChange < 0.2;
  if (mixedDir && lowMag) return "Range Day";

  return "Uncertain";
}

// ── 3f. Best/Worst to Trade ──

function pickBestWorst(equities: EquityFuture[]): { bestToTrade: string | null; assetToAvoid: string | null } {
  if (equities.length < 2) return { bestToTrade: null, assetToAvoid: null };

  // Best = highest absolute changePct (most momentum)
  const sorted = [...equities].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const bestToTrade = sorted[0].symbol;

  // Avoid = the one diverging from the other two
  if (equities.length >= 3) {
    const dirs = equities.map((e) => ({ sym: e.symbol, dir: sign(e.changePct) }));
    const counts: Record<string, string[]> = {};
    for (const d of dirs) {
      (counts[d.dir] ??= []).push(d.sym);
    }
    // Find the direction with only 1 member (the odd one out)
    for (const [, syms] of Object.entries(counts)) {
      if (syms.length === 1) return { bestToTrade, assetToAvoid: syms[0] };
    }
  }

  return { bestToTrade, assetToAvoid: null };
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

  if (isSuspicious) {
    return "Futures are green but VIX is elevated — be cautious. This pattern often precedes intraday reversals. Consider reducing size or waiting for confirmation after the first 30 minutes.";
  }

  if (isComplacent) {
    return "Market is down but fear is not spiking — possible bounce setup. Watch for a failed breakdown at key support. Keep stops tight if going long.";
  }

  if (bias === "Strong Bull" && dayType === "Trend Day") {
    return `All equity futures aligned to the upside with confirming internals. Look for pullback entries in leading sectors. Set trailing stops — trend days rarely reverse.`;
  }

  if (bias === "Strong Bull") {
    return `Broad strength across equity futures (avg ${fmt(avgChange)}). Favor long setups in momentum leaders. Monitor internals for confirmation as the session opens.`;
  }

  if (bias === "Lean Bull" && leading === "NQ") {
    const nq = equities.find((e) => e.symbol === "NQ");
    return `Tech/growth leading this morning${nq ? " — " + fmt(nq.changePct) : ""}. Focus on high-beta growth names.${weakest ? ` Watch ${weakest} for rotation clues.` : ""}`;
  }

  if (bias === "Lean Bull" && leading === "YM") {
    return `Value/defensives leading with Dow futures out front. Favor large-cap value and dividend names.${weakest ? ` ${weakest} lagging — growth may underperform.` : ""}`;
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

  if (bias === "Lean Bear") {
    return `Futures lean negative${weakest ? ` with ${weakest} weakest` : ""}. Trim weak positions and tighten stops. Look for short setups only on confirmed breakdowns.`;
  }

  // Neutral
  if (dayType === "Range Day") {
    return "Mixed signals across futures. Fade extremes and keep position sizes small. Wait for the first 30-min range to establish before committing.";
  }

  return "No clear directional edge — mixed futures and unclear internals. Stay patient, keep sizing small, and wait for a catalyst to break the stalemate.";
}

// ── 3i. Why This Bias Reasons ──

function buildReasons(
  equities: EquityFuture[],
  internals: InternalsSnapshot,
  vix: number | null,
  leading: string | null,
  weakest: string | null,
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
        const leaderType = leading === "NQ" ? "growth appetite" : leading === "YM" ? "value/safety preference" : "broad leadership";
        reasons.push(`${leading} leading by ${gap.toFixed(2)}pp — ${leaderType}`);
      }
    }
  }

  // VIX
  if (vix != null) {
    const vixLevel = vix < 15 ? "low fear" : vix > 25 ? "elevated fear" : vix > 20 ? "above-average fear" : "moderate fear";
    reasons.push(`VIX at ${vix.toFixed(1)} — ${vixLevel} environment`);
  }

  // TICK
  if (internals.tick != null) {
    const tickLabel = internals.tick > 500 ? "strong buying pressure" :
      internals.tick < -500 ? "strong selling pressure" :
        internals.tick > 200 ? "moderate buying pressure" :
          internals.tick < -200 ? "moderate selling pressure" : "neutral";
    reasons.push(`TICK at ${internals.tick > 0 ? "+" : ""}${Math.round(internals.tick)} — ${tickLabel}`);
  }

  // TRIN
  if (internals.trin != null) {
    const trinLabel = internals.trin < 0.8 ? "bullish breadth" : internals.trin > 1.2 ? "bearish breadth" : "neutral breadth";
    reasons.push(`TRIN at ${internals.trin.toFixed(2)} — ${trinLabel}`);
  }

  // Alignment count
  if (equities.length >= 3) {
    const dirs = equities.map((e) => sign(e.changePct));
    const upCount = dirs.filter((d) => d === "up").length;
    const downCount = dirs.filter((d) => d === "down").length;
    const maxSame = Math.max(upCount, downCount);
    const dirLabel = upCount > downCount ? "bullish" : "bearish";
    reasons.push(`${maxSame} of ${equities.length} equity futures aligned ${dirLabel}`);
  }

  return reasons.slice(0, 5);
}

// ── Main Export ──

export function computeTradingBias(
  futures: FuturesSnapshot[],
  internals: InternalsSnapshot,
  vix: number | null,
  biasScore: number,
): TradingBias | null {
  const equities = extractEquityFutures(futures);

  // Need at least 2 equity futures to produce a meaningful bias
  if (equities.length < 2) return null;

  const avgEquityChange = equities.reduce((s, e) => s + e.changePct, 0) / equities.length;

  const { leading, weakest } = detectLeadership(equities);
  const vixInterp = interpretVix(avgEquityChange, vix);
  const bias = classifyBias(equities, biasScore);
  const confidence = computeConfidence(equities, internals, vix, avgEquityChange, bias, futures.length);
  const dayType = classifyDayType(equities, internals, vix, avgEquityChange);
  const { bestToTrade, assetToAvoid } = pickBestWorst(equities);
  const direction = preferredDirection(bias);
  const playbook = generatePlaybook(bias, dayType, equities, vixInterp, leading, weakest);
  const whyThisBias = buildReasons(equities, internals, vix, leading, weakest);

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
  };
}
