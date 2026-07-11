import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { fetchPreRunData, prefetchSectorETFs } from "@/lib/prerun/data";
import { scoreVCP } from "@/lib/prerun/vcp-scoring";
import { passesUniverseQualityGates } from "@/lib/prerun/scoring";
import { SP500_MEMBERS, NDX100_MEMBERS, ADDITIONAL_MEMBERS } from "@/data/index-tiers";
import { getSectorForTicker } from "@/data/prerun-universe";

import {
  upsertVCPDaily,
  purgeOldVCPDaily,
  loadVCPDailyDates,
  loadVCPDaily,
  loadAllScoredTickers,
} from "@/lib/supabase/persistence";
import type { VCPDailyRecord } from "@/lib/supabase/persistence";
import type { VCPResult } from "@/lib/prerun/types";

export const maxDuration = 300;

const BATCH_SIZE = 10;
const BATCH_DELAY = 1100;
const PERSIST_INTERVAL = 50;

function resultToRecord(r: VCPResult, scanDate: string): VCPDailyRecord {
  return {
    scan_date: scanDate,
    ticker: r.data.ticker,
    company_name: r.data.companyName,
    sector: getSectorForTicker(r.data.ticker),
    price: r.data.currentPrice ?? 0,
    total_score: r.scores.totalScore,
    trend_score: r.scores.trendScore,
    volume_score: r.scores.volumeScore,
    compression_score: r.scores.compressionScore,
    rel_strength_score: r.scores.relStrengthScore,
    risk_quality_score: r.scores.riskQualityScore,
    phase: r.phase,
    pivot_high: r.data.vcpPivotHigh,
    atr_pct: r.data.vcpAtrPct,
    dist_from_sma50_pct: r.data.vcpDistFromSma50Pct,
    dry_volume_days: r.data.vcpDryVolumeDays,
    tight_closes: r.data.vcpTightCloses,
    inside_bar_count: r.data.vcpInsideBarCount,
    entry: r.riskCalc.entry,
    stop: r.riskCalc.stop,
    target_2r: r.riskCalc.target2R,
    target_3r: r.riskCalc.target3R,
    sma10_exit: r.riskCalc.sma10Exit,
  };
}

export async function GET(request: NextRequest) {
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

    const universe = [...new Set([...SP500_MEMBERS, ...NDX100_MEMBERS, ...ADDITIONAL_MEMBERS])];
    const today = new Date().toISOString().slice(0, 10);

    const [, scoredTickers] = await Promise.all([
      prefetchSectorETFs(),
      loadAllScoredTickers(),
    ]);
    const hasHistory = scoredTickers.size > 50;

    const qualifying: VCPDailyRecord[] = [];
    let pendingRecords: VCPDailyRecord[] = [];
    let totalPersisted = 0;
    let fetchedCount = 0;

    for (let i = 0; i < universe.length; i += BATCH_SIZE) {
      const batch = universe.slice(i, i + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (ticker) => {
          // Persistent non-scorer gate: skip tickers never seen in any scanner
          if (hasHistory && !scoredTickers.has(ticker)) return null;
          const data = await fetchPreRunData(ticker);
          if (!data) return null;
          if (!passesUniverseQualityGates(data, ticker)) return null;
          return scoreVCP(data);
        })
      );

      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          fetchedCount++;
          const result = r.value;

          // Skip if gates fail or phase is IGNORE
          if (!result.gates.allPass || result.phase === "IGNORE") continue;

          const record = resultToRecord(result, today);
          qualifying.push(record);
          pendingRecords.push(record);
        }
      }

      // Incremental persist
      if (pendingRecords.length >= PERSIST_INTERVAL) {
        const n = await upsertVCPDaily(pendingRecords).catch((err) => {
          console.error("[vcp-daily] incremental persist error:", err);
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
      const n = await upsertVCPDaily(pendingRecords).catch((err) => {
        console.error("[vcp-daily] flush persist error:", err);
        return 0;
      });
      totalPersisted += n;
    }

    // Purge old data
    const purged = await purgeOldVCPDaily(14).catch(() => 0);

    // Determine "new today"
    let newTickers: string[] = [];
    try {
      const dates = await loadVCPDailyDates(2);
      const yesterday = dates.find((d) => d !== today);
      if (yesterday) {
        const prevResults = await loadVCPDaily(yesterday);
        const prevTickers = new Set(prevResults.map((r) => r.ticker));
        newTickers = qualifying.map((r) => r.ticker).filter((t) => !prevTickers.has(t));
      } else {
        newTickers = qualifying.map((r) => r.ticker);
      }
    } catch {
      // Non-critical
    }

    let telegramSent = false;
    const timedOut = (Date.now() - startTime) > 240_000;

    return NextResponse.json({
      scannedCount: universe.length,
      fetchedCount,
      qualifyingCount: qualifying.length,
      persistedCount: totalPersisted,
      purgedCount: purged,
      newTodayCount: newTickers.length,
      telegramSent,
      timedOut,
      elapsedMs: Date.now() - startTime,
      phaseCounts: {
        focus_list: qualifying.filter((r) => r.phase === "FOCUS_LIST").length,
        watchlist_candidate: qualifying.filter((r) => r.phase === "WATCHLIST_CANDIDATE").length,
        early_setup: qualifying.filter((r) => r.phase === "EARLY_SETUP").length,
      },
    });
  } catch (err) {
    logError("api/vcp/cron/daily", err);
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
