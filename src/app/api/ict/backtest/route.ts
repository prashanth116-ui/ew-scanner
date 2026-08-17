import { NextRequest, NextResponse } from "next/server";
import { fetchYahooChart } from "@/lib/prerun/data";
import { loadICTDailyDates, loadICTDaily } from "@/lib/supabase/persistence";
import type { ICTDailyRecord } from "@/lib/ict/types";

export const maxDuration = 120;

interface BacktestEvent {
  ticker: string;
  scanDate: string;
  state: string;
  timeframe: string;
  score: number;
  confluenceScore: number;
  bslTarget: number | null;
  protectedLow: number | null;
  price: number;
  distanceToBslPct: number | null;
  // Forward returns (computed post-hoc)
  return1d: number | null;
  return3d: number | null;
  return5d: number | null;
  mfe5d: number | null;  // max favorable excursion within 5d
  mae5d: number | null;  // max adverse excursion within 5d
  hitBsl: boolean;       // did price reach BSL target within 5d
}

interface BacktestSummary {
  totalEvents: number;
  avgScore: number;
  avgReturn1d: number | null;
  avgReturn3d: number | null;
  avgReturn5d: number | null;
  winRate1d: number | null;
  winRate3d: number | null;
  winRate5d: number | null;
  avgMfe5d: number | null;
  avgMae5d: number | null;
  bslHitRate: number | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const days = parseInt(searchParams.get("days") ?? "14", 10);
  const minState = parseInt(searchParams.get("minState") ?? "9", 10); // default: ARMED+
  const minScore = parseInt(searchParams.get("minScore") ?? "30", 10);

