import { NextRequest, NextResponse } from "next/server";
import { fetchPreRunData } from "@/lib/prerun/data";
import { scoreInflection } from "@/lib/prerun/inflection-scoring";
import type { InflectionResult } from "@/lib/prerun/types";

export const maxDuration = 300;

interface BacktestRequest {
  tickers: string[];
  startDate: string;    // YYYY-MM-DD
  endDate: string;      // YYYY-MM-DD
  minScore: number;
}

interface ForwardReturn {
  return1d: number | null;
  return2d: number | null;
  return3d: number | null;
  return5d: number | null;
  return10d: number | null;
  maxFavorable5d: number | null;  // max positive excursion in 5 bars
  maxAdverse5d: number | null;    // max negative excursion in 5 bars
  hitPlus3: boolean;
  hitPlus5: boolean;
  hitPlus8: boolean;
  hitPlus10: boolean;
  hitMinus3: boolean;
  hitMinus5: boolean;
  hitMinus8: boolean;
}

export interface BacktestSignal {
  ticker: string;
  date: string;
  price: number;
  overallScore: number;
  sellerExhaustion: number;
  volatilityCompression: number;
  buyerEmergence: number;
  relativeStrength: number;
  liquidityAuction: number;
  institutionalParticipation: number;
  stage: string;
  tradeRead: string;
  isPrimarySignal: boolean;
  isStrongerSignal: boolean;
  extensionRisk: boolean;
  forward: ForwardReturn;
}

// ── Chart cache: fetch once per ticker, reuse across dates ──
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

    const timestamps = result.timestamp ?? [];
    const quotes = result.indicators?.quote?.[0];
    const closes = quotes?.close ?? [];
    const highs = quotes?.high ?? [];
    const lows = quotes?.low ?? [];

    const chart: CachedChart = { timestamps, closes, highs, lows };
    chartCache.set(ticker, chart);
    return chart;
  } catch {
    chartCache.set(ticker, null);
    return null;
  }
}

function calcForwardReturns(
  chart: CachedChart,
  signalDateTs: number,
): ForwardReturn | null {
  // Find the bar index closest to signalDateTs
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

  // Max favorable/adverse excursion in 5 bars
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

  // Check target hits within 10 bars
  let hitPlus3 = false, hitPlus5 = false, hitPlus8 = false, hitPlus10 = false;
  let hitMinus3 = false, hitMinus5 = false, hitMinus8 = false;
  for (let d = 1; d <= 10; d++) {
    const i = idx + d;
    if (i >= chart.highs.length) break;
    const highPct = chart.highs[i] && entryPrice > 0 ? ((chart.highs[i] - entryPrice) / entryPrice) * 100 : 0;
    const lowPct = chart.lows[i] && entryPrice > 0 ? ((chart.lows[i] - entryPrice) / entryPrice) * 100 : 0;
    if (highPct >= 3) hitPlus3 = true;
    if (highPct >= 5) hitPlus5 = true;
    if (highPct >= 8) hitPlus8 = true;
    if (highPct >= 10) hitPlus10 = true;
    if (lowPct <= -3) hitMinus3 = true;
    if (lowPct <= -5) hitMinus5 = true;
    if (lowPct <= -8) hitMinus8 = true;
  }

  return {
    return1d: getReturn(1),
    return2d: getReturn(2),
    return3d: getReturn(3),
    return5d: getReturn(5),
    return10d: getReturn(10),
    maxFavorable5d: maxFav,
    maxAdverse5d: maxAdv,
    hitPlus3,
    hitPlus5,
    hitPlus8,
    hitPlus10,
    hitMinus3,
    hitMinus5,
    hitMinus8,
  };
}

