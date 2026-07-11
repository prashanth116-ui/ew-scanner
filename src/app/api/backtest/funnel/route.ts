/**
 * Funnel Backtest — runs the 5-step Pre-Run Playbook funnel against
 * persisted scanner data and computes forward returns from Yahoo charts.
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
  funnelCounts: { step1: number; step2: number; step3: number; step4: number };
  picks: FunnelPick[];
}

interface FunnelSummary {
  totalDays: number;
  totalPicks: number;
  avgPicksPerDay: number;
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

// ── Funnel logic ──

function runFunnel(
  prerun: PreRunDailyRecord[],
  inflection: InflectionDailyRecord[],
  vcp: VCPDailyRecord[],
  institutional: InstitutionalDailyRecord[],
  prerunner: PreRunnerDailyRecord[],
  transition: TransitionDailyRecord[],
): { counts: { step1: number; step2: number; step3: number; step4: number }; survivors: string[]; meta: Map<string, { confluenceCount: number }> } {
  // Build per-ticker weighted scanner hit counts (same rules as consolidateResults in nightly summary)
  // 5 confluence scanners: PreRun, Inflection, Transition, Institutional, PreRunner
  // VCP is badge-only (not counted). INF WATCH = 0.5 weight.
  const hitCount = new Map<string, number>();

  for (const r of prerun) {
    if (r.final_score > 0) hitCount.set(r.ticker, (hitCount.get(r.ticker) ?? 0) + 1);
  }
  for (const r of inflection) {
    if (r.trade_read === "AVOID") continue;
    const weight = r.trade_read === "WATCH" ? 0.5 : 1;
    hitCount.set(r.ticker, (hitCount.get(r.ticker) ?? 0) + weight);
  }
  // Transition: only TRIGGERED and READY count
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

  // Step 1: confluence >= 2.5 (weighted)
  const step1 = [...hitCount.entries()].filter(([, c]) => c >= 2.5).map(([t]) => t);
  const meta = new Map<string, { confluenceCount: number }>();
  for (const t of step1) meta.set(t, { confluenceCount: hitCount.get(t)! });

  // Step 2: preset filter — early_mover OR stealth OR early_plus, AND final_score >= 18
  const prerunMap = new Map<string, PreRunDailyRecord>();
  for (const r of prerun) prerunMap.set(r.ticker, r);

  const step2 = step1.filter((t) => {
    const r = prerunMap.get(t);
    if (!r) return false;
    return (r.is_early_mover || r.is_stealth || r.is_early_plus) && r.final_score >= 18;
  });

  // Step 3: inflection filter — STARTER + qualifying stage
  const inflectionMap = new Map<string, InflectionDailyRecord>();
  for (const r of inflection) inflectionMap.set(r.ticker, r);

  const QUALIFYING_STAGES = new Set(["INFLECTION", "EARLY_ACCUMULATION", "SELLER_EXHAUSTION"]);
  const step3 = step2.filter((t) => {
    const r = inflectionMap.get(t);
    if (!r) return false;
    return r.trade_read === "STARTER_POSITION_CANDIDATE" && QUALIFYING_STAGES.has(r.stage);
  });

  // Step 4: transition filter — TRIGGERED or READY
  const transitionMap = new Map<string, TransitionDailyRecord>();
  for (const r of transition) transitionMap.set(r.ticker, r);

  const step4 = step3.filter((t) => {
    const r = transitionMap.get(t);
    if (!r) return false;
    return r.alert_state === "TRIGGERED" || r.alert_state === "READY";
  });

  return {
    counts: { step1: step1.length, step2: step2.length, step3: step3.length, step4: step4.length },
    survivors: step4,
    meta,
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

      const { counts, survivors, meta } = runFunnel(prerun, inflection, vcp, institutional, prerunner, transition);

      // Build lookup maps for Step 5 bonus annotations
      const prerunMap = new Map<string, PreRunDailyRecord>();
      for (const r of prerun) prerunMap.set(r.ticker, r);
      const inflectionMap = new Map<string, InflectionDailyRecord>();
      for (const r of inflection) inflectionMap.set(r.ticker, r);
      const transitionMap = new Map<string, TransitionDailyRecord>();
      for (const r of transition) transitionMap.set(r.ticker, r);
      const vcpMap = new Map<string, VCPDailyRecord>();
      for (const r of vcp) vcpMap.set(r.ticker, r);
      const instMap = new Map<string, InstitutionalDailyRecord>();
      for (const r of institutional) instMap.set(r.ticker, r);

      const picks: Omit<FunnelPick, "forward">[] = [];
      for (const ticker of survivors) {
        allUniqueTickers.add(ticker);
        const pr = prerunMap.get(ticker)!;
        const inf = inflectionMap.get(ticker)!;
        const tr = transitionMap.get(ticker)!;
        const vcpRec = vcpMap.get(ticker);
        const instRec = instMap.get(ticker);

        const presets: string[] = [];
        if (pr.is_early_mover) presets.push("early_mover");
        if (pr.is_stealth) presets.push("stealth");
        if (pr.is_early_plus) presets.push("early_plus");
        if (pr.is_sndk) presets.push("sndk");
        if (pr.is_leading) presets.push("leading");
        if (pr.is_pullback) presets.push("pullback");

        picks.push({
          ticker,
          sector: pr.sector,
          price: pr.price,
          presets,
          prerunScore: pr.final_score,
          tradeRead: inf.trade_read,
          inflectionStage: inf.stage,
          inflectionScore: inf.overall_score,
          alertState: tr.alert_state,
          transitionState: tr.state,
          transitionScore: tr.overall_score,
          triggerLevel: tr.trigger_level,
          confluenceCount: meta.get(ticker)?.confluenceCount ?? 0,
          onVcpFocus: vcpRec?.phase === "FOCUS_LIST",
          vcpScore: vcpRec?.total_score ?? null,
          onInstShortlist: instRec?.tier === "SHORTLIST",
          instScore: instRec?.composite_score ?? null,
        });
      }

      // Sort picks by prerun score DESC
      picks.sort((a, b) => b.prerunScore - a.prerunScore);

      // Placeholder forward returns — will be filled after chart fetching
      funnelResults.push({
        date,
        funnelCounts: counts,
        picks: picks.map((p) => ({
          ...p,
          forward: { return1d: null, return3d: null, return5d: null, maxFavorable5d: null, maxAdverse5d: null },
        })),
      });
    }

    // Batch-fetch charts for all unique survivor tickers
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

  return {
    totalDays: funnelResults.length,
    totalPicks: allPicks.length,
    avgPicksPerDay: allPicks.length / funnelResults.length,
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
