/**
 * Shared client-side utilities for earnings pages.
 * Computes insights from earnings data and cross-references scanner watchlists.
 */

import { loadScans } from "./ew-watchlist";
import { loadSqueezeWatchlists } from "./squeeze-watchlists";
import { loadPreRunWatchlist } from "./prerun/storage";
import { loadStratWatchlists } from "./strat/watchlist";
import type { ConfluenceScanResult, ConfluenceResult } from "./confluence/types";
import { DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS } from "./confluence/types";
import { computeConfluenceScore, classifySignal, deriveConfluenceBias, applyStratModifier } from "./confluence/scoring";
import { getSectorForSymbol } from "@/data/sector-universe";
import type { SectorRotationScore } from "./sector-rotation/types";

// ── Types ──

export interface BeatStreakResult {
  streak: number;
  totalBeats: number;
  totalQuarters: number;
}

export interface InsiderSummary {
  netValue: number;
  label: string;
  sentiment: "buying" | "selling" | "neutral";
}

export type EstimateTrend = "rising" | "stable" | "falling";

export interface PlaybookSignal {
  text: string;
  bullish: boolean;
}

export interface PlaybookResult {
  bias: "bullish" | "bearish" | "neutral";
  signals: PlaybookSignal[];
  bullishCount: number;
  bearishCount: number;
}

export interface MomentumQuality {
  rsAcceleration: number;
  rsImproving: boolean;
  rsDelta: number;
  volumeConsistency: number;
}

export interface EarningsPreRunDetail {
  data: {
    putCallRatio: number | null;
    avgVolumeUpDays: number | null;
    avgVolumeDownDays: number | null;
    pctFromAth: number | null;
    shortFloat: number | null;
    daysToEarnings: number | null;
    emaM2TrendStrength: "strong" | "moderate" | "weak" | "bearish" | null;
    emaM2BullishCross: boolean | null;
    emaM2PriceAboveBoth: boolean | null;
    emaM2DisplacementNearCross: boolean | null;
    emaM2FvgNearCross: boolean | null;
    emaM2CrossedWithin5Bars: boolean | null;
    higherLowsCount: number | null;
    closesNearRangeTop: boolean | null;
    atrContracting: boolean | null;
    failedBreakdownRecovery: number | null;
    analystRevisionTrend: number | null;
  };
  gates: { gate1: boolean; gate2: boolean; gate3: boolean };
  scores: {
    scoreA: number; scoreB: number; scoreC: number; scoreD: number;
    scoreE: number; scoreF: number; scoreG: number; scoreH: number;
    scoreI: number; scoreJ: number; scoreK: number; scoreL: number;
    scoreM: number; scoreM2: number; scoreN: number; scoreO: number;
    scoreP: number; scoreQ: number;
    sectorModifier: number; sectorQuadrant: number;
    totalScore: number; finalScore: number;
  };
  verdict: string;
  gate1Bypassed?: boolean;
}

export interface EarningsEdgeSignals {
  putCallRatio: number | null;
  optionsFlow: "bullish" | "neutral" | "bearish";
  ftdImminent: boolean;
  ftdTotalShares: number;
  ftdNearestDeadline: string | null;
  hasGammaTrigger: boolean;
  nearestGammaStrike: number | null;
  gammaAbovePrice: boolean;
  volumeRatio: number | null;
  volumePattern: "accumulation" | "distribution" | "neutral";
  regime: "strong_bull" | "bull" | "bear" | "neutral";
}

// ── 1a-pre. Earnings Edge ──

