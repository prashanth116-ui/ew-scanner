import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData, prefetchSectorETFs, fetchYahooChart } from "@/lib/prerun/data";
import { scoreTransitionWithOHLC } from "@/lib/prerun/transition-scoring";
import { passesUniverseQualityGates } from "@/lib/prerun/scoring";
import { SP500_MEMBERS, NDX100_MEMBERS, ADDITIONAL_MEMBERS } from "@/data/index-tiers";
import { getSectorForTicker } from "@/data/prerun-universe";

import {
  upsertTransitionDaily,
  purgeOldTransitionDaily,
  clearTransitionDaily,
  loadAllScoredTickers,
} from "@/lib/supabase/persistence";
import type { TransitionDailyRecord } from "@/lib/supabase/persistence";
import type { TransitionResult } from "@/lib/prerun/types";

export const maxDuration = 300; // 5 minutes

const BATCH_SIZE = 15;
const BATCH_DELAY = 500;
const PERSIST_INTERVAL = 50;

function resultToRecord(r: TransitionResult, scanDate: string): TransitionDailyRecord {
  return {
    scan_date: scanDate,
    ticker: r.data.ticker,
    company_name: r.data.companyName,
    sector: getSectorForTicker(r.data.ticker),
    price: r.data.currentPrice ?? 0,
    overall_score: r.scores.overallScore,
    se_score: r.scores.sellerExhaustion,
    accum_score: r.scores.accumulationQuality,
    choch_score: r.scores.chochConfirmation,
    bos_score: r.scores.bosConfirmation,
    compression_score: r.scores.compressionQuality,
    hl_score: r.scores.higherLowQuality,
    rs_score: r.scores.rsTrajectory,
    volume_score: r.scores.volumeProfile,
    state: r.state,
    alert_state: r.alertState,
    trigger_level: r.triggerLevel,
    invalidation: r.invalidationLevel,
    is_primary: r.isPrimarySignal,
    is_stronger: r.isStrongerSignal,
    bullish_evidence: r.bullishEvidence,
    caution_evidence: r.cautionEvidence,
  };
}

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const startTime = Date.now();
    const searchParams = request.nextUrl.searchParams;

    // Build universe: SP500 union NDX100 union ADDITIONAL (deduplicated)
    const universe = [...new Set([...SP500_MEMBERS, ...NDX100_MEMBERS, ...ADDITIONAL_MEMBERS])];
    const today = new Date().toISOString().slice(0, 10);

    // Clear today's data if requested (for full re-scan)
    let cleared = 0;
    if (searchParams.get("clear") === "true") {
      cleared = await clearTransitionDaily(today);
    }

    // Pre-warm sector ETF cache + load historically-scored tickers
    const [, scoredTickers] = await Promise.all([
      prefetchSectorETFs(),
      loadAllScoredTickers(),
    ]);
    const hasHistory = scoredTickers.size > 50;

    const qualifying: TransitionResult[] = [];
    let pendingRecords: TransitionDailyRecord[] = [];
    let totalPersisted = 0;
    let fetchedCount = 0;

    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      // Time guard — leave 40s for final persist + response
      if (Date.now() - startTime > 260_000) break;

      const batch = universe.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          // Persistent non-scorer gate: skip tickers never seen in any scanner
          if (hasHistory && !scoredTickers.has(ticker)) return null;
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          if (!passesUniverseQualityGates(data, ticker)) return null;

          // Fetch 3mo daily chart for market structure analysis
          // This is the same chart already cached by fetchPreRunData
          const chart = await fetchYahooChart(ticker, "3mo", "1d");
          if (!chart || chart.closes.length < 30) {
            // Fall back to scoring without OHLC structure
            return scoreTransitionWithOHLC(data, [], [], [], 3);
          }

          return scoreTransitionWithOHLC(
            data,
            chart.highs,
            chart.lows,
            chart.closes,
            3, // 3-bar pivot confirmation
          );
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          fetchedCount++;
          const result = r.value;

          // Skip gate failures, MARKDOWN (no signal), and low scores
          if (!result.gates.allPass) continue;
          if (result.state === "MARKDOWN") continue;
          if (result.scores.overallScore < 25) continue;

          qualifying.push(result);
          pendingRecords.push(resultToRecord(result, today));
        }
      }

      // Incremental persist
      if (pendingRecords.length >= PERSIST_INTERVAL) {
        const n = await upsertTransitionDaily(pendingRecords).catch((err) => {
          console.error("[transition-daily] incremental persist error:", err);
          return 0;
        });
        totalPersisted += n;
        pendingRecords = [];
      }

      if (i + BATCH_SIZE < universe.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // Flush remaining
    if (pendingRecords.length > 0) {
      const n = await upsertTransitionDaily(pendingRecords).catch((err) => {
        console.error("[transition-daily] flush persist error:", err);
        return 0;
      });
      totalPersisted += n;
    }

    // Sort by overall score
    qualifying.sort((a, b) => b.scores.overallScore - a.scores.overallScore);

    // Purge old data
    const purged = await purgeOldTransitionDaily(14).catch(() => 0);

    // Determine "new today"
    let newTickers: string[] = [];
    try {
      const { loadTransitionDailyDates, loadTransitionDaily } = await import("@/lib/supabase/persistence");
      const dates = await loadTransitionDailyDates(2);
      const yesterday = dates.find((d) => d !== today);
      if (yesterday) {
        const prevResults = await loadTransitionDaily(yesterday);
        const prevTickers = new Set(prevResults.map((r) => r.ticker));
        newTickers = qualifying
          .map((r) => r.data.ticker)
          .filter((t) => !prevTickers.has(t));
      } else {
        newTickers = qualifying.map((r) => r.data.ticker);
      }
    } catch {
      // Non-critical
    }

    // State distribution
    const stateCounts: Record<string, number> = {};
    for (const r of qualifying) {
      stateCounts[r.state] = (stateCounts[r.state] ?? 0) + 1;
    }

    const alertCounts: Record<string, number> = {};
    for (const r of qualifying) {
      alertCounts[r.alertState] = (alertCounts[r.alertState] ?? 0) + 1;
    }

    return NextResponse.json({
      scannedCount: universe.length,
      clearedCount: cleared,
      fetchedCount,
      qualifyingCount: qualifying.length,
      persistedCount: totalPersisted,
      purgedCount: purged,
      newTodayCount: newTickers.length,
      elapsedMs: Date.now() - startTime,
      stateCounts,
      alertCounts,
      primary: qualifying.filter((r) => r.isPrimarySignal).length,
      stronger: qualifying.filter((r) => r.isStrongerSignal).length,
    });
  } catch (err) {
    logError("api/transition/cron/daily", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
