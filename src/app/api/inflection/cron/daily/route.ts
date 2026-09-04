import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData, prefetchSectorETFs } from "@/lib/prerun/data";
import { scoreInflection } from "@/lib/prerun/inflection-scoring";
import { buildRegimeGate } from "@/lib/prerun/regime-gate";
import { fetchMacroRegime } from "@/lib/sector-rotation/regime";
import { passesUniverseQualityGates } from "@/lib/prerun/scoring";
import { skipAsNonScorer } from "@/lib/prerun/scan-gate";
import { buildScanUniverse } from "@/data/index-tiers";
import { getSectorForTicker } from "@/data/prerun-universe";

import {
  upsertInflectionDaily,
  purgeOldInflectionDaily,
  upsertComponentHistory,
  type ComponentHistoryRecord,
  clearInflectionDaily,
  loadAllScoredTickers,
} from "@/lib/supabase/persistence";
import type { InflectionDailyRecord } from "@/lib/supabase/persistence";
import type { InflectionResult } from "@/lib/prerun/types";

export const maxDuration = 300; // 5 minutes

// Matched to the Transition cron, which runs the SAME fetchPreRunData over the SAME
// universe at 15/500 and completes in 98-167s. At 10/1100 this route was taking 188-243s
// and hit the 240s time guard on 2026-08-18, truncating the scan to 333 of 464 tickers.
// Intermittent truncation puts holes in the dataset the backtest depends on.
const BATCH_SIZE = 15;
const BATCH_DELAY = 500;
const PERSIST_INTERVAL = 50;
/** Retention window. Long enough for the backtest to build a real sample. */
const RETENTION_DAYS = 90;
/** Rows below this score carry no signal and would still count as a confluence vote.
 *  Matches the Transition cron's floor. */
const MIN_OVERALL_SCORE = 25;