/* eslint-disable @typescript-eslint/no-explicit-any */
export function computeEarningsEdge(
  prerun: EarningsPreRunDetail | null,
  ftdBody: any,
  gammaBody: any,
  regimeBody: any,
  ticker: string,
  currentPrice: number | null,
): EarningsEdgeSignals {
  // Options flow
  const pcr = prerun?.data.putCallRatio ?? null;
  const optionsFlow: EarningsEdgeSignals["optionsFlow"] =
    pcr != null ? (pcr < 0.5 ? "bullish" : pcr > 1.0 ? "bearish" : "neutral") : "neutral";

  // FTD
  let ftdImminent = false;
  let ftdTotalShares = 0;
  let ftdNearestDeadline: string | null = null;
  if (ftdBody?.calendar) {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    for (const week of ftdBody.calendar) {
      for (const entry of week.entries ?? []) {
        if (entry.ticker !== ticker) continue;
        ftdTotalShares += entry.ftd_shares ?? 0;
        const dl = new Date(entry.settlement_deadline).getTime();
        if (dl - now <= sevenDays && dl >= now) {
          ftdImminent = true;
          if (!ftdNearestDeadline || entry.settlement_deadline < ftdNearestDeadline) {
            ftdNearestDeadline = entry.settlement_deadline;
          }
        }
      }
    }
  }

  // Gamma
  let hasGammaTrigger = false;
  let nearestGammaStrike: number | null = null;
  let gammaAbovePrice = false;
  if (gammaBody?.gamma?.[ticker]) {
    const g = gammaBody.gamma[ticker];
    hasGammaTrigger = g.hasGammaTrigger ?? false;
    nearestGammaStrike = g.nearestGammaStrike ?? null;
    if (nearestGammaStrike != null && currentPrice != null) {
      gammaAbovePrice = nearestGammaStrike > currentPrice;
    }
  }

  // Volume
  const upVol = prerun?.data.avgVolumeUpDays ?? null;
  const downVol = prerun?.data.avgVolumeDownDays ?? null;
  let volumeRatio: number | null = null;
  let volumePattern: EarningsEdgeSignals["volumePattern"] = "neutral";
  if (upVol != null && downVol != null && downVol > 0) {
    volumeRatio = upVol / downVol;
    volumePattern = volumeRatio > 1.0 ? "accumulation" : volumeRatio < 0.8 ? "distribution" : "neutral";
  }

  // Regime
  let regime: EarningsEdgeSignals["regime"] = "neutral";
  if (regimeBody?.available && regimeBody.regime) {
    regime = regimeBody.regime;
  }

  return {
    putCallRatio: pcr,
    optionsFlow,
    ftdImminent,
    ftdTotalShares,
    ftdNearestDeadline,
    hasGammaTrigger,
    nearestGammaStrike,
    gammaAbovePrice,
    volumeRatio,
    volumePattern,
    regime,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── 1a. Beat Streak ──

interface EarningsQuarterInput {
  epsSurprise: number | null;
}

export function computeBeatStreak(history: EarningsQuarterInput[]): BeatStreakResult {
  let streak = 0;
  let totalBeats = 0;
  let streakBroken = false;

  for (const q of history) {
    if (q.epsSurprise != null && q.epsSurprise > 0) {
      totalBeats++;
      if (!streakBroken) streak++;
    } else {
      streakBroken = true;
    }
  }

  return { streak, totalBeats, totalQuarters: history.length };
}

// ── 1b. Insider Summary ──

interface InsiderTransactionInput {
  date: string;
  shares: number | null;
  value: number | null;
  text: string;
}

export function computeInsiderSummary(transactions: InsiderTransactionInput[]): InsiderSummary {
  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  let netValue = 0;
  let hasActivity = false;

  for (const t of transactions) {
    const txDate = new Date(t.date).getTime();
    if (now - txDate > ninetyDays) continue;
    if (t.value == null) continue;

    hasActivity = true;
    const lower = t.text.toLowerCase();
    const isSale = lower.includes("sale") || (t.shares != null && t.shares < 0);
    const isPurchase = lower.includes("purchase") || (t.shares != null && t.shares > 0 && !lower.includes("exercise"));

    if (isPurchase) {
      netValue += Math.abs(t.value);
    } else if (isSale) {
      netValue -= Math.abs(t.value);
    }
  }

  if (!hasActivity) {
    return { netValue: 0, label: "No recent insider activity", sentiment: "neutral" };
  }

  const absVal = Math.abs(netValue);
  const formatted = absVal >= 1e6
    ? `$${(absVal / 1e6).toFixed(1)}M`
    : absVal >= 1e3
      ? `$${(absVal / 1e3).toFixed(0)}K`
      : `$${absVal.toFixed(0)}`;

  if (netValue > 0) {
    return { netValue, label: `${formatted} net buying last 90d`, sentiment: "buying" };
  } else if (netValue < 0) {
    return { netValue, label: `${formatted} net selling last 90d`, sentiment: "selling" };
  }
  return { netValue: 0, label: "Neutral insider activity last 90d", sentiment: "neutral" };
}

// ── 1c. Estimate Trend ──

interface EstimateInput {
  period: string;
  epsAvg: number | null;
  epsHigh: number | null;
  epsLow: number | null;
}

export function computeEstimateTrend(estimates: EstimateInput[]): EstimateTrend {
  const currentQtr = estimates.find((e) => e.period.toLowerCase().includes("current q"));
  const nextQtr = estimates.find((e) => e.period.toLowerCase().includes("next q"));

  if (!currentQtr?.epsAvg || !nextQtr?.epsAvg) {
    // Fall back to range position for current quarter
    if (currentQtr?.epsAvg != null && currentQtr.epsHigh != null && currentQtr.epsLow != null) {
      const range = currentQtr.epsHigh - currentQtr.epsLow;
      if (range > 0) {
        const position = (currentQtr.epsAvg - currentQtr.epsLow) / range;
        if (position >= 0.65) return "rising";
        if (position <= 0.35) return "falling";
      }
    }
    return "stable";
  }

  const growth = (nextQtr.epsAvg - currentQtr.epsAvg) / Math.abs(currentQtr.epsAvg);
  if (growth > 0.05) return "rising";
  if (growth < -0.05) return "falling";
  return "stable";
}

// ── 1d. Enrich Scan Results ──

export function enrichScanResults(
  rawResults: ConfluenceScanResult[],
  sectorScores: SectorRotationScore[],
  rotationStocks: Map<string, MomentumQuality>,
): ConfluenceResult[] {
  // Build sector lookup: displayName -> SectorRotationScore
  const sectorMap = new Map<string, SectorRotationScore>();
  for (const s of sectorScores) {
    sectorMap.set(s.sector, s);
  }

  return rawResults.map((r) => {
    const sector = getSectorForSymbol(r.ticker);
    const sectorInfo = sectorMap.get(sector) ?? null;

    const ewNorm = r.ewResult ? r.ewResult.enhancedNormalized : null;
    const squeezeNorm = r.squeezeResult ? r.squeezeResult.squeezeScore / 100 : null;
    const prerunNorm = r.prerunResult ? r.prerunResult.finalScore / 24 : null;
    const sectorNorm = sectorInfo ? sectorInfo.compositeScore / 100 : null;

    const scores = computeConfluenceScore(
      ewNorm, squeezeNorm, prerunNorm, sectorNorm,
      DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS,
    );

    const sectorQuadrant = sectorInfo?.quadrant ?? null;
    const bias = deriveConfluenceBias(scores, sectorQuadrant);
    const { adjustedScore, stratBonus } = applyStratModifier(scores.confluenceScore, r.stratResult ?? null, bias);
    const adjustedScores = { ...scores, confluenceScore: adjustedScore };
    const signal = classifySignal(adjustedScores);

    const momentumQuality = rotationStocks.get(r.ticker) ?? null;

    return {
      ticker: r.ticker,
      name: r.name || r.ticker,
      sector,
      price: r.price,
      scores: adjustedScores,
      signal,
      ewResult: r.ewResult,
      squeezeResult: r.squeezeResult,
      prerunResult: r.prerunResult,
      sectorResult: sectorInfo ? {
        compositeScore: sectorInfo.compositeScore,
        quadrant: sectorInfo.quadrant,
        trend: sectorInfo.trend,
      } : null,
      stratResult: r.stratResult ?? null,
      stratBonus: stratBonus !== 0 ? stratBonus : undefined,
      momentumQuality,
    };
  });
}

// ── 1e. Playbook ──

export function computePlaybook(
  beatStreak: BeatStreakResult,
  trend: EstimateTrend,
  insiderSummary: InsiderSummary,
  scanResult: ConfluenceResult | null,
  prerunDetail?: EarningsPreRunDetail | null,
): PlaybookResult {
  const signals: PlaybookSignal[] = [];

  // Beat streak signals
  if (beatStreak.streak >= 3) {
    signals.push({ text: `${beatStreak.streak}Q consecutive EPS beat streak`, bullish: true });
  } else if (beatStreak.streak === 0 && beatStreak.totalQuarters > 0) {
    signals.push({ text: "No recent EPS beats", bullish: false });
  }

  // Estimate trend signals
  if (trend === "rising") {
    signals.push({ text: "Analyst estimates trending higher", bullish: true });
  } else if (trend === "falling") {
    signals.push({ text: "Analyst estimates trending lower", bullish: false });
  }

  // Insider signals
  if (insiderSummary.sentiment === "buying") {
    signals.push({ text: insiderSummary.label, bullish: true });
  } else if (insiderSummary.sentiment === "selling") {
    signals.push({ text: insiderSummary.label, bullish: false });
  }

  // Scanner signals
  if (scanResult) {
    const { ewResult, squeezeResult, prerunResult, stratResult } = scanResult;

    if (ewResult) {
      const wave = ewResult.wavePosition?.toLowerCase() ?? "";
      if (wave.includes("2") || wave.includes("4")) {
        signals.push({ text: `EW ${ewResult.wavePosition} — corrective wave (potential entry)`, bullish: true });
      }
    }

    if (squeezeResult) {
      if (squeezeResult.tier === "high") {
        signals.push({ text: `High squeeze score (${squeezeResult.squeezeScore.toFixed(0)})`, bullish: true });
      }
    }

    if (prerunResult) {
      if (prerunResult.verdict === "PRIORITY" || prerunResult.verdict === "KEEP") {
        signals.push({ text: `Pre-Run verdict: ${prerunResult.verdict}`, bullish: true });
      } else if (prerunResult.verdict === "DISCARD") {
        signals.push({ text: "Pre-Run verdict: DISCARD", bullish: false });
      }
    }

    if (stratResult) {
      if (stratResult.signal === "ACTIONABLE" && stratResult.actionDirection === "LONG") {
        signals.push({ text: "Strat: ACTIONABLE LONG", bullish: true });
      } else if (stratResult.signal === "ACTIONABLE" && stratResult.actionDirection === "SHORT") {
        signals.push({ text: "Strat: ACTIONABLE SHORT", bullish: false });
      }
    }

    // Sector quadrant signals
    if (scanResult.sectorResult) {
      const q = scanResult.sectorResult.quadrant;
      if (q === "LEADING") {
        signals.push({ text: `Sector: ${scanResult.sector} (LEADING)`, bullish: true });
      } else if (q === "LAGGING") {
        signals.push({ text: `Sector: ${scanResult.sector} (LAGGING)`, bullish: false });
      }
    }

    // Momentum quality signals
    if (scanResult.momentumQuality) {
      const mq = scanResult.momentumQuality;
      if (mq.rsImproving && mq.volumeConsistency >= 3) {
        signals.push({ text: "Momentum: RS improving with volume support", bullish: true });
      }
    }

    // Analyst revision trend from pre-run detail
    if (prerunDetail?.data.analystRevisionTrend === 1) {
      signals.push({ text: "Analyst revisions trending UP", bullish: true });
    } else if (prerunDetail?.data.analystRevisionTrend === -1) {
      signals.push({ text: "Analyst revisions trending DOWN", bullish: false });
    }

    // Confluence signal strength
    if (scanResult.signal === "strong") {
      signals.push({ text: `Confluence: STRONG (${(scanResult.scores.confluenceScore * 100).toFixed(0)}%)`, bullish: true });
    } else if (scanResult.signal === "none") {
      signals.push({ text: "Confluence: NONE — no scanner alignment", bullish: false });
    }
  }

  const bullishCount = signals.filter((s) => s.bullish).length;
  const bearishCount = signals.filter((s) => !s.bullish).length;

  let bias: PlaybookResult["bias"] = "neutral";
  if (bullishCount > bearishCount + 1) bias = "bullish";
  else if (bearishCount > bullishCount + 1) bias = "bearish";

  return { bias, signals, bullishCount, bearishCount };
}

// ── 1f. Watchlist Aggregation ──

export function getAllWatchlistTickers(): Set<string> {
  const tickers = new Set<string>();

  // EW saved scans
  for (const scan of loadScans()) {
    for (const c of scan.candidates) {
      tickers.add(c.ticker);
    }
  }

  // Squeeze watchlists
  for (const wl of loadSqueezeWatchlists()) {
    for (const item of wl.items) {
      tickers.add(item.ticker);
    }
  }

  // Pre-Run watchlist
  for (const item of loadPreRunWatchlist()) {
    tickers.add(item.ticker);
  }

  // Strat watchlists
  for (const wl of loadStratWatchlists()) {
    for (const item of wl.items) {
      tickers.add(item.ticker);
    }
  }

  return tickers;
}

export function getTickerWatchlistSources(ticker: string): string[] {
  const sources: string[] = [];

  const ewScans = loadScans();
  if (ewScans.some((s) => s.candidates.some((c) => c.ticker === ticker))) {
    sources.push("EW");
  }

  const squeezeWatchlists = loadSqueezeWatchlists();
  if (squeezeWatchlists.some((wl) => wl.items.some((i) => i.ticker === ticker))) {
    sources.push("Squeeze");
  }

  const preRunItems = loadPreRunWatchlist();
  if (preRunItems.some((i) => i.ticker === ticker)) {
    sources.push("Pre-Run");
  }

  const stratWatchlists = loadStratWatchlists();
  if (stratWatchlists.some((wl) => wl.items.some((i) => i.ticker === ticker))) {
    sources.push("Strat");
  }

  return sources;
}

// ── 1g. Search History ──

const SEARCH_HISTORY_KEY = "ew-earnings-search-history";
const MAX_SEARCH_HISTORY = 10;

export function getSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function addToSearchHistory(ticker: string): void {
  if (typeof window === "undefined") return;
  const history = getSearchHistory().filter((t) => t !== ticker);
  history.unshift(ticker);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_SEARCH_HISTORY)));
}

export function clearSearchHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SEARCH_HISTORY_KEY);
}
