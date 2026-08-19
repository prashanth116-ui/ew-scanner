import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData, prefetchSectorETFs, fetchYahooChart } from "@/lib/prerun/data";
import { scoreTransitionWithOHLC } from "@/lib/prerun/transition-scoring";
import { buildRegimeGate } from "@/lib/prerun/regime-gate";
import { fetchMacroRegime } from "@/lib/sector-rotation/regime";
import { passesUniverseQualityGates } from "@/lib/prerun/scoring";
import { skipAsNonScorer } from "@/lib/prerun/scan-gate";
import { buildScanUniverse } from "@/data/index-tiers";
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
/** Retention window. At 14 days the table held ~10 scan dates on a Tue-Sat schedule and the
 *  window slid forward daily, so the backtest could never accumulate a sample no matter how
 *  long it ran. 90 days is ~65 scan dates at ~200 rows: trivial for Postgres. */
const RETENTION_DAYS = 90;

function resultToRecord(r: TransitionResult, scanDate: string): TransitionDailyRecord {
  return {
    scan_date: scanDate,
    ticker: r.data.ticker,
    company_name: r.data.companyName,
    sector: getSectorForTicker(r.data.ticker),
    price: r.data.currentPrice ?? 0,
    overall_score: r.scores.overallScore,
    se_score: r.scores.supplyExhaustion,
    compression_score: r.scores.compression,
    rs_score: r.scores.rsTrajectory,
    structure_score: r.scores.structure,
    demand_score: r.scores.demandEmergence,
    runner_score: r.scores.runnerPotential,
    state: r.state,
    alert_state: r.alertState,
    trigger_level: r.triggerLevel,
    invalidation: r.invalidationLevel,
    is_primary: r.isPrimarySignal,
    is_stronger: r.isStrongerSignal,
    extension_risk: r.extensionRisk,
    structure_available: r.structureAvailable,
    is_coiled: r.isCoiledSignal,
    measured_pct: r.measuredPct,
    scanner_version: 3,
    bullish_evidence: r.bullishEvidence,
    caution_evidence: r.cautionEvidence,
    component_slots: r.componentSlots,
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
    const universe = buildScanUniverse();
    const today = new Date().toISOString().slice(0, 10);

    // Clear today's data if requested (for full re-scan)
    let cleared = 0;
    if (searchParams.get("clear") === "true") {
      cleared = await clearTransitionDaily(today);
    }

    // Pre-warm sector ETF cache + load historically-scored tickers + macro regime.
    // Regime raises the alert-tier thresholds in a hostile tape; it does not change scores.
    const [, scoredTickers, macroRegime] = await Promise.all([
      prefetchSectorETFs(),
      loadAllScoredTickers(),
      fetchMacroRegime().catch(() => null),
    ]);
    const hasHistory = scoredTickers.size > 50;
    const regimeGate = buildRegimeGate(macroRegime?.regime ?? null, macroRegime?.regimeConfidence ?? 100);

    const qualifying: TransitionResult[] = [];
    let pendingRecords: TransitionDailyRecord[] = [];
    let totalPersisted = 0;
    let fetchedCount = 0;

    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      // Time guard — leave 60s for final persist + response
      if (Date.now() - startTime > 240_000) break;

      const batch = universe.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          // Persistent non-scorer gate: skip tickers never seen in any scanner
          if (skipAsNonScorer(ticker, hasHistory, scoredTickers)) return null;
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          if (!passesUniverseQualityGates(data, ticker)) return null;

          // Fetch 3mo daily chart for market structure analysis
          // This is the same chart already cached by fetchPreRunData
          const chart = await fetchYahooChart(ticker, "3mo", "1d");
          if (!chart) {
            // Scores without structure and flags the row via structureAvailable
            return scoreTransitionWithOHLC(data, [], [], [], [], 3, regimeGate);
          }

          return scoreTransitionWithOHLC(
            data,
            chart.highs,
            chart.lows,
            chart.closes,
            chart.volumes,
            3, // 3-bar pivot confirmation
            regimeGate,
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
    const purged = await purgeOldTransitionDaily(RETENTION_DAYS).catch(() => 0);

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
      regime: macroRegime?.regime ?? null,
      regimeScorePenalty: regimeGate.scorePenalty,
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