function resultToRecord(r: InflectionResult, scanDate: string): InflectionDailyRecord {
  return {
    scan_date: scanDate,
    ticker: r.data.ticker,
    company_name: r.data.companyName,
    sector: getSectorForTicker(r.data.ticker),
    price: r.data.currentPrice ?? 0,
    overall_score: r.scores.overallScore,
    se_score: r.scores.supplyExhaustion,
    vc_score: r.scores.compression,
    rs_score: r.scores.rsTrajectory,
    demand_score: r.scores.demandEmergence,
    runner_score: r.scores.runnerPotential,
    scanner_version: 3,
    stage: r.stage,
    trade_read: r.tradeRead,
    extension_risk: r.extensionRisk,
    is_coiled: r.isCoiledSignal,
    measured_pct: r.measuredPct,
    is_primary: r.isPrimarySignal,
    is_stronger: r.isStrongerSignal,
    bullish_evidence: r.bullishEvidence,
    caution_evidence: r.cautionEvidence,
    invalidation: r.invalidationLevel,
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

    // Build universe: SP500 union NDX100 (deduplicated)
    const universe = buildScanUniverse();
    const today = new Date().toISOString().slice(0, 10);

    // Clear today's data if requested (for full re-scan)
    let cleared = 0;
    if (searchParams.get("clear") === "true") {
      cleared = await clearInflectionDaily(today);
    }

    // Pre-warm sector ETF cache + load historically-scored tickers + macro regime.
    // Regime raises the signal-tier thresholds in a hostile tape; it does not change scores.
    const [, scoredTickers, macroRegime] = await Promise.all([
      prefetchSectorETFs(),
      loadAllScoredTickers(),
      fetchMacroRegime().catch(() => null),
    ]);
    const hasHistory = scoredTickers.size > 50;
    const regimeGate = buildRegimeGate(macroRegime?.regime ?? null, macroRegime?.regimeConfidence ?? 100);

    const qualifying: InflectionResult[] = [];
    let pendingRecords: InflectionDailyRecord[] = [];
    let totalPersisted = 0;
    let fetchedCount = 0;

    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > 240_000) break; // time guard

      const batch = universe.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          // Persistent non-scorer gate: skip tickers never seen in any scanner
          if (skipAsNonScorer(ticker, hasHistory, scoredTickers)) return null;
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          if (!passesUniverseQualityGates(data, ticker)) return null;
          return scoreInflection(data, regimeGate);
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          fetchedCount++;
          const result = r.value;

          // Skip gate failures and low scores. DISTRIBUTION is NOT skipped: the stage is
          // the answer, not a reason to discard the row. Dropping it made "no row" mean
          // both "never evaluated" and "evaluated and bearish", and it deleted the SE and
          // Demand series for exactly the phase that precedes seller exhaustion — so a
          // name only became visible after it had already left the bottom. The row is
          // labelled trade_read=AVOID by determineTradeRead and the nightly summary
          // already filters those out of confluence, so nothing downstream is polluted.
          if (!result.gates.allPass) continue;
          if (result.scores.overallScore < MIN_OVERALL_SCORE) continue;

          qualifying.push(result);
          pendingRecords.push(resultToRecord(result, today));
        }
      }

      // Incremental persist every PERSIST_INTERVAL results
      if (pendingRecords.length >= PERSIST_INTERVAL) {
        const n = await upsertInflectionDaily(pendingRecords).catch((err) => {
          console.error("[inflection-daily] incremental persist error:", err);
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
      const n = await upsertInflectionDaily(pendingRecords).catch((err) => {
        console.error("[inflection-daily] flush persist error:", err);
        return 0;
      });
      totalPersisted += n;
    }

    // Sort by overall score
    qualifying.sort((a, b) => b.scores.overallScore - a.scores.overallScore);

    // Purge old data
    // 90 days, not 14. At 14 the table held ~10 scan dates on a Tue-Sat schedule and the
    // window slid forward daily, so the backtest could never accumulate a sample no matter
    // how long it ran. 90 days is ~65 scan dates at ~200 rows: trivial for Postgres.
    // Archive the component scores before the purge window can ever reach them. The scan
    // table keeps 90 days, which is plenty for the pages; this keeps the score series
    // permanently, because the trend of a component is the thing a single scan cannot
    // show. Best-effort by design — upsertComponentHistory swallows its own errors, so a
    // missing table or a transient failure cannot cost us the scan we just ran.
    const archived = await upsertComponentHistory(
      qualifying.map((r): ComponentHistoryRecord => ({
        scan_date: today,
        engine: "inflection",
        ticker: r.data.ticker,
        sector: getSectorForTicker(r.data.ticker),
        price: r.data.currentPrice ?? 0,
        se_score: r.scores.supplyExhaustion,
        demand_score: r.scores.demandEmergence,
        compression_score: r.scores.compression,
        runner_score: r.scores.runnerPotential,
        rs_score: r.scores.rsTrajectory,
        overall_score: r.scores.overallScore,
        structure_score: null,
        label: r.stage,
        read_label: r.tradeRead,
        is_coiled: r.isCoiledSignal,
        is_primary: r.isPrimarySignal,
        is_stronger: r.isStrongerSignal,
        extension_risk: r.extensionRisk,
        scanner_version: 3,
      })),
    );

    const purged = await purgeOldInflectionDaily(RETENTION_DAYS).catch(() => 0);

    // Determine "new today" — tickers not in yesterday's results
    // Load yesterday's tickers from Supabase for comparison
    let newTickers: string[] = [];
    try {
      const { loadInflectionDailyDates, loadInflectionDaily } = await import("@/lib/supabase/persistence");
      const dates = await loadInflectionDailyDates(2);
      const yesterday = dates.find((d) => d !== today);
      if (yesterday) {
        const prevResults = await loadInflectionDaily(yesterday);
        const prevTickers = new Set(prevResults.map((r) => r.ticker));
        newTickers = qualifying
          .map((r) => r.data.ticker)
          .filter((t) => !prevTickers.has(t));
      } else {
        // First run — all are new
        newTickers = qualifying.map((r) => r.data.ticker);
      }
    } catch {
      // Non-critical
    }

    const timedOut = (Date.now() - startTime) > 240_000;

    return NextResponse.json({
      scannedCount: universe.length,
      clearedCount: cleared,
      regime: macroRegime?.regime ?? null,
      regimeScorePenalty: regimeGate.scorePenalty,
      fetchedCount,
      qualifyingCount: qualifying.length,
      persistedCount: totalPersisted,
      archivedCount: archived,
      purgedCount: purged,
      newTodayCount: newTickers.length,
      timedOut,
      elapsedMs: Date.now() - startTime,
      starters: qualifying.filter((r) => r.tradeRead === "STARTER_POSITION_CANDIDATE").length,
      addOns: qualifying.filter((r) => r.tradeRead === "ADD_ON_CONFIRMATION").length,
      watchers: qualifying.filter((r) => r.tradeRead === "WATCH").length,
    });
  } catch (err) {
    logError("api/inflection/cron/daily", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