function getTradingDays(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) { // Skip weekends
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BacktestRequest;
    const { tickers, startDate, endDate, minScore } = body;

    if (!tickers || tickers.length === 0 || tickers.length > 50) {
      return NextResponse.json(
        { error: "Provide 1-50 tickers" },
        { status: 400 }
      );
    }

    const tradingDays = getTradingDays(startDate, endDate);
    const signals: BacktestSignal[] = [];

    // Pre-fetch all charts for forward returns
    await Promise.all(tickers.map((t) => getChart(t)));

    // For each ticker, fetch data for each trading day
    for (const ticker of tickers) {
      const chart = chartCache.get(ticker.toUpperCase()) ?? await getChart(ticker);

      for (const date of tradingDays) {
        try {
          const data = await fetchPreRunData(ticker, "1d", date);
          if (!data) continue;

          const result: InflectionResult = scoreInflection(data);

          // Skip if below min score
          if (result.scores.overallScore < minScore) continue;

          // Skip distribution stage unless explicitly requested
          if (result.stage === "DISTRIBUTION") continue;

          // Calculate forward returns from the signal date
          let forward: ForwardReturn | null = null;
          if (chart) {
            const signalTs = new Date(date + "T16:00:00-04:00").getTime() / 1000;
            forward = calcForwardReturns(chart, signalTs);
          }

          if (!forward) continue; // Skip signals without forward data

          signals.push({
            ticker: data.ticker,
            date,
            price: data.currentPrice ?? 0,
            overallScore: result.scores.overallScore,
            sellerExhaustion: result.scores.sellerExhaustion,
            volatilityCompression: result.scores.volatilityCompression,
            buyerEmergence: result.scores.buyerEmergence,
            relativeStrength: result.scores.relativeStrength,
            liquidityAuction: result.scores.liquidityAuction,
            institutionalParticipation: result.scores.institutionalParticipation,
            stage: result.stage,
            tradeRead: result.tradeRead,
            isPrimarySignal: result.isPrimarySignal,
            isStrongerSignal: result.isStrongerSignal,
            extensionRisk: result.extensionRisk,
            forward,
          });
        } catch {
          // Skip individual ticker/date failures
        }
      }

      // Rate limit: small delay between tickers
      await new Promise((r) => setTimeout(r, 300));
    }

    // Sort by date then score
    signals.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return b.overallScore - a.overallScore;
    });

    // Compute summary stats
    const returns5d = signals.map((s) => s.forward.return5d).filter((r): r is number => r !== null);
    const returns3d = signals.map((s) => s.forward.return3d).filter((r): r is number => r !== null);
    const returns1d = signals.map((s) => s.forward.return1d).filter((r): r is number => r !== null);
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const winRate = (arr: number[]) => arr.length > 0 ? (arr.filter((r) => r > 0).length / arr.length) * 100 : 0;

    const summary = {
      totalSignals: signals.length,
      avgReturn1d: avg(returns1d),
      avgReturn3d: avg(returns3d),
      avgReturn5d: avg(returns5d),
      winRate1d: winRate(returns1d),
      winRate3d: winRate(returns3d),
      winRate5d: winRate(returns5d),
      hitRatePlus3: signals.filter((s) => s.forward.hitPlus3).length,
      hitRatePlus5: signals.filter((s) => s.forward.hitPlus5).length,
      hitRatePlus8: signals.filter((s) => s.forward.hitPlus8).length,
      hitRatePlus10: signals.filter((s) => s.forward.hitPlus10).length,
      hitRateMinus3: signals.filter((s) => s.forward.hitMinus3).length,
      hitRateMinus5: signals.filter((s) => s.forward.hitMinus5).length,
      primarySignals: signals.filter((s) => s.isPrimarySignal).length,
      strongerSignals: signals.filter((s) => s.isStrongerSignal).length,
    };

    // Clear chart cache after backtest
    chartCache.clear();

    return NextResponse.json({ signals, summary });
  } catch (error) {
    console.error("Backtest error:", error);
    return NextResponse.json(
      { error: "Backtest failed" },
      { status: 500 }
    );
  }
}