  try {
    // Load scan dates
    const allDates = await loadICTDailyDates(days);
    if (allDates.length === 0) {
      return NextResponse.json({ summary: null, events: [], message: "No scan data" });
    }

    // Load results for all dates, filter to target states
    const allEvents: BacktestEvent[] = [];
    const seenTickers = new Set<string>();

    for (const date of allDates) {
      const results = await loadICTDaily(date);
      const qualifying = results.filter(
        (r) => r.best_state_order >= minState && r.best_score >= minScore
      );

      for (const r of qualifying) {
        allEvents.push({
          ticker: r.ticker,
          scanDate: date,
          state: r.best_state,
          timeframe: r.best_timeframe,
          score: r.best_score,
          confluenceScore: r.confluence_score,
          bslTarget: r.bsl_target,
          protectedLow: r.protected_low,
          price: r.price,
          distanceToBslPct: r.distance_to_bsl_pct,
          return1d: null,
          return3d: null,
          return5d: null,
          mfe5d: null,
          mae5d: null,
          hitBsl: false,
        });
        seenTickers.add(r.ticker);
      }
    }

    // Fetch charts for forward returns (batch)
    const tickers = [...seenTickers];
    const chartMap = new Map<string, { closes: number[]; highs: number[]; lows: number[]; timestamps: number[] }>();

    // Fetch in batches of 10
    for (let i = 0; i < tickers.length; i += 10) {
      const batch = tickers.slice(i, i + 10);
      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          const chart = await fetchYahooChart(ticker, "6mo", "1d");
          if (chart) chartMap.set(ticker, chart);
        })
      );
    }

    // Compute forward returns
    for (const event of allEvents) {
      const chart = chartMap.get(event.ticker);
      if (!chart) continue;

      // Find the signal date in the chart
      const signalDate = new Date(event.scanDate).getTime() / 1000;
      let signalIdx = -1;
      for (let i = 0; i < chart.timestamps.length; i++) {
        const ts = chart.timestamps[i];
        // Match within same day (86400 seconds)
        if (Math.abs(ts - signalDate) < 86400) {
          signalIdx = i;
          break;
        }
      }

      if (signalIdx < 0 || signalIdx >= chart.closes.length - 1) continue;

      const entryPrice = chart.closes[signalIdx];
      if (entryPrice <= 0) continue;

      // Forward returns
      if (signalIdx + 1 < chart.closes.length) {
        event.return1d = ((chart.closes[signalIdx + 1] - entryPrice) / entryPrice) * 100;
      }
      if (signalIdx + 3 < chart.closes.length) {
        event.return3d = ((chart.closes[signalIdx + 3] - entryPrice) / entryPrice) * 100;
      }
      if (signalIdx + 5 < chart.closes.length) {
        event.return5d = ((chart.closes[signalIdx + 5] - entryPrice) / entryPrice) * 100;
      }

      // MFE/MAE within 5d
      const end = Math.min(signalIdx + 6, chart.closes.length);
      let maxHigh = 0;
      let maxLow = 0;
      for (let j = signalIdx + 1; j < end; j++) {
        const highPct = ((chart.highs[j] - entryPrice) / entryPrice) * 100;
        const lowPct = ((chart.lows[j] - entryPrice) / entryPrice) * 100;
        if (highPct > maxHigh) maxHigh = highPct;
        if (lowPct < maxLow) maxLow = lowPct;
      }
      event.mfe5d = maxHigh;
      event.mae5d = maxLow;

      // BSL hit check
      if (event.bslTarget != null) {
        for (let j = signalIdx + 1; j < end; j++) {
          if (chart.highs[j] >= event.bslTarget) {
            event.hitBsl = true;
            break;
          }
        }
      }
    }

    // Compute summary
    const withReturns = allEvents.filter((e) => e.return1d !== null);
    const summary: BacktestSummary = {
      totalEvents: allEvents.length,
      avgScore: allEvents.length > 0 ? allEvents.reduce((s, e) => s + e.score, 0) / allEvents.length : 0,
      avgReturn1d: withReturns.length > 0 ? withReturns.reduce((s, e) => s + e.return1d!, 0) / withReturns.length : null,
      avgReturn3d: withReturns.filter((e) => e.return3d !== null).length > 0
        ? withReturns.filter((e) => e.return3d !== null).reduce((s, e) => s + e.return3d!, 0) / withReturns.filter((e) => e.return3d !== null).length
        : null,
      avgReturn5d: withReturns.filter((e) => e.return5d !== null).length > 0
        ? withReturns.filter((e) => e.return5d !== null).reduce((s, e) => s + e.return5d!, 0) / withReturns.filter((e) => e.return5d !== null).length
        : null,
      winRate1d: withReturns.length > 0
        ? (withReturns.filter((e) => e.return1d! > 0).length / withReturns.length) * 100
        : null,
      winRate3d: withReturns.filter((e) => e.return3d !== null).length > 0
        ? (withReturns.filter((e) => e.return3d! > 0).length / withReturns.filter((e) => e.return3d !== null).length) * 100
        : null,
      winRate5d: withReturns.filter((e) => e.return5d !== null).length > 0
        ? (withReturns.filter((e) => e.return5d! > 0).length / withReturns.filter((e) => e.return5d !== null).length) * 100
        : null,
      avgMfe5d: withReturns.filter((e) => e.mfe5d !== null).length > 0
        ? withReturns.filter((e) => e.mfe5d !== null).reduce((s, e) => s + e.mfe5d!, 0) / withReturns.filter((e) => e.mfe5d !== null).length
        : null,
      avgMae5d: withReturns.filter((e) => e.mae5d !== null).length > 0
        ? withReturns.filter((e) => e.mae5d !== null).reduce((s, e) => s + e.mae5d!, 0) / withReturns.filter((e) => e.mae5d !== null).length
        : null,
      bslHitRate: allEvents.filter((e) => e.bslTarget !== null).length > 0
        ? (allEvents.filter((e) => e.hitBsl).length / allEvents.filter((e) => e.bslTarget !== null).length) * 100
        : null,
    };

    // Sort by date descending, then score
    allEvents.sort((a, b) => {
      const dateCmp = b.scanDate.localeCompare(a.scanDate);
      if (dateCmp !== 0) return dateCmp;
      return b.score - a.score;
    });

    return NextResponse.json({
      summary,
      events: allEvents,
      daysScanned: allDates.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backtest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
