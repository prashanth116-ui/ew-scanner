/**
 * Funnel Backtest — composite scoring system that replaces sequential AND gates.
 * Each scanner contributes points proportionally; a stock needs enough total
 * conviction across whichever scanners flag it.
 *
 * GET /api/backtest/funnel?days=10
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadPreRunDaily,
  loadPreRunDailyDates,
  loadInflectionDaily,
  loadVCPDaily,
  loadInstitutionalDaily,
  loadPreRunnerDaily,
  loadTransitionDaily,
} from "@/lib/supabase/persistence";
import type {
  PreRunDailyRecord,
  InflectionDailyRecord,
  VCPDailyRecord,
  InstitutionalDailyRecord,
  PreRunnerDailyRecord,
  TransitionDailyRecord,
} from "@/lib/supabase/persistence";

export const maxDuration = 300;

// ── Chart cache ──

interface CachedChart {
  timestamps: number[];
  closes: number[];
  highs: number[];
  lows: number[];
}

const chartCache = new Map<string, CachedChart | null>();

async function getChart(ticker: string): Promise<CachedChart | null> {
  if (chartCache.has(ticker)) return chartCache.get(ticker)!;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=6mo&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; backtest)" },
    });
    if (!res.ok) { chartCache.set(ticker, null); return null; }
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) { chartCache.set(ticker, null); return null; }

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.quote?.[0];
    const closes: number[] = quotes?.close ?? [];
    const highs: number[] = quotes?.high ?? [];
    const lows: number[] = quotes?.low ?? [];

    const chart: CachedChart = { timestamps, closes, highs, lows };
    chartCache.set(ticker, chart);
    return chart;
  } catch {
    chartCache.set(ticker, null);
    return null;
  }
}

interface ForwardReturn {
  return1d: number | null;
  return3d: number | null;
  return5d: number | null;
  maxFavorable5d: number | null;
  maxAdverse5d: number | null;
}

function calcForwardReturns(chart: CachedChart, signalDateTs: number): ForwardReturn | null {
  let idx = -1;
  for (let i = 0; i < chart.timestamps.length; i++) {
    if (chart.timestamps[i] >= signalDateTs) {
      idx = i;
      break;
    }
  }
  if (idx < 0 || idx >= chart.closes.length - 1) return null;

  const entryPrice = chart.closes[idx];
  if (!entryPrice || entryPrice <= 0) return null;

  const getReturn = (offset: number): number | null => {
    const i = idx + offset;
    if (i >= chart.closes.length) return null;
    const p = chart.closes[i];
    if (!p || p <= 0) return null;
    return ((p - entryPrice) / entryPrice) * 100;
  };

  let maxFav = 0;
  let maxAdv = 0;
  for (let d = 1; d <= 5; d++) {
    const i = idx + d;
    if (i >= chart.highs.length) break;
    const highRet = chart.highs[i] && entryPrice > 0 ? ((chart.highs[i] - entryPrice) / entryPrice) * 100 : 0;
    const lowRet = chart.lows[i] && entryPrice > 0 ? ((chart.lows[i] - entryPrice) / entryPrice) * 100 : 0;
    if (highRet > maxFav) maxFav = highRet;
    if (lowRet < maxAdv) maxAdv = lowRet;
  }

  return {
    return1d: getReturn(1),
    return3d: getReturn(3),
    return5d: getReturn(5),
    maxFavorable5d: maxFav,
    maxAdverse5d: maxAdv,
  };
}

// ── Funnel types ──

interface FunnelPick {
  ticker: string;
  sector: string;
  price: number;
  compositeScore: number;
  prerunPts: number;
  inflectionPts: number;
  transitionPts: number;
  instPts: number;
  prerunnerPts: number;
  vcpPts: number;
  confluencePts: number;
  presets: string[];
  prerunScore: number;
  tradeRead: string;
  inflectionStage: string;
  inflectionScore: number;
  alertState: string;
  transitionState: string;
  transitionScore: number;
  triggerLevel: number | null;
  confluenceCount: number;
  onVcpFocus: boolean;
  vcpScore: number | null;
  onInstShortlist: boolean;
  instScore: number | null;
  forward: ForwardReturn;
}

interface FunnelDayResult {
  date: string;
  diagnostics: {
    poolSize: number;
    qualifiedCount: number;
    pickedCount: number;
    avgCompositeScore: number;
    scannerCoverage: {
      prerun: number;
      inflection: number;
      transition: number;
      institutional: number;
      prerunner: number;
    };
  };
  picks: FunnelPick[];
}

interface FunnelSummary {
  totalDays: number;
  totalPicks: number;
  avgPicksPerDay: number;
  avgCompositeScore: number;
  avgReturn1d: number;
  avgReturn3d: number;
  avgReturn5d: number;
  winRate1d: number;
  winRate3d: number;
  winRate5d: number;
  avgMaxFavorable: number;
  avgMaxAdverse: number;
  bestTrade: { ticker: string; date: string; return5d: number } | null;
  worstTrade: { ticker: string; date: string; return5d: number } | null;
}

// ── Composite scoring components ──

function scorePrerunComponent(r: PreRunDailyRecord | undefined): number {
  if (!r || r.final_score <= 0) return 0;

  // Base score
  let pts = 0;
  if (r.final_score >= 22) pts = 12;
  else if (r.final_score >= 18) pts = 9;
  else if (r.final_score >= 14) pts = 7;
  else if (r.final_score >= 10) pts = 5;
  else pts = 3;

  // Preset bonus (best one)
  let presetBonus = 0;
  if (r.is_early_mover || r.is_stealth) presetBonus = Math.max(presetBonus, 5);
  if (r.is_early_plus || r.is_pullback) presetBonus = Math.max(presetBonus, 4);
  if (r.is_leading) presetBonus = Math.max(presetBonus, 3);
  if (r.is_sndk) presetBonus = Math.max(presetBonus, 3);
  pts += presetBonus;

  // Structural bonus (cap +4)
  let structural = 0;
  if (r.obv_divergent) structural += 2;
  if (r.vp_divergence_bullish) structural += 1;
  if (r.higher_lows_count != null && r.higher_lows_count >= 3) structural += 1;
  if (r.verdict === "PRIORITY") structural += 1;
  pts += Math.min(structural, 4);

  return Math.min(pts, 25);
}

function scoreInflectionComponent(r: InflectionDailyRecord | undefined): number {
  if (!r) return 0;

  // Base by trade_read
  let pts = 0;
  if (r.trade_read === "STARTER_POSITION_CANDIDATE") pts = 10;
  else if (r.trade_read === "ADD_ON_CONFIRMATION") pts = 8;
  else if (r.trade_read === "WATCH") pts = 3;
  else if (r.trade_read === "AVOID") pts = -5;
  else return 0; // unknown trade_read, no points

  // Stage bonus
  if (r.stage === "INFLECTION") pts += 4;
  else if (r.stage === "EARLY_ACCUMULATION" || r.stage === "SELLER_EXHAUSTION") pts += 3;
  else if (r.stage === "EXPANSION") pts += 2;

  // Score bonus
  if (r.overall_score >= 60) pts += 4;
  else if (r.overall_score >= 45) pts += 2;
  else if (r.overall_score >= 35) pts += 1;

  // Quality
  if (r.is_primary) pts += 2;
  if (r.is_stronger) pts += 2;

  return Math.min(Math.max(pts, 0), 25);
}

function scoreTransitionComponent(r: TransitionDailyRecord | undefined): number {
  if (!r) return 0;

  // Base by alert_state — WATCH excluded (low conviction), ARMED requires score >= 35
  let pts = 0;
  if (r.alert_state === "TRIGGERED") pts = 8;
  else if (r.alert_state === "READY") pts = 6;
  else if (r.alert_state === "ARMED" && r.overall_score >= 35) pts = 2;
  else return 0;

  // Score bonus
  if (r.overall_score >= 60) pts += 4;
  else if (r.overall_score >= 45) pts += 2;
  else if (r.overall_score >= 35) pts += 1;

  // State bonus
  if (r.state === "EARLY_EXPANSION" || r.state === "SUSTAINED_MARKUP") pts += 3;
  else if (r.state === "BULLISH_BOS" || r.state === "COMPRESSION") pts += 2;
  else if (r.state === "BULLISH_CHOCH" || r.state === "HIGHER_LOW_FORMATION") pts += 1;

  return Math.min(pts, 20);
}

function scoreInstitutionalComponent(r: InstitutionalDailyRecord | undefined): number {
  if (!r) return 0;

  // AVOID penalty — institutional flagged this as distribution/choppy/low quality
  const cls = r.classification ?? "";
  if (cls.startsWith("AVOID_")) return -5;

  // Base by tier — SPECULATIVE excluded (noise for liquid large-caps)
  let pts = 0;
  if (r.tier === "SHORTLIST") pts = 7;
  else if (r.tier === "WATCHLIST") pts = 4;
  else return 0;

  // Score bonus
  if (r.composite_score >= 60) pts += 3;
  else if (r.composite_score >= 45) pts += 2;

  // Entry quality
  if (r.entry_quality === "HIGH") pts += 3;
  else if (r.entry_quality === "MODERATE") pts += 1;

  return Math.min(pts, 15);
}

function scorePrerunnerComponent(r: PreRunnerDailyRecord | undefined): number {
  if (!r) return 0;

  // Base by type
  let pts = 0;
  if (r.type === "LEADER") pts = 4;
  else if (r.type === "TURNAROUND") pts = 3;
  else return 0;

  // RS bonus
  if (r.rs_improving && r.rs_acceleration > 0) pts += 3;
  else if (r.rs_improving) pts += 1;

  // Conviction
  if (r.conviction === "HIGH") pts += 2;
  else if (r.conviction === "MEDIUM") pts += 1;

  return Math.min(pts, 10);
}

function scoreVcpComponent(r: VCPDailyRecord | undefined): number {
  if (!r) return 0;

  // Base by phase
  let pts = 0;
  if (r.phase === "FOCUS_LIST") pts = 5;
  else if (r.phase === "WATCHLIST_CANDIDATE") pts = 3;
  else if (r.phase === "EARLY_SETUP") pts = 1;
  else return 0;

  // Score bonus
  if (r.total_score >= 70) pts += 3;
  else if (r.total_score >= 50) pts += 2;
  else if (r.total_score >= 35) pts += 1;

  return Math.min(pts, 8);
}

function scoreConfluenceBonus(weightedConfluence: number): number {
  if (weightedConfluence >= 4) return 5;
  if (weightedConfluence >= 3) return 3;
  if (weightedConfluence >= 2.5) return 2;
  if (weightedConfluence >= 2) return 1;
  return 0;
}

// ── Funnel logic ──

interface CompositeResult {
  diagnostics: {
    poolSize: number;
    qualifiedCount: number;
    pickedCount: number;
    avgCompositeScore: number;
    scannerCoverage: {
      prerun: number;
      inflection: number;
      transition: number;
      institutional: number;
      prerunner: number;
    };
  };
  picks: Omit<FunnelPick, "forward">[];
}

function runFunnel(
  prerun: PreRunDailyRecord[],
  inflection: InflectionDailyRecord[],
  vcp: VCPDailyRecord[],
  institutional: InstitutionalDailyRecord[],
  prerunner: PreRunnerDailyRecord[],
  transition: TransitionDailyRecord[],
): CompositeResult {
  // Build per-ticker lookup maps
  const prerunMap = new Map<string, PreRunDailyRecord>();
  for (const r of prerun) if (r.final_score > 0) prerunMap.set(r.ticker, r);
  const inflectionMap = new Map<string, InflectionDailyRecord>();
  for (const r of inflection) inflectionMap.set(r.ticker, r);
  const transitionMap = new Map<string, TransitionDailyRecord>();
  for (const r of transition) transitionMap.set(r.ticker, r);
  const instMap = new Map<string, InstitutionalDailyRecord>();
  for (const r of institutional) instMap.set(r.ticker, r);
  const prerunnerMap = new Map<string, PreRunnerDailyRecord>();
  for (const r of prerunner) prerunnerMap.set(r.ticker, r);
  const vcpMap = new Map<string, VCPDailyRecord>();
  for (const r of vcp) vcpMap.set(r.ticker, r);

  // Build weighted confluence per ticker (same rules as nightly summary)
  const hitCount = new Map<string, number>();
  for (const r of prerun) {
    if (r.final_score > 0) hitCount.set(r.ticker, (hitCount.get(r.ticker) ?? 0) + 1);
  }
  for (const r of inflection) {
    if (r.trade_read === "AVOID") continue;
    const weight = r.trade_read === "WATCH" ? 0.5 : 1;
    hitCount.set(r.ticker, (hitCount.get(r.ticker) ?? 0) + weight);
  }
  for (const r of transition) {
    if (r.alert_state === "TRIGGERED" || r.alert_state === "READY") {
      hitCount.set(r.ticker, (hitCount.get(r.ticker) ?? 0) + 1);
    }
  }
  for (const r of institutional) {
    hitCount.set(r.ticker, (hitCount.get(r.ticker) ?? 0) + 1);
  }
  for (const r of prerunner) {
    hitCount.set(r.ticker, (hitCount.get(r.ticker) ?? 0) + 1);
  }

  // Pool: weighted confluence >= 2.0
  const pool = [...hitCount.entries()].filter(([, c]) => c >= 2.0).map(([t]) => t);

  // Score each ticker in pool
  type ScoredPick = Omit<FunnelPick, "forward"> & { rsAccel: number };
  const scored: ScoredPick[] = [];
  let coveragePrerun = 0, coverageInflection = 0, coverageTransition = 0, coverageInst = 0, coveragePrerunner = 0;

  for (const ticker of pool) {
    const pr = prerunMap.get(ticker);
    const inf = inflectionMap.get(ticker);
    const tr = transitionMap.get(ticker);
    const inst = instMap.get(ticker);
    const prr = prerunnerMap.get(ticker);
    const vcpRec = vcpMap.get(ticker);
    const confluence = hitCount.get(ticker) ?? 0;

    const prerunPts = scorePrerunComponent(pr);
    const inflectionPts = scoreInflectionComponent(inf);
    const transitionPts = scoreTransitionComponent(tr);
    const instPts = scoreInstitutionalComponent(inst);
    const prerunnerPts = scorePrerunnerComponent(prr);
    const vcpPts = scoreVcpComponent(vcpRec);
    const confluencePts = scoreConfluenceBonus(confluence);

    const compositeScore = prerunPts + inflectionPts + transitionPts + instPts + prerunnerPts + vcpPts + confluencePts;

    // Track coverage
    if (prerunPts > 0) coveragePrerun++;
    if (inflectionPts > 0) coverageInflection++;
    if (transitionPts > 0) coverageTransition++;
    if (instPts > 0) coverageInst++;
    if (prerunnerPts > 0) coveragePrerunner++;

    // Minimum composite score gate
    if (compositeScore < 30) continue;

    // Build presets list
    const presets: string[] = [];
    if (pr) {
      if (pr.is_early_mover) presets.push("early_mover");
      if (pr.is_stealth) presets.push("stealth");
      if (pr.is_early_plus) presets.push("early_plus");
      if (pr.is_sndk) presets.push("sndk");
      if (pr.is_leading) presets.push("leading");
      if (pr.is_pullback) presets.push("pullback");
    }

    // RS acceleration for tiebreaker (prefer institutional rs_accel_spy, fallback to prerunner)
    const rsAccel = inst?.rs_accel_spy ?? prr?.rs_acceleration ?? 0;

    // Use price from whichever record is available
    const price = pr?.price ?? inf?.price ?? tr?.price ?? inst?.price ?? prr?.price ?? 0;
    const sector = pr?.sector ?? inf?.sector ?? tr?.sector ?? inst?.sector ?? prr?.sector ?? "";

    scored.push({
      ticker,
      sector,
      price,
      compositeScore,
      prerunPts,
      inflectionPts,
      transitionPts,
      instPts,
      prerunnerPts,
      vcpPts,
      confluencePts,
      presets,
      prerunScore: pr?.final_score ?? 0,
      tradeRead: inf?.trade_read ?? "-",
      inflectionStage: inf?.stage ?? "-",
      inflectionScore: inf?.overall_score ?? 0,
      alertState: tr?.alert_state ?? "-",
      transitionState: tr?.state ?? "-",
      transitionScore: tr?.overall_score ?? 0,
      triggerLevel: tr?.trigger_level ?? null,
      confluenceCount: confluence,
      onVcpFocus: vcpRec?.phase === "FOCUS_LIST",
      vcpScore: vcpRec?.total_score ?? null,
      onInstShortlist: inst?.tier === "SHORTLIST",
      instScore: inst?.composite_score ?? null,
      rsAccel,
    });
  }

  // Sort by compositeScore DESC, RS acceleration tiebreaker DESC
  scored.sort((a, b) => {
    const diff = b.compositeScore - a.compositeScore;
    if (diff !== 0) return diff;
    return b.rsAccel - a.rsAccel;
  });

  // Cap at 15 with max 3 per sector, strip rsAccel
  const MAX_PICKS = 15;
  const MAX_PER_SECTOR = 3;
  const sectorCounts = new Map<string, number>();
  const picks: Omit<FunnelPick, "forward">[] = [];
  for (const { rsAccel: _, ...rest } of scored) {
    if (picks.length >= MAX_PICKS) break;
    const sec = rest.sector || "Unknown";
    const count = sectorCounts.get(sec) ?? 0;
    if (count >= MAX_PER_SECTOR) continue;
    sectorCounts.set(sec, count + 1);
    picks.push(rest);
  }

  const qualifiedCount = scored.length;
  // avgCompositeScore reflects the picked stocks, not all qualified
  const avgScore = picks.length > 0
    ? picks.reduce((a, b) => a + b.compositeScore, 0) / picks.length
    : 0;

  return {
    diagnostics: {
      poolSize: pool.length,
      qualifiedCount,
      pickedCount: picks.length,
      avgCompositeScore: Math.round(avgScore * 10) / 10,
      scannerCoverage: {
        prerun: coveragePrerun,
        inflection: coverageInflection,
        transition: coverageTransition,
        institutional: coverageInst,
        prerunner: coveragePrerunner,
      },
    },
    picks,
  };
}

// ── GET handler ──

export async function GET(req: NextRequest) {
  try {
    const daysParam = parseInt(req.nextUrl.searchParams.get("days") ?? "10", 10);
    const days = Math.min(Math.max(daysParam, 1), 14);

    // Discover available dates
    const allDates = await loadPreRunDailyDates(days);
    if (allDates.length === 0) {
      return NextResponse.json({ dates: [], funnelResults: [], summary: emptySummary() });
    }

    const dates = allDates.slice(0, days);
    const funnelResults: FunnelDayResult[] = [];
    const allUniqueTickers = new Set<string>();

    // Process each date (sequential — 6 parallel loads per date)
    for (const date of dates) {
      const [prerun, inflection, vcp, institutional, prerunner, transition] = await Promise.all([
        loadPreRunDaily(date),
        loadInflectionDaily(date),
        loadVCPDaily(date),
        loadInstitutionalDaily(date),
        loadPreRunnerDaily(date),
        loadTransitionDaily(date),
      ]);

      const { diagnostics, picks } = runFunnel(prerun, inflection, vcp, institutional, prerunner, transition);

      for (const p of picks) allUniqueTickers.add(p.ticker);

      funnelResults.push({
        date,
        diagnostics,
        picks: picks.map((p) => ({
          ...p,
          forward: { return1d: null, return3d: null, return5d: null, maxFavorable5d: null, maxAdverse5d: null },
        })),
      });
    }

    // Batch-fetch charts for all unique picked tickers
    const tickerArray = [...allUniqueTickers];
    for (let i = 0; i < tickerArray.length; i++) {
      await getChart(tickerArray[i]);
      if (i < tickerArray.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Fill forward returns
    for (const day of funnelResults) {
      for (const pick of day.picks) {
        const chart = chartCache.get(pick.ticker);
        if (chart) {
          const signalTs = new Date(day.date + "T16:00:00-04:00").getTime() / 1000;
          const fwd = calcForwardReturns(chart, signalTs);
          if (fwd) pick.forward = fwd;
        }
      }
    }

    // Clear cache
    chartCache.clear();

    // Compute summary
    const allPicks = funnelResults.flatMap((d) => d.picks);
    const summary = computeSummary(funnelResults, allPicks);

    return NextResponse.json({ dates, funnelResults, summary });
  } catch (error) {
    console.error("[funnel-backtest] error:", error);
    return NextResponse.json({ error: "Funnel backtest failed" }, { status: 500 });
  }
}

// ── Summary helpers ──

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function winRate(arr: number[]): number {
  return arr.length > 0 ? (arr.filter((r) => r > 0).length / arr.length) * 100 : 0;
}

function emptySummary(): FunnelSummary {
  return {
    totalDays: 0,
    totalPicks: 0,
    avgPicksPerDay: 0,
    avgCompositeScore: 0,
    avgReturn1d: 0,
    avgReturn3d: 0,
    avgReturn5d: 0,
    winRate1d: 0,
    winRate3d: 0,
    winRate5d: 0,
    avgMaxFavorable: 0,
    avgMaxAdverse: 0,
    bestTrade: null,
    worstTrade: null,
  };
}

function computeSummary(
  funnelResults: FunnelDayResult[],
  allPicks: FunnelPick[],
): FunnelSummary {
  if (allPicks.length === 0) {
    return { ...emptySummary(), totalDays: funnelResults.length };
  }

  const r1d = allPicks.map((p) => p.forward.return1d).filter((r): r is number => r !== null);
  const r3d = allPicks.map((p) => p.forward.return3d).filter((r): r is number => r !== null);
  const r5d = allPicks.map((p) => p.forward.return5d).filter((r): r is number => r !== null);
  const mfe = allPicks.map((p) => p.forward.maxFavorable5d).filter((r): r is number => r !== null);
  const mae = allPicks.map((p) => p.forward.maxAdverse5d).filter((r): r is number => r !== null);

  // Best and worst by 5d return
  let bestTrade: FunnelSummary["bestTrade"] = null;
  let worstTrade: FunnelSummary["worstTrade"] = null;

  for (const day of funnelResults) {
    for (const pick of day.picks) {
      if (pick.forward.return5d == null) continue;
      if (!bestTrade || pick.forward.return5d > bestTrade.return5d) {
        bestTrade = { ticker: pick.ticker, date: day.date, return5d: pick.forward.return5d };
      }
      if (!worstTrade || pick.forward.return5d < worstTrade.return5d) {
        worstTrade = { ticker: pick.ticker, date: day.date, return5d: pick.forward.return5d };
      }
    }
  }

  const compositeScores = allPicks.map((p) => p.compositeScore);

  return {
    totalDays: funnelResults.length,
    totalPicks: allPicks.length,
    avgPicksPerDay: allPicks.length / funnelResults.length,
    avgCompositeScore: avg(compositeScores),
    avgReturn1d: avg(r1d),
    avgReturn3d: avg(r3d),
    avgReturn5d: avg(r5d),
    winRate1d: winRate(r1d),
    winRate3d: winRate(r3d),
    winRate5d: winRate(r5d),
    avgMaxFavorable: avg(mfe),
    avgMaxAdverse: avg(mae),
    bestTrade,
    worstTrade,
  };
}
